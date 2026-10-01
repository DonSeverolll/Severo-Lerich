import { Command } from '@tauri-apps/plugin-shell';
import type { ToolSchema } from '../types';
import { countLines, globToRegExp, relPath, resolvePath, sys, walk } from './sys';

export interface ToolContext {
  cwd: string;
  home: string;
  shell: 'powershell' | 'pwsh';
  commandTimeoutMs: number;
  signal: AbortSignal;
  /** Saída incremental exibida ao vivo no card da ferramenta. */
  onOutput: (chunk: string) => void;
}

export type Preview =
  | { kind: 'command'; command: string; cwd: string; shell: string }
  | { kind: 'file'; path: string; content: string; linesBefore: number | null }
  | { kind: 'diff'; path: string; hunks: { line: number; oldText: string; newText: string; count: number }[] };

export interface Tool {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresApproval: boolean;
  summarize(args: any, ctx: ToolContext): string;
  preview?(args: any, ctx: ToolContext): Promise<Preview>;
  execute(args: any, ctx: ToolContext): Promise<string>;
}

const p = (args: any, ctx: ToolContext, key = 'path') => resolvePath(args[key] ?? '.', ctx.cwd, ctx.home);

// ---------------------------------------------------------------- execute_command

function utf16leBase64(s: string): string {
  let bin = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    bin += String.fromCharCode(c & 0xff, c >> 8);
  }
  return btoa(bin);
}

async function killTree(pid: number): Promise<void> {
  try {
    await Command.create('taskkill', ['/pid', String(pid), '/T', '/F']).execute();
  } catch {
    /* já encerrado */
  }
}

const executeCommand: Tool = {
  name: 'execute_command',
  label: 'Terminal',
  description:
    'Executa um comando no PowerShell do Windows e retorna exit code, stdout e stderr. Cada chamada é um processo novo: ' +
    '`cd` não persiste, use o parâmetro `cwd`. Não há stdin: use flags não interativas (-y, -Force). ' +
    'Para servidores/processos longos use Start-Process para rodar em segundo plano.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Comando ou script PowerShell (pode ter várias linhas).' },
      cwd: { type: 'string', description: 'Diretório onde executar. Padrão: diretório de trabalho.' },
      timeout_ms: { type: 'integer', description: 'Tempo máximo em ms (máx. 1800000).' },
    },
    required: ['command'],
  },
  requiresApproval: true,
  summarize: (a) => String(a.command ?? '').split('\n')[0].slice(0, 80),
  async preview(a, ctx) {
    return { kind: 'command', command: String(a.command ?? ''), cwd: a.cwd ? p(a, ctx, 'cwd') : ctx.cwd, shell: ctx.shell };
  },
  async execute(a, ctx) {
    const command = String(a.command ?? '');
    if (!command.trim()) throw new Error('Parâmetro "command" é obrigatório.');
    const cwd = a.cwd ? p(a, ctx, 'cwd') : ctx.cwd;
    const info = await sys.info(cwd);
    if (!info.is_dir) throw new Error(`Diretório não existe: ${cwd}`);
    const timeoutMs = Math.min(Math.max(Number(a.timeout_ms) || ctx.commandTimeoutMs, 1000), 1_800_000);

    const script = [
      '$ProgressPreference = "SilentlyContinue"',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      '$OutputEncoding = [System.Text.Encoding]::UTF8',
      command,
      'if (-not $?) { if ($LASTEXITCODE) { exit $LASTEXITCODE } else { exit 1 } }',
      'if ($LASTEXITCODE) { exit $LASTEXITCODE }',
    ].join('\n');
    const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', utf16leBase64(script)];
    const cmd = Command.create(ctx.shell, args, { cwd, encoding: 'utf-8', env: { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    const started = Date.now();
    cmd.stdout.on('data', (line) => {
      stdout += `${line}\n`;
      ctx.onOutput(`${line}\n`);
    });
    cmd.stderr.on('data', (line) => {
      stderr += `${line}\n`;
      ctx.onOutput(`${line}\n`);
    });

    const code = await new Promise<number | null>((resolve, reject) => {
      cmd.on('close', (d) => resolve(d.code));
      cmd.on('error', (e) => reject(new Error(String(e))));
      cmd
        .spawn()
        .then((child) => {
          const stop = () => {
            killTree(child.pid);
            child.kill().catch(() => {});
          };
          const timer = setTimeout(() => {
            timedOut = true;
            stop();
          }, timeoutMs);
          ctx.signal.addEventListener('abort', () => {
            aborted = true;
            stop();
          }, { once: true });
          cmd.on('close', () => clearTimeout(timer));
        })
        .catch(reject);
    });

    let status = `exit code: ${code ?? 'n/a'} (${((Date.now() - started) / 1000).toFixed(1)}s)`;
    if (timedOut) status += ` — ENCERRADO POR TIMEOUT após ${Math.round(timeoutMs / 1000)}s`;
    if (aborted) status += ' — INTERROMPIDO pelo usuário';
    const parts = [status, stdout.trim() ? `--- stdout ---\n${stdout.trimEnd()}` : '--- stdout --- (vazio)'];
    if (stderr.trim()) parts.push(`--- stderr ---\n${stderr.trimEnd()}`);
    if (code !== 0 || timedOut || aborted) throw new ToolFailure(parts.join('\n'));
    return parts.join('\n');
  },
};

/** Falha cujo texto completo (saída do comando) deve ir para o modelo. */
export class ToolFailure extends Error {}

// ---------------------------------------------------------------- write_file

const writeFile: Tool = {
  name: 'write_file',
  label: 'Escrever arquivo',
  description: 'Cria ou sobrescreve um arquivo com o conteúdo completo (cria pastas). Para mudanças pontuais prefira edit_file_diff.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho absoluto ou relativo ao diretório de trabalho.' },
      content: { type: 'string', description: 'Conteúdo completo do arquivo.' },
    },
    required: ['path', 'content'],
  },
  requiresApproval: true,
  summarize: (a, ctx) => relPath(p(a, ctx), ctx.cwd),
  async preview(a, ctx) {
    if (typeof a.content !== 'string') throw new Error('Parâmetro "content" é obrigatório.');
    const abs = p(a, ctx);
    const before = await sys.readText(abs).then(countLines).catch(() => null);
    return { kind: 'file', path: abs, content: a.content, linesBefore: before };
  },
  async execute(a, ctx) {
    if (typeof a.content !== 'string') throw new Error('Parâmetro "content" é obrigatório.');
    const abs = p(a, ctx);
    const existed = await sys.writeText(abs, a.content);
    const msg = `Arquivo ${existed ? 'sobrescrito' : 'criado'}: ${abs} (${countLines(a.content)} linhas)`;
    ctx.onOutput(msg);
    return msg;
  },
};

// ---------------------------------------------------------------- read_file

const readFile: Tool = {
  name: 'read_file',
  label: 'Ler arquivo',
  description: 'Lê um arquivo de texto com linhas numeradas. Paginação: offset (linha inicial, 1-based) e limit (padrão 400, máx. 2000).',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      offset: { type: 'integer', description: 'Linha inicial (1-based).' },
      limit: { type: 'integer', description: 'Quantidade de linhas.' },
    },
    required: ['path'],
  },
  requiresApproval: false,
  summarize: (a, ctx) => relPath(p(a, ctx), ctx.cwd),
  async execute(a, ctx) {
    const abs = p(a, ctx);
    const lines = (await sys.readText(abs)).split(/\r?\n/);
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const total = lines.length;
    const offset = Math.max(1, Math.floor(Number(a.offset) || 1));
    const limit = Math.min(Math.max(1, Math.floor(Number(a.limit) || 400)), 2000);
    if (offset > total) throw new Error(`offset ${offset} além do fim do arquivo (${total} linhas).`);
    const end = Math.min(total, offset + limit - 1);
    const width = String(end).length;
    const body = lines
      .slice(offset - 1, end)
      .map((l, i) => `${String(offset + i).padStart(width)}\t${l.length > 2000 ? `${l.slice(0, 2000)}… [truncada]` : l}`)
      .join('\n');
    ctx.onOutput(`linhas ${offset}-${end} de ${total}`);
    return `[${abs} | linhas ${offset}-${end} de ${total}]\n${body}${end < total ? `\n[... mais ${total - end} linhas; use offset=${end + 1}]` : ''}`;
  },
};

// ---------------------------------------------------------------- edit_file_diff

function countOccurrences(h: string, n: string): number {
  let c = 0;
  for (let i = h.indexOf(n); i !== -1; i = h.indexOf(n, i + n.length)) c++;
  return c;
}

async function planEdits(a: any, ctx: ToolContext) {
  const abs = p(a, ctx);
  const original = await sys.readText(abs);
  const crlf = original.includes('\r\n');
  const fix = (s: string) => (crlf ? s.replace(/\r?\n/g, '\r\n') : s);
  const edits: any[] = Array.isArray(a.edits) && a.edits.length ? a.edits : typeof a.old_string === 'string' ? [a] : [];
  if (!edits.length) throw new Error('Informe "edits": [{ old_string, new_string, replace_all? }].');

  let text = original;
  const hunks: { line: number; oldText: string; newText: string; count: number }[] = [];
  edits.forEach((e, i) => {
    if (typeof e.old_string !== 'string' || typeof e.new_string !== 'string') throw new Error(`Edição ${i + 1}: old_string e new_string devem ser texto.`);
    const oldS = fix(e.old_string);
    const newS = fix(e.new_string);
    if (!oldS) throw new Error(`Edição ${i + 1}: old_string vazio.`);
    const n = countOccurrences(text, oldS);
    if (n === 0) throw new Error(`Edição ${i + 1}: old_string não encontrado. Leia o arquivo com read_file e copie o trecho exato.`);
    if (n > 1 && !e.replace_all) throw new Error(`Edição ${i + 1}: old_string aparece ${n} vezes; inclua mais contexto ou use replace_all=true.`);
    const line = text.slice(0, text.indexOf(oldS)).split('\n').length;
    hunks.push({ line, oldText: e.old_string, newText: e.new_string, count: e.replace_all ? n : 1 });
    text = e.replace_all ? text.split(oldS).join(newS) : text.replace(oldS, () => newS);
  });
  return { abs, original, updated: text, hunks };
}

const editFileDiff: Tool = {
  name: 'edit_file_diff',
  label: 'Editar arquivo',
  description:
    'Edita um arquivo existente por substituição exata (search & replace). Cada old_string deve ser idêntico ao texto atual e único ' +
    '(ou use replace_all). Edições aplicadas em ordem e de forma atômica. Leia o arquivo antes.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            old_string: { type: 'string' },
            new_string: { type: 'string' },
            replace_all: { type: 'boolean' },
          },
          required: ['old_string', 'new_string'],
        },
      },
    },
    required: ['path', 'edits'],
  },
  requiresApproval: true,
  summarize: (a, ctx) => relPath(p(a, ctx), ctx.cwd),
  async preview(a, ctx) {
    const plan = await planEdits(a, ctx);
    return { kind: 'diff', path: plan.abs, hunks: plan.hunks };
  },
  async execute(a, ctx) {
    const plan = await planEdits(a, ctx);
    await sys.writeText(plan.abs, plan.updated);
    const total = plan.hunks.reduce((s, h) => s + h.count, 0);
    const msg = `Arquivo editado: ${plan.abs} — ${total} substituição(ões) (linhas ${plan.hunks.map((h) => h.line).join(', ')})`;
    ctx.onOutput(msg);
    return msg;
  },
};

// ---------------------------------------------------------------- list_directory

const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

const listDirectory: Tool = {
  name: 'list_directory',
  label: 'Listar pasta',
  description: 'Lista arquivos e pastas em árvore (com tamanhos), recursivo até max_depth (padrão 3), ignorando node_modules, .git, venv etc.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Padrão: diretório de trabalho.' },
      max_depth: { type: 'integer' },
    },
  },
  requiresApproval: false,
  summarize: (a, ctx) => relPath(p(a, ctx), ctx.cwd),
  async execute(a, ctx) {
    const root = p(a, ctx);
    if (!(await sys.info(root)).is_dir) throw new Error(`Diretório não encontrado: ${root}`);
    const { files, truncated } = await walk(root, { maxDepth: Math.max(1, Number(a.max_depth) || 3), maxEntries: 1000, signal: ctx.signal });
    const lines = files.map((f) => {
      const depth = f.rel.split('/').length - 1;
      const name = f.rel.split('/').pop();
      return `${'  '.repeat(depth)}${name}${f.is_dir ? '/' : ` (${fmtSize(f.size)})`}`;
    });
    const dirs = files.filter((f) => f.is_dir).length;
    const summary = `${dirs} pastas, ${files.length - dirs} arquivos${truncated ? ' (truncado)' : ''}`;
    ctx.onOutput(summary);
    return [`[${root}] ${summary}`, ...lines].join('\n');
  },
};

// ---------------------------------------------------------------- file_search

const fileSearch: Tool = {
  name: 'file_search',
  label: 'Buscar',
  description:
    'mode="glob": encontra caminhos por padrão (ex.: "**/*.ts"). mode="grep": procura uma regex no conteúdo dos arquivos ' +
    '(filtre com include, ex.: "**/*.{ts,py}") e retorna arquivo:linha: trecho.',
  parameters: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['glob', 'grep'] },
      pattern: { type: 'string' },
      path: { type: 'string' },
      include: { type: 'string' },
      case_insensitive: { type: 'boolean' },
      max_results: { type: 'integer' },
    },
    required: ['mode', 'pattern'],
  },
  requiresApproval: false,
  summarize: (a) => `${a.mode} ${a.pattern}${a.include ? ` em ${a.include}` : ''}`,
  async execute(a, ctx) {
    const base = p(a, ctx);
    const max = Math.max(1, Number(a.max_results) || 200);
    const ci = Boolean(a.case_insensitive);
    const { files, truncated } = await walk(base, { signal: ctx.signal });

    if (a.mode === 'glob') {
      const re = globToRegExp(String(a.pattern), ci);
      const found = files.filter((f) => re.test(f.rel)).map((f) => f.rel + (f.is_dir ? '/' : ''));
      ctx.onOutput(`${found.length} caminho(s)`);
      return [`[glob ${a.pattern} em ${base}] ${found.length} resultado(s)${truncated ? ' (varredura truncada)' : ''}`, ...found.slice(0, max)].join('\n');
    }
    if (a.mode !== 'grep') throw new Error('mode deve ser "glob" ou "grep".');

    let regex: RegExp;
    try {
      regex = new RegExp(String(a.pattern), ci ? 'i' : '');
    } catch (e) {
      throw new Error(`Regex inválida: ${(e as Error).message}`);
    }
    const include = a.include ? globToRegExp(String(a.include), ci) : null;
    const results: string[] = [];
    let total = 0;
    let matchedFiles = 0;
    for (const f of files) {
      if (ctx.signal.aborted) break;
      if (f.is_dir || f.size > 2 * 1024 * 1024 || (include && !include.test(f.rel))) continue;
      let text: string;
      try {
        text = await sys.readText(f.abs);
      } catch {
        continue; // binário ou sem acesso
      }
      let hit = false;
      text.split(/\r?\n/).forEach((line, i) => {
        if (!regex.test(line)) return;
        total++;
        if (!hit) {
          hit = true;
          matchedFiles++;
        }
        if (results.length < max) results.push(`${f.rel}:${i + 1}: ${line.trim().slice(0, 300)}`);
      });
    }
    ctx.onOutput(`${total} ocorrência(s) em ${matchedFiles} arquivo(s)`);
    return [`[grep /${a.pattern}/ em ${base}] ${total} ocorrência(s) em ${matchedFiles} arquivo(s)`, ...results].join('\n');
  },
};

export const TOOLS: Tool[] = [executeCommand, writeFile, readFile, editFileDiff, listDirectory, fileSearch];
export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export const TOOL_SCHEMAS: ToolSchema[] = TOOLS.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));
