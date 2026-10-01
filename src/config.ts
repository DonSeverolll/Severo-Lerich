import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** Raiz do pacote (pasta que contém package.json), funciona tanto em src/ (tsx) quanto em dist/. */
export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export type ShellKind = 'powershell' | 'pwsh' | 'cmd' | 'bash';
const SHELLS: ShellKind[] = ['powershell', 'pwsh', 'cmd', 'bash'];

export interface Config {
  baseUrl: string;
  apiKeys: string[];
  model: string;
  temperature?: number;
  stream: boolean;
  extraHeaders: Record<string, string>;
  requestTimeoutMs: number;
  maxRetries: number;
  maxIterations: number;
  commandTimeoutMs: number;
  toolOutputMaxChars: number;
  shell: ShellKind;
  autoApprove: boolean;
  cwd: string;
}

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|sim|on)$/i.test(value.trim());
}

export function parseShell(value: string | undefined): ShellKind {
  if (!value) return process.platform === 'win32' ? 'powershell' : 'bash';
  const v = value.toLowerCase() as ShellKind;
  if (!SHELLS.includes(v)) throw new Error(`Shell inválido "${value}". Use: ${SHELLS.join(', ')}`);
  return v;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  // .env do diretório atual tem prioridade sobre o .env da pasta de instalação.
  const envFiles = [path.join(process.cwd(), '.env'), path.join(APP_ROOT, '.env')].filter((p) => fs.existsSync(p));
  if (envFiles.length) dotenv.config({ path: envFiles });

  const env = process.env;
  const apiKeys = (env.LLM_API_KEYS ?? env.LLM_API_KEY ?? '')
    .split(/[,;\s]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  let extraHeaders: Record<string, string> = {};
  if (env.LLM_EXTRA_HEADERS) {
    try {
      extraHeaders = JSON.parse(env.LLM_EXTRA_HEADERS);
    } catch {
      throw new Error('LLM_EXTRA_HEADERS precisa ser um JSON válido, ex.: {"X-Route":"fallback"}');
    }
  }

  const temperature = env.LLM_TEMPERATURE ? Number(env.LLM_TEMPERATURE) : undefined;

  const config: Config = {
    baseUrl: (env.LLM_BASE_URL ?? 'http://localhost:4000/v1').replace(/\/+$/, ''),
    apiKeys,
    model: env.LLM_MODEL ?? 'gpt-4o',
    temperature: Number.isFinite(temperature) ? temperature : undefined,
    stream: bool(env.LLM_STREAM, true),
    extraHeaders,
    requestTimeoutMs: int(env.LLM_REQUEST_TIMEOUT_MS, 120_000),
    maxRetries: int(env.LLM_MAX_RETRIES, 6),
    maxIterations: int(env.AGENT_MAX_ITERATIONS, 40),
    commandTimeoutMs: int(env.COMMAND_TIMEOUT_MS, 120_000),
    toolOutputMaxChars: int(env.TOOL_OUTPUT_MAX_CHARS, 30_000),
    shell: parseShell(env.AGENT_SHELL),
    autoApprove: bool(env.AGENT_AUTO_APPROVE, false),
    cwd: process.cwd(),
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) (config as unknown as Record<string, unknown>)[key] = value;
  }
  config.cwd = path.resolve(config.cwd);
  if (!fs.existsSync(config.cwd) || !fs.statSync(config.cwd).isDirectory()) {
    throw new Error(`Diretório de trabalho não existe: ${config.cwd}`);
  }
  return config;
}
