import { invoke } from '@tauri-apps/api/core';

/** Ponte para os comandos Rust de arquivo (src-tauri/src/lib.rs). */

export interface PathInfo {
  exists: boolean;
  is_dir: boolean;
  size: number;
}

export interface DirEntry {
  name: string;
  is_dir: boolean;
  size: number;
}

export const sys = {
  readText: (path: string) => invoke<string>('read_text_file', { path }),
  /** Retorna true se o arquivo já existia (sobrescrito). */
  writeText: (path: string, content: string) => invoke<boolean>('write_text_file', { path, content }),
  info: (path: string) => invoke<PathInfo>('path_info', { path }),
  readDir: (path: string) => invoke<DirEntry[]>('read_dir', { path }),
};

/** Pastas pesadas ignoradas em listagens e buscas. */
export const DEFAULT_IGNORES = new Set([
  'node_modules', '.git', 'venv', '.venv', 'env', '__pycache__', '.mypy_cache', '.pytest_cache',
  'dist', 'build', 'out', '.next', '.nuxt', '.turbo', '.cache', 'target', 'bin', 'obj', '.idea', 'coverage',
]);

const isAbsolute = (p: string) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/');

/** Resolve `p` relativo a `cwd` (estilo Windows), normalizando "." e "..". */
export function resolvePath(p: string, cwd: string, home = ''): string {
  if (typeof p !== 'string' || !p.trim()) throw new Error('Parâmetro "path" é obrigatório.');
  let raw = p.trim().replace(/^~(?=$|[\\/])/, home);
  if (!isAbsolute(raw)) raw = `${cwd.replace(/[\\/]+$/, '')}\\${raw}`;
  const unc = raw.startsWith('\\\\');
  const parts = raw.replace(/\//g, '\\').split('\\');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length > 1) out.pop();
    } else out.push(part);
  }
  const joined = out.join('\\');
  if (unc) return `\\\\${joined}`;
  return /^[a-zA-Z]:$/.test(out[0] ?? '') && out.length === 1 ? `${joined}\\` : joined;
}

/** Caminho relativo ao cwd para exibição, quando dentro dele. */
export function relPath(abs: string, cwd: string): string {
  const base = cwd.replace(/[\\/]+$/, '') + '\\';
  if (abs.toLowerCase() === cwd.replace(/[\\/]+$/, '').toLowerCase()) return '.';
  return abs.toLowerCase().startsWith(base.toLowerCase()) ? abs.slice(base.length) : abs;
}

export function joinPath(dir: string, name: string): string {
  return `${dir.replace(/[\\/]+$/, '')}\\${name}`;
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0);
}

/** Converte um glob (**, *, ?, {a,b}, [abc]) em RegExp sobre caminhos com "/". */
export function globToRegExp(glob: string, caseInsensitive = false): RegExp {
  const g = glob.replace(/\\/g, '/').replace(/^\.\//, '');
  let re = '';
  let inGroup = 0;
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        const slashAfter = g[i + 2] === '/';
        re += slashAfter ? '(?:.*/)?' : '.*';
        i += slashAfter ? 2 : 1;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      inGroup++;
      re += '(?:';
    } else if (c === '}' && inGroup) {
      inGroup--;
      re += ')';
    } else if (c === ',' && inGroup) re += '|';
    else if (c === '[') {
      const end = g.indexOf(']', i);
      if (end > i) {
        re += `[${g.slice(i + 1, end).replace(/^!/, '^')}]`;
        i = end;
      } else re += '\\[';
    } else re += c.replace(/[.+^$()|\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, caseInsensitive ? 'i' : '');
}

export interface WalkedFile {
  abs: string;
  rel: string; // com "/"
  is_dir: boolean;
  size: number;
}

/** Percorre a árvore a partir de `root` pulando pastas pesadas. */
export async function walk(root: string, opts: { maxDepth?: number; maxEntries?: number; signal?: AbortSignal } = {}): Promise<{ files: WalkedFile[]; truncated: boolean }> {
  const maxDepth = opts.maxDepth ?? 32;
  const maxEntries = opts.maxEntries ?? 20_000;
  const files: WalkedFile[] = [];
  let truncated = false;

  const visit = async (dir: string, rel: string, depth: number): Promise<void> => {
    if (opts.signal?.aborted || truncated) return;
    let entries: DirEntry[];
    try {
      entries = await sys.readDir(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= maxEntries) {
        truncated = true;
        return;
      }
      if (e.is_dir && DEFAULT_IGNORES.has(e.name.toLowerCase())) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const abs = joinPath(dir, e.name);
      files.push({ abs, rel: childRel, is_dir: e.is_dir, size: e.size });
      if (e.is_dir && depth < maxDepth) await visit(abs, childRel, depth + 1);
    }
  };
  await visit(root, '', 1);
  return { files, truncated };
}
