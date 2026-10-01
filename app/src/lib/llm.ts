import { httpFetch } from './platform';
import { DEFAULT_PROVIDERS, splitKeys } from './providers';
import type { ChatMessage, Provider, StoredMessage, ToolCall, ToolSchema } from './types';

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export interface StreamCallbacks {
  /** Um provedor/chave vai ser tentado. */
  onAttempt?: (provider: Provider) => void;
  onToken?: (text: string) => void;
  /** A tentativa falhou depois de já ter emitido tokens: a UI deve descartar o texto parcial. */
  onDiscard?: () => void;
}

export interface CompletionOut {
  message: Extract<ChatMessage, { role: 'assistant' }>;
  provider: string;
  finishReason: string | null;
}

const IDLE_TIMEOUT_MS = 60_000;
const BUILTIN_IDS = new Set(DEFAULT_PROVIDERS.map((p) => p.id));

/** chave `${provider}:${índice da chave}` → instante até quando evitar (após 429/5xx). */
const cooldowns = new Map<string, number>();

function newToolCallId(): string {
  // 9 caracteres alfanuméricos: formato aceito por todos, inclusive Mistral (que rejeita outros formatos).
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 9; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function toWire(messages: StoredMessage[]): ChatMessage[] {
  return messages.map((m) => {
    switch (m.role) {
      case 'assistant':
        return m.tool_calls?.length
          ? { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls }
          : { role: 'assistant', content: m.content ?? '' };
      case 'tool':
        return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
      default:
        return { role: m.role, content: m.content };
    }
  });
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Envia a conversa ao primeiro provedor disponível; em qualquer falha (sem chave, limite, erro,
 * modelo inexistente) passa para o próximo — mesma lógica do llm_fallback.py, agora com streaming
 * e tool calling. Chaves em espera por limite vão para o fim da fila em vez de serem descartadas.
 */
export async function completeWithFallback(
  providers: Provider[],
  messages: StoredMessage[],
  tools: ToolSchema[],
  cb: StreamCallbacks,
  signal: AbortSignal,
  temperature?: number,
): Promise<CompletionOut> {
  const now = Date.now();
  const ready: { p: Provider; key: string; ck: string }[] = [];
  const cooling: typeof ready = [];
  const errors: string[] = [];

  for (const p of providers) {
    if (!p.enabled) continue;
    let keys = splitKeys(p.apiKey);
    if (!keys.length) {
      // Provedores personalizados (ex.: Ollama local) podem não exigir chave.
      if (BUILTIN_IDS.has(p.id)) {
        errors.push(`${p.name}: sem chave`);
        continue;
      }
      keys = [''];
    }
    keys.forEach((key, i) => {
      const ck = `${p.id}:${i}`;
      ((cooldowns.get(ck) ?? 0) > now ? cooling : ready).push({ p, key, ck });
    });
  }

  const queue = [...ready, ...cooling];
  if (!queue.length) {
    throw new Error('Nenhum provedor configurado. Abra Configurações e informe ao menos uma chave de API.');
  }

  const wire = toWire(messages);
  for (const { p, key, ck } of queue) {
    cb.onAttempt?.(p);
    let emitted = false;
    try {
      const out = await streamOnce(p, key, wire, tools, (t) => {
        emitted = true;
        cb.onToken?.(t);
      }, signal, temperature);
      cooldowns.delete(ck);
      return { ...out, provider: p.name };
    } catch (err) {
      if (signal.aborted) throw err;
      if (emitted) cb.onDiscard?.();
      const e = err as ProviderError;
      if (e.status === 429) cooldowns.set(ck, Date.now() + (e.retryAfterMs ?? 60_000));
      else if (e.status === undefined || e.status >= 500) cooldowns.set(ck, Date.now() + 15_000);
      errors.push(`${p.name}: ${errorText(err).slice(0, 200)}`);
    }
  }
  throw new Error(`Todos os provedores falharam:\n- ${errors.join('\n- ')}`);
}

async function streamOnce(
  provider: Provider,
  key: string,
  messages: ChatMessage[],
  tools: ToolSchema[],
  onToken: (t: string) => void,
  signal: AbortSignal,
  temperature?: number,
): Promise<Omit<CompletionOut, 'provider'>> {
  const idle = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle.abort(new ProviderError('sem resposta por 60s')), IDLE_TIMEOUT_MS);
  };
  const combined = AbortSignal.any([signal, idle.signal]);

  const body: Record<string, unknown> = { model: provider.model, messages, stream: true };
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  if (temperature !== undefined) body.temperature = temperature;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'X-Title': 'Severo',
    'HTTP-Referer': 'https://github.com/DonSeverolll/Severo-Lerich',
  };
  if (key) headers.Authorization = `Bearer ${key}`;

  touch();
  try {
    const res = await httpFetch(`${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: combined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const retry = Number(res.headers.get('retry-after'));
      throw new ProviderError(
        `HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`,
        res.status,
        Number.isFinite(retry) && retry > 0 ? retry * 1000 : undefined,
      );
    }
    if (!res.body || (res.headers.get('content-type') ?? '').includes('application/json')) {
      return parseJson(await res.json(), onToken);
    }
    return await readSse(res.body, onToken, touch);
  } catch (err) {
    if (idle.signal.aborted && !signal.aborted) throw idle.signal.reason;
    if (err instanceof ProviderError || signal.aborted) throw err;
    throw new ProviderError(`falha de conexão: ${errorText(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function finalize(content: string, calls: { name: string; args: string }[], finishReason: string | null): Omit<CompletionOut, 'provider'> {
  const toolCalls: ToolCall[] = calls
    .filter((c) => c?.name)
    .map((c) => ({ id: newToolCallId(), type: 'function', function: { name: c.name, arguments: c.args || '{}' } }));
  if (!content && !toolCalls.length && finishReason === null) {
    throw new ProviderError('resposta vazia (stream interrompido)');
  }
  return {
    message: toolCalls.length ? { role: 'assistant', content: content || null, tool_calls: toolCalls } : { role: 'assistant', content },
    finishReason,
  };
}

function parseJson(data: any, onToken: (t: string) => void): Omit<CompletionOut, 'provider'> {
  if (data?.error) throw new ProviderError(`erro do provedor: ${JSON.stringify(data.error).slice(0, 300)}`, 502);
  const choice = data?.choices?.[0];
  const content: string = typeof choice?.message?.content === 'string' ? choice.message.content : '';
  if (content) onToken(content);
  const calls = (choice?.message?.tool_calls ?? []).map((tc: any) => ({ name: tc.function?.name ?? '', args: tc.function?.arguments ?? '' }));
  return finalize(content, calls, choice?.finish_reason ?? null);
}

async function readSse(stream: ReadableStream<Uint8Array>, onToken: (t: string) => void, onActivity: () => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const calls: { name: string; args: string }[] = [];
  let buffer = '';
  let content = '';
  let finishReason: string | null = null;
  let done = false;

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
        continue;
      }
      if (chunk.error) {
        const code = Number(chunk.error.code ?? chunk.error.status);
        throw new ProviderError(`erro no stream: ${chunk.error.message ?? JSON.stringify(chunk.error)}`, Number.isInteger(code) && code >= 400 ? code : 502);
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};
      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content;
        onToken(delta.content);
      }
      for (const tc of delta.tool_calls ?? []) {
        let i: number = typeof tc.index === 'number' ? tc.index : tc.id ? calls.length : calls.length - 1;
        if (i < 0) i = 0;
        calls[i] ??= { name: '', args: '' };
        const name: string | undefined = tc.function?.name;
        if (name && calls[i].name !== name) calls[i].name += name;
        if (tc.function?.arguments) calls[i].args += tc.function.arguments;
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
  }
  if (done) reader.cancel().catch(() => {});
  return finalize(content, calls, finishReason);
}
