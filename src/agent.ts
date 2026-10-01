import os from 'node:os';
import type { Config } from './config.js';
import type { LLMClient } from './llm/client.js';
import type { ChatMessage, ToolCall, Usage } from './llm/types.js';
import { toSchemas, type Tool, type ToolContext } from './tools/index.js';
import type { TerminalUI } from './ui/terminal.js';

function shellLabel(config: Config): string {
  switch (config.shell) {
    case 'powershell':
      return 'Windows PowerShell 5.1 (powershell.exe)';
    case 'pwsh':
      return 'PowerShell 7 (pwsh.exe)';
    case 'cmd':
      return 'CMD (cmd.exe)';
    case 'bash':
      return 'bash';
  }
}

export function buildSystemPrompt(config: Config): string {
  return `Você é o Severo, um agente autônomo de engenharia de software rodando localmente no computador do usuário por uma CLI.
Você tem acesso real ao sistema de arquivos e ao terminal por meio de ferramentas.

## Ambiente
- Sistema: ${os.type()} ${os.release()} (${process.platform}/${os.arch()})
- Shell de execute_command: ${shellLabel(config)}
- Diretório de trabalho: ${config.cwd}
- Usuário: ${os.userInfo().username}
- Data: ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'full' })}

## Como trabalhar (ciclo ReAct)
1. Entenda o objetivo. Se for amplo, quebre em passos e siga executando até concluir — não pare para pedir permissão a cada passo.
2. Investigue antes de agir: use list_directory, file_search e read_file em vez de supor o conteúdo de arquivos.
3. Aja com as ferramentas. Para mudanças pontuais use edit_file_diff (old_string idêntico ao arquivo); use write_file para arquivos novos ou reescritas completas.
4. Observe o resultado de cada ferramenta e decida o próximo passo. Se algo falhar, leia o erro, corrija e tente de novo.
5. Depois de alterar código, valide (build, testes, executar o script) quando fizer sentido.
6. Ao terminar, responda com um resumo curto e objetivo do que foi feito e de qualquer pendência.

## Regras
- Cada execute_command roda em um processo novo: \`cd\` não persiste; use o parâmetro \`cwd\`. Comandos não têm stdin — use flags não interativas.
- Processos longos (servidores, watchers) bloqueiam até o timeout: inicie-os em segundo plano (ex.: Start-Process) se precisar deles rodando.
- Se o usuário negar uma ação, não repita a mesma ação; ajuste o plano ou pergunte como prosseguir.
- Nunca faça ações destrutivas fora do escopo pedido (apagar pastas, formatar discos, alterar configurações do sistema, git push --force) sem pedido explícito.
- Não invente resultados: só afirme que algo funcionou se uma ferramenta confirmou.
- Responda no idioma do usuário (padrão: português do Brasil), em Markdown conciso.`;
}

function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.6);
  const tail = max - head;
  return `${text.slice(0, head)}\n\n…[${text.length - max} caracteres omitidos]…\n\n${text.slice(-tail)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class Agent {
  private messages: ChatMessage[] = [];
  private approveAllForSession = false;
  private readonly toolMap: Map<string, Tool>;
  private readonly schemas;
  readonly usage: Required<Usage> = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  constructor(
    private readonly config: Config,
    private readonly client: LLMClient,
    private readonly ui: TerminalUI,
    tools: Tool[],
  ) {
    this.toolMap = new Map(tools.map((t) => [t.name, t]));
    this.schemas = toSchemas(tools);
    this.reset();
  }

  get messageCount(): number {
    return this.messages.length;
  }

  reset(): void {
    this.messages = [{ role: 'system', content: buildSystemPrompt(this.config) }];
    this.approveAllForSession = false;
  }

  /** Atualiza o prompt de sistema (ex.: após /cd ou /modelo) sem perder o histórico. */
  refreshSystemPrompt(): void {
    this.messages[0] = { role: 'system', content: buildSystemPrompt(this.config) };
  }

  /** Executa o ciclo raciocínio → ferramenta → observação até o modelo responder sem tool_calls. */
  async run(goal: string, signal: AbortSignal): Promise<void> {
    this.messages.push({ role: 'user', content: goal });

    for (let step = 1; step <= this.config.maxIterations; step++) {
      if (signal.aborted) throw signal.reason;

      const spinner = this.ui.spinner(step === 1 ? 'Pensando…' : `Analisando resultados (passo ${step})…`);
      let md = this.ui.markdownStream();
      let streaming = false;
      let reasoning = false;

      const startText = () => {
        if (spinner.isSpinning) spinner.stop();
        if (!streaming) {
          streaming = true;
          this.ui.assistantStart();
        }
      };

      let result;
      try {
        result = await this.client.complete(
          this.messages,
          this.schemas,
          {
            onReasoning: (t) => {
              startText();
              reasoning = true;
              this.ui.reasoning(t);
            },
            onToken: (t) => {
              startText();
              if (reasoning) {
                reasoning = false;
                process.stdout.write('\n');
              }
              md.write(t);
            },
            onToolCallName: (_i, name) => {
              if (spinner.isSpinning) spinner.text = `Preparando ${name}…`;
            },
            onRetry: (info) => {
              if (streaming) {
                md.end();
                md = this.ui.markdownStream();
                streaming = false;
              }
              if (spinner.isSpinning) spinner.stop();
              this.ui.warn(
                `Gateway falhou com ${info.keyLabel} (${info.reason.slice(0, 160)}). ` +
                  `Rotacionando chave — tentativa ${info.attempt + 1}/${info.maxAttempts}` +
                  (info.waitMs > 0 ? `, aguardando ${(info.waitMs / 1000).toFixed(1)}s` : ''),
              );
              spinner.start('Tentando novamente…');
            },
          },
          signal,
        );
      } finally {
        if (spinner.isSpinning) spinner.stop();
        md.end();
      }

      if (result.usage) {
        this.usage.prompt_tokens += result.usage.prompt_tokens ?? 0;
        this.usage.completion_tokens += result.usage.completion_tokens ?? 0;
        this.usage.total_tokens += result.usage.total_tokens ?? 0;
      }

      this.messages.push(result.message);
      const calls = result.message.tool_calls ?? [];

      if (!calls.length) {
        if (result.finishReason === 'length') this.ui.warn('Resposta cortada pelo limite de tokens do modelo.');
        if (!result.message.content) this.ui.warn('O modelo encerrou sem resposta.');
        return;
      }

      for (let i = 0; i < calls.length; i++) {
        let output: string;
        if (signal.aborted) {
          output = 'Cancelado: o usuário interrompeu a execução antes desta ferramenta rodar.';
        } else {
          try {
            output = await this.runToolCall(calls[i], signal);
          } catch (err) {
            output = signal.aborted ? 'Cancelado pelo usuário durante a execução.' : `Erro: ${errorMessage(err)}`;
          }
        }
        // Toda tool_call precisa de uma resposta role:tool, mesmo cancelada, para o histórico continuar válido.
        this.messages.push({ role: 'tool', tool_call_id: calls[i].id, content: truncateMiddle(output, this.config.toolOutputMaxChars) });
      }
      if (signal.aborted) throw signal.reason;
    }

    this.ui.warn(`Limite de ${this.config.maxIterations} iterações atingido. Envie "continue" para prosseguir.`);
  }

  private async runToolCall(call: ToolCall, signal: AbortSignal): Promise<string> {
    const name = call.function.name;
    const tool = this.toolMap.get(name);
    if (!tool) {
      this.ui.toolError(`ferramenta desconhecida: ${name}`);
      return `Erro: ferramenta "${name}" não existe. Disponíveis: ${[...this.toolMap.keys()].join(', ')}.`;
    }

    let args: any;
    try {
      args = call.function.arguments.trim() ? JSON.parse(call.function.arguments) : {};
      if (typeof args !== 'object' || args === null || Array.isArray(args)) throw new Error('esperado um objeto JSON');
    } catch (err) {
      this.ui.toolError(`${name}: argumentos inválidos`);
      return `Erro: argumentos de ${name} não são JSON válido (${errorMessage(err)}). Reenvie a chamada com JSON correto.`;
    }

    const missing = ((tool.parameters.required as string[] | undefined) ?? []).filter((k) => args[k] === undefined);
    if (missing.length && !(name === 'edit_file_diff' && args.old_string !== undefined)) {
      this.ui.toolError(`${name}: faltando ${missing.join(', ')}`);
      return `Erro: parâmetros obrigatórios ausentes em ${name}: ${missing.join(', ')}.`;
    }

    const ctx: ToolContext = { config: this.config, ui: this.ui, signal, previewed: false };
    let summary: string;
    try {
      summary = tool.summarize(args, ctx);
    } catch {
      summary = '';
    }
    this.ui.toolHeader(name, summary);

    if (tool.requiresApproval && !this.config.autoApprove && !this.approveAllForSession) {
      try {
        await tool.preview?.(args, ctx);
        ctx.previewed = true;
      } catch (err) {
        this.ui.toolError(errorMessage(err));
        return `Erro: ${errorMessage(err)}`;
      }
      const answer = await this.ui.confirm(`Permitir ${name}?`, signal);
      if (answer === 'no') {
        const reason = (await this.ui.ask('  Instrução para o agente (opcional, Enter para pular): ', signal)).trim();
        this.ui.toolError('negado pelo usuário');
        return `O usuário NEGOU esta ação. ${reason ? `Instrução do usuário: ${reason}` : 'Não repita a mesma ação; escolha outra abordagem ou pergunte ao usuário.'}`;
      }
      if (answer === 'all') {
        this.approveAllForSession = true;
        this.ui.warn('Aprovação automática ativada até o fim da sessão (/auto para desativar).');
      }
    }

    try {
      return await tool.execute(args, ctx);
    } catch (err) {
      if (signal.aborted) throw err;
      this.ui.toolError(errorMessage(err));
      return `Erro ao executar ${name}: ${errorMessage(err)}`;
    }
  }

  /** Liga/desliga a aprovação automática em tempo de execução. */
  toggleAutoApprove(): boolean {
    const next = !(this.config.autoApprove || this.approveAllForSession);
    this.config.autoApprove = next;
    this.approveAllForSession = false;
    return next;
  }
}
