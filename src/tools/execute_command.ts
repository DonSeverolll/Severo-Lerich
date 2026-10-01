import fs from 'node:fs';
import type { ShellKind } from '../config.js';
import { runCommand } from '../executor/shell.js';
import { resolvePath, type Tool } from './types.js';

interface Args {
  command: string;
  cwd?: string;
  timeout_ms?: number;
  shell?: ShellKind;
}

const MAX_TIMEOUT_MS = 30 * 60_000;

export const executeCommand: Tool<Args> = {
  name: 'execute_command',
  description:
    'Executa um comando no terminal do sistema (PowerShell por padrão no Windows) e retorna exit code, stdout e stderr. ' +
    'Cada chamada roda em um processo novo: `cd` não persiste entre chamadas, use o parâmetro `cwd`. ' +
    'Não há stdin: use flags não interativas (-y, --yes, -Force). Para servidores/processos longos use ' +
    '`Start-Process` (PowerShell) para rodar em segundo plano, senão o comando será encerrado no timeout.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Comando ou script (pode ter várias linhas) a executar.' },
      cwd: { type: 'string', description: 'Diretório onde executar. Padrão: diretório de trabalho do agente.' },
      timeout_ms: { type: 'integer', description: 'Tempo máximo em ms (padrão configurado, máx. 1800000).' },
      shell: { type: 'string', enum: ['powershell', 'pwsh', 'cmd', 'bash'], description: 'Shell a usar. Padrão: configurado.' },
    },
    required: ['command'],
  },
  requiresApproval: true,

  summarize: (args, ctx) => `${args.shell ?? ctx.config.shell}${args.cwd ? ` em ${args.cwd}` : ''}`,

  preview(args, ctx) {
    const shell = args.shell ?? ctx.config.shell;
    const cwd = args.cwd ? resolvePath(args.cwd, ctx) : ctx.config.cwd;
    ctx.ui.showCommand(args.command, shell === 'bash' ? 'bash' : shell === 'cmd' ? 'dos' : 'powershell', cwd);
  },

  async execute(args, ctx) {
    if (typeof args.command !== 'string' || !args.command.trim()) throw new Error('Parâmetro "command" é obrigatório.');
    const shell = args.shell ?? ctx.config.shell;
    const cwd = args.cwd ? resolvePath(args.cwd, ctx) : ctx.config.cwd;
    if (!fs.existsSync(cwd)) throw new Error(`Diretório não existe: ${cwd}`);
    const timeoutMs = Math.min(Math.max(Number(args.timeout_ms) || ctx.config.commandTimeoutMs, 1_000), MAX_TIMEOUT_MS);

    if (!ctx.previewed) this.preview!(args, ctx);

    let lastChar = '\n';
    const stream = (isErr: boolean) => (chunk: string) => {
      if (!chunk) return;
      ctx.ui.commandOutput(chunk, isErr);
      lastChar = chunk[chunk.length - 1];
    };
    const result = await runCommand({
      command: args.command,
      cwd,
      shell,
      timeoutMs,
      signal: ctx.signal,
      onStdout: stream(false),
      onStderr: stream(true),
    });
    if (lastChar !== '\n') process.stdout.write('\n');

    const seconds = (result.durationMs / 1000).toFixed(1);
    let status = `exit code: ${result.exitCode ?? 'n/a'} (${seconds}s)`;
    if (result.timedOut) status += ` — ENCERRADO POR TIMEOUT após ${Math.round(timeoutMs / 1000)}s`;
    if (result.aborted) status += ' — INTERROMPIDO pelo usuário';

    const ok = result.exitCode === 0 && !result.timedOut && !result.aborted;
    (ok ? ctx.ui.toolOk : ctx.ui.toolError).call(ctx.ui, status);

    const parts = [status];
    parts.push(result.stdout.trim() ? `--- stdout ---\n${result.stdout.trimEnd()}` : '--- stdout --- (vazio)');
    if (result.stderr.trim()) parts.push(`--- stderr ---\n${result.stderr.trimEnd()}`);
    return parts.join('\n');
  },
};
