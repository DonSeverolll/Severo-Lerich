import { completeWithFallback } from './llm';
import { hasSystemTools } from './platform';
import { useApp } from './store';
import { TOOL_MAP, TOOL_SCHEMAS, ToolFailure, type ToolContext } from './tools';
import type { StoredMessage, ToolCall } from './types';

let homeDirCache = '';
async function homeDir(): Promise<string> {
  if (!homeDirCache && hasSystemTools) {
    const { homeDir: get } = await import('@tauri-apps/api/path');
    homeDirCache = (await get()).replace(/[\\/]+$/, '');
  }
  return homeDirCache;
}

export async function defaultWorkingDir(): Promise<string> {
  return (await homeDir()) || '';
}

function systemPrompt(agent: boolean, cwd: string): string {
  const date = new Date().toLocaleDateString('pt-BR', { dateStyle: 'full' });
  const base = `Você é o Severo, um assistente de IA pessoal, elegante e objetivo. Data: ${date}.
Responda no idioma do usuário (padrão: português do Brasil), em Markdown conciso. Não invente fatos; diga quando não souber.`;
  if (!agent) return `${base}\nVocê está em modo conversa: não tem acesso ao computador do usuário.`;
  return `${base}

Você roda no PC Windows do usuário e tem ferramentas reais: PowerShell (execute_command), leitura/escrita/edição de arquivos, listagem e busca.
Diretório de trabalho: ${cwd}

Como trabalhar (ciclo ReAct):
1. Entenda o objetivo; se for amplo, quebre em passos e siga até concluir.
2. Investigue antes de agir (list_directory, file_search, read_file) em vez de supor.
3. Use edit_file_diff para mudanças pontuais e write_file para arquivos novos.
4. Observe cada resultado; se falhar, leia o erro, corrija e tente de novo.
5. Valide o que alterou quando fizer sentido. Ao final, resuma o que foi feito.

Regras: cada comando é um processo novo (\`cd\` não persiste; use o parâmetro cwd); sem stdin; nada destrutivo fora do pedido
(apagar pastas, alterar sistema, git push --force) sem pedido explícito; se o usuário negar uma ação, não a repita.
Para perguntas simples que não exigem o computador, apenas responda.`;
}

function truncateMiddle(text: string, max = 30_000): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.6);
  return `${text.slice(0, head)}\n…[${text.length - max} caracteres omitidos]…\n${text.slice(-(max - head))}`;
}

let controller: AbortController | null = null;

export function stopAgent(): void {
  controller?.abort(new Error('Interrompido pelo usuário'));
  const pending = useApp.getState().pendingApproval;
  pending?.resolve('no');
}

/**
 * Loop ReAct: envia a conversa ao LLM (com fallback entre provedores); se vierem tool_calls,
 * pede aprovação quando necessário, executa, anexa `role: tool` e repete até a resposta final.
 */
export async function runTurn(text: string, opts: { voice?: boolean } = {}): Promise<string | null> {
  const app = useApp.getState();
  if (app.busy) return null;
  const conversationId = app.activeId && app.conversations.some((c) => c.id === app.activeId) ? app.activeId : app.newConversation();

  app.appendMessage(conversationId, { role: 'user', content: text, voice: opts.voice });
  controller = new AbortController();
  const signal = controller.signal;
  app.set({ busy: true, orb: 'thinking', streamingText: '', activeProvider: null });

  const settings = useApp.getState().settings;
  const agentOn = hasSystemTools && settings.agentEnabled;
  const cwd = settings.workingDir || (await defaultWorkingDir());
  let autoApproveSession = settings.autoApprove;
  let finalText: string | null = null;

  try {
    for (let step = 0; step < settings.maxIterations; step++) {
      const conv = useApp.getState().conversations.find((c) => c.id === conversationId);
      if (!conv) return null;
      const history: StoredMessage[] = [{ role: 'system', content: systemPrompt(agentOn, cwd) }, ...conv.messages];

      let streamed = '';
      const result = await completeWithFallback(
        useApp.getState().settings.providers,
        history,
        agentOn ? TOOL_SCHEMAS : [],
        {
          onAttempt: (p) => useApp.getState().set({ activeProvider: p.name }),
          onToken: (t) => {
            streamed += t;
            useApp.getState().set({ streamingText: streamed, orb: 'speaking' });
          },
          onDiscard: () => {
            streamed = '';
            useApp.getState().set({ streamingText: '', orb: 'thinking' });
          },
        },
        signal,
        settings.temperature,
      );

      useApp.getState().set({ streamingText: '' });
      useApp.getState().appendMessage(conversationId, { ...result.message, provider: result.provider });
      const calls = result.message.tool_calls ?? [];
      if (!calls.length) {
        finalText = result.message.content ?? '';
        break;
      }

      useApp.getState().set({ orb: 'thinking' });
      for (const call of calls) {
        const output = signal.aborted
          ? 'Cancelado: o usuário interrompeu antes desta ferramenta rodar.'
          : await runToolCall(conversationId, call, { cwd, signal, autoApprove: autoApproveSession, onAlways: () => (autoApproveSession = true) });
        useApp.getState().appendMessage(conversationId, { role: 'tool', tool_call_id: call.id, content: truncateMiddle(output) });
      }
      if (signal.aborted) throw signal.reason;
      if (step === settings.maxIterations - 1) {
        useApp.getState().appendMessage(conversationId, {
          role: 'assistant',
          content: `_Limite de ${settings.maxIterations} passos atingido. Envie "continue" para prosseguir._`,
        });
      }
    }
    useApp.getState().set({ orb: 'idle' });
    return finalText;
  } catch (err) {
    const aborted = signal.aborted;
    useApp.getState().appendMessage(conversationId, {
      role: 'assistant',
      content: aborted ? '_Interrompido._' : `**Erro:** ${(err as Error).message}`,
      provider: 'sistema',
    });
    useApp.getState().set({ orb: aborted ? 'idle' : 'error' });
    if (!aborted) setTimeout(() => useApp.getState().orb === 'error' && useApp.getState().set({ orb: 'idle' }), 2500);
    return null;
  } finally {
    controller = null;
    useApp.getState().set({ busy: false, streamingText: '', pendingApproval: null });
  }
}

async function runToolCall(
  conversationId: string,
  call: ToolCall,
  o: { cwd: string; signal: AbortSignal; autoApprove: boolean; onAlways: () => void },
): Promise<string> {
  const app = useApp.getState();
  const setRun = (patch: Parameters<typeof app.setToolRun>[2]) => useApp.getState().setToolRun(conversationId, call.id, patch);
  const tool = TOOL_MAP.get(call.function.name);
  if (!tool) {
    setRun({ status: 'error', output: 'ferramenta desconhecida' });
    return `Erro: ferramenta "${call.function.name}" não existe. Disponíveis: ${[...TOOL_MAP.keys()].join(', ')}.`;
  }

  let args: any;
  try {
    args = call.function.arguments.trim() ? JSON.parse(call.function.arguments) : {};
    if (typeof args !== 'object' || args === null || Array.isArray(args)) throw new Error('esperado um objeto JSON');
  } catch (e) {
    setRun({ status: 'error', output: 'argumentos inválidos' });
    return `Erro: argumentos inválidos (${(e as Error).message}). Reenvie com JSON correto.`;
  }

  const settings = useApp.getState().settings;
  let output = '';
  const ctx: ToolContext = {
    cwd: o.cwd,
    home: await homeDir(),
    shell: settings.shell,
    commandTimeoutMs: settings.commandTimeoutSec * 1000,
    signal: o.signal,
    onOutput: (chunk) => {
      output = (output + chunk).slice(-20_000);
      setRun({ output });
    },
  };

  if (tool.requiresApproval && !o.autoApprove) {
    let preview;
    try {
      // Valida a ação (ex.: trecho do edit existe) antes de incomodar o usuário.
      preview = tool.preview ? await tool.preview(args, ctx) : undefined;
    } catch (e) {
      setRun({ status: 'error', output: (e as Error).message });
      return `Erro: ${(e as Error).message}`;
    }
    setRun({ status: 'pending' });
    useApp.getState().set({ orb: 'idle' });
    const answer = await new Promise<'yes' | 'no' | 'always'>((resolve) =>
      useApp.getState().set({ pendingApproval: { conversationId, callId: call.id, preview, resolve } }),
    );
    useApp.getState().set({ pendingApproval: null, orb: 'thinking' });
    if (answer === 'no') {
      setRun({ status: 'denied' });
      return 'O usuário NEGOU esta ação. Não a repita; escolha outra abordagem ou pergunte ao usuário.';
    }
    if (answer === 'always') o.onAlways();
  }

  const started = Date.now();
  setRun({ status: 'running', startedAt: started });
  try {
    const result = await tool.execute(args, ctx);
    setRun({ status: 'success', latencyMs: Date.now() - started });
    return result;
  } catch (e) {
    setRun({ status: 'error', latencyMs: Date.now() - started, output: output || (e as Error).message });
    if (e instanceof ToolFailure) return e.message;
    return `Erro ao executar ${tool.name}: ${(e as Error).message}`;
  }
}
