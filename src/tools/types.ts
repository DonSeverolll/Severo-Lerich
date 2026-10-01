import path from 'node:path';
import type { Config } from '../config.js';
import type { TerminalUI } from '../ui/terminal.js';

export interface ToolContext {
  config: Config;
  ui: TerminalUI;
  signal: AbortSignal;
  /** true quando o usuário já viu a prévia (diff/conteúdo) na tela de aprovação. */
  previewed: boolean;
}

export interface Tool<A = any> {
  name: string;
  description: string;
  /** JSON Schema dos argumentos (formato OpenAI function calling). */
  parameters: Record<string, unknown>;
  /** Ações com efeito colateral pedem confirmação, salvo --auto-approve. */
  requiresApproval: boolean;
  /** Resumo de uma linha exibido no log ("⚙ nome resumo"). */
  summarize(args: A, ctx: ToolContext): string;
  /** Prévia exibida antes da confirmação; se lançar erro, a chamada falha sem perguntar ao usuário. */
  preview?(args: A, ctx: ToolContext): Promise<void> | void;
  /** Executa e devolve o texto que vai para o histórico como `role: tool`. */
  execute(args: A, ctx: ToolContext): Promise<string>;
}

/** Pastas pesadas ignoradas por padrão em listagens e buscas. */
export const DEFAULT_IGNORES = [
  'node_modules', '.git', 'venv', '.venv', 'env', '__pycache__', '.mypy_cache', '.pytest_cache',
  'dist', 'build', 'out', '.next', '.nuxt', '.turbo', '.cache', 'target', 'bin', 'obj', '.idea', 'coverage',
];

export function resolvePath(p: string, ctx: ToolContext): string {
  if (typeof p !== 'string' || !p.trim()) throw new Error('Parâmetro "path" é obrigatório.');
  const expanded = p.replace(/^~(?=$|[\\/])/, process.env.USERPROFILE || process.env.HOME || '~');
  return path.resolve(ctx.config.cwd, expanded);
}

/** Caminho amigável para logs: relativo ao cwd quando estiver dentro dele. */
export function displayPath(abs: string, ctx: ToolContext): string {
  const rel = path.relative(ctx.config.cwd, abs);
  if (rel === '') return '.';
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : abs;
}

export function isBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true;
  return false;
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0);
}
