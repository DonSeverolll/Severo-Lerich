import type { Config } from '../config.js';
import type { ChatMessage, CompletionResult, ToolCall, ToolSchema, Usage } from './types.js';

/** Erro HTTP do gateway; `status` decide se vale tentar com outra chave. */
export class LLMHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LLMHttpError';
  }
}

export interface RetryInfo {
  attempt: number;
  maxAttempts: number;
  reason: string;
  keyLabel: string;
  waitMs: number;
}

export interface StreamHandlers {
  onToken?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolCallName?: (index: number, name: string) => void;
  onRetry?: (info: RetryInfo) => void;
}

interface KeyState {
  key: string;
  label: string;
  cooldownUntil: number;
  failures: number;
  disabled: boolean;
}

const RETRIABLE_STATUS = new Set([408, 409, 425, 429]);

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function backoffMs(failures: number): number {
  const base = Math.min(30_000, 1_000 * 2 ** (failures - 1));
  return base + Math.floor(Math.random() * 250);
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Cliente Chat Completions (formato OpenAI) com:
 * - rotação automática de chaves em 429 / 5xx / timeout / falha de rede (cooldown por chave);
 * - desativação de chaves rejeitadas (401/403);
 * - streaming SSE de tokens e montagem incremental de tool_calls.
 */
export class LLMClient {
  private readonly keys: KeyState[];
  private current = 0;

  constructor(private readonly config: Config) {
    const raw = config.apiKeys.length ? config.apiKeys : [''];
    this.keys = raw.map((key, i) => ({
      key,
      label: key ? `chave #${i + 1} (…${key.slice(-4)})` : 'sem chave',
      cooldownUntil: 0,
      failures: 0,
      disabled: false,
    }));
  }

  get keyCount(): number {
    return this.keys.length;
  }

  async complete(
    messages: ChatMessage[],
    tools: ToolSchema[],
    handlers: StreamHandlers = {},
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      stream: this.config.stream,
    };
    if (tools.length) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }
    if (this.config.temperature !== undefined) body.temperature = this.config.temperature;

    const maxAttempts = Math.max(this.config.maxRetries, this.keys.length * 2);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const key = await this.acquireKey(signal);
      try {
        const result = await this.request(key, body, handlers, signal);
        key.failures = 0;
        return result;
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = err;
        if (!this.penalize(key, err) || attempt === maxAttempts) break;
        // Avança para a próxima chave da fila.
        this.current = (this.keys.indexOf(key) + 1) % this.keys.length;
        handlers.onRetry?.({
          attempt,
          maxAttempts,
          reason: errorMessage(err),
          keyLabel: key.label,
          waitMs: this.nextAvailableInMs(),
        });
      }
    }
    if (lastError instanceof LLMHttpError && !RETRIABLE_STATUS.has(lastError.status) && lastError.status < 500) {
      throw lastError;
    }
    throw new Error(`Gateway falhou após as tentativas disponíveis: ${errorMessage(lastError)}`);
  }

  /** Aplica cooldown/desativação na chave. Retorna true se vale tentar novamente. */
  private penalize(key: KeyState, err: unknown): boolean {
    if (err instanceof LLMHttpError) {
      if (err.status === 401 || err.status === 403) {
        key.disabled = true;
        return this.keys.some((k) => !k.disabled);
      }
      if (RETRIABLE_STATUS.has(err.status) || err.status >= 500) {
        key.failures++;
        key.cooldownUntil = Date.now() + (err.retryAfterMs ?? backoffMs(key.failures));
        return true;
      }
      return false; // 400, 404, 422...: erro da requisição, trocar de chave não resolve
    }
    // Falha de rede, timeout de inatividade ou stream interrompido.
    key.failures++;
    key.cooldownUntil = Date.now() + backoffMs(key.failures);
    return true;
  }

  private nextAvailableInMs(): number {
    const now = Date.now();
    const waits = this.keys.filter((k) => !k.disabled).map((k) => k.cooldownUntil - now);
    return waits.length ? Math.max(0, Math.min(...waits)) : 0;
  }

  /** Escolhe a primeira chave ativa fora de cooldown a partir da atual; espera se todas estiverem em cooldown. */
  private async acquireKey(signal?: AbortSignal): Promise<KeyState> {
    for (;;) {
      if (!this.keys.some((k) => !k.disabled)) {
        throw new Error('Todas as chaves de API foram rejeitadas (401/403). Verifique LLM_API_KEYS.');
      }
      const now = Date.now();
      for (let i = 0; i < this.keys.length; i++) {
        const idx = (this.current + i) % this.keys.length;
        const key = this.keys[idx];
        if (!key.disabled && key.cooldownUntil <= now) {
          this.current = idx;
          return key;
        }
      }
      await sleep(Math.min(Math.max(this.nextAvailableInMs(), 50), 60_000), signal);
    }
  }

  private async request(
    key: KeyState,
    body: Record<string, unknown>,
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    // Timeout de inatividade: reiniciado a cada pedaço recebido, então respostas longas não são cortadas.
    const idle = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => idle.abort(new Error(`sem resposta do gateway por ${Math.round(this.config.requestTimeoutMs / 1000)}s`)),
        this.config.requestTimeoutMs,
      );
    };
    const combined = signal ? AbortSignal.any([signal, idle.signal]) : idle.signal;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: body.stream ? 'text/event-stream' : 'application/json',
      ...this.config.extraHeaders,
    };
    if (key.key) headers.Authorization = `Bearer ${key.key}`;

    touch();
    try {
      const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: combined,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new LLMHttpError(
          res.status,
          `HTTP ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 500)}` : ''}`,
          parseRetryAfter(res.headers.get('retry-after')),
        );
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (!body.stream || !res.body || contentType.includes('application/json')) {
        return this.parseJson(await res.json(), handlers);
      }
      return await this.readStream(res.body, handlers, touch);
    } catch (err) {
      if (idle.signal.aborted && !signal?.aborted) throw idle.signal.reason;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private parseJson(data: any, handlers: StreamHandlers): CompletionResult {
    if (data?.error) throw new LLMHttpError(502, `Erro do gateway: ${JSON.stringify(data.error).slice(0, 500)}`);
    const choice = data?.choices?.[0];
    if (!choice?.message) throw new Error('Resposta do gateway sem choices[0].message');
    const msg = choice.message;
    const content: string = typeof msg.content === 'string' ? msg.content : '';
    if (content) handlers.onToken?.(content);
    const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((tc: any, i: number) => ({
      id: tc.id || `call_${Date.now()}_${i}`,
      type: 'function',
      function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments || '{}' },
    }));
    toolCalls.forEach((tc, i) => handlers.onToolCallName?.(i, tc.function.name));
    return {
      message: toolCalls.length ? { role: 'assistant', content: content || null, tool_calls: toolCalls } : { role: 'assistant', content },
      finishReason: choice.finish_reason ?? null,
      usage: data.usage,
    };
  }

  private async readStream(
    stream: ReadableStream<Uint8Array>,
    handlers: StreamHandlers,
    onActivity: () => void,
  ): Promise<CompletionResult> {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    const calls: { id: string; name: string; args: string }[] = [];
    let buffer = '';
    let content = '';
    let finishReason: string | null = null;
    let usage: Usage | undefined;
    let done = false;

    try {
      while (!done) {
        const { value, done: eof } = await reader.read();
        if (eof) break;
        onActivity();
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).replace(/\r$/, '');
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          if (data === '[DONE]') {
            done = true;
            break;
          }

          let chunk: any;
          try {
            chunk = JSON.parse(data);
          } catch {
            continue; // linha parcial/inválida: ignora
          }
          if (chunk.error) {
            const code = Number(chunk.error.code ?? chunk.error.status);
            throw new LLMHttpError(
              Number.isInteger(code) && code >= 400 ? code : 502,
              `Erro no stream: ${chunk.error.message ?? JSON.stringify(chunk.error)}`,
            );
          }
          if (chunk.usage) usage = chunk.usage;

          const choice = chunk.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta ?? {};

          const reasoning = delta.reasoning_content ?? delta.reasoning;
          if (typeof reasoning === 'string' && reasoning) handlers.onReasoning?.(reasoning);

          if (typeof delta.content === 'string' && delta.content) {
            content += delta.content;
            handlers.onToken?.(delta.content);
          }

          for (const tc of delta.tool_calls ?? []) {
            let i: number = typeof tc.index === 'number' ? tc.index : tc.id ? calls.length : calls.length - 1;
            if (i < 0) i = 0;
            calls[i] ??= { id: '', name: '', args: '' };
            if (tc.id) calls[i].id = tc.id;
            const name: string | undefined = tc.function?.name;
            if (name && calls[i].name !== name) {
              calls[i].name += name;
              handlers.onToolCallName?.(i, calls[i].name);
            }
            if (tc.function?.arguments) calls[i].args += tc.function.arguments;
          }
          if (choice.finish_reason) finishReason = choice.finish_reason;
        }
      }
    } finally {
      if (done) await reader.cancel().catch(() => {});
    }

    const toolCalls: ToolCall[] = calls
      .filter((c) => c && c.name)
      .map((c, i) => ({
        id: c.id || `call_${Date.now()}_${i}`,
        type: 'function',
        function: { name: c.name, arguments: c.args || '{}' },
      }));

    if (!content && !toolCalls.length && finishReason === null) {
      throw new Error('stream encerrado sem conteúdo (resposta vazia ou conexão interrompida)');
    }

    return {
      message: toolCalls.length ? { role: 'assistant', content: content || null, tool_calls: toolCalls } : { role: 'assistant', content },
      finishReason,
      usage,
    };
  }
}
