import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { DEFAULT_IGNORES, displayPath, isBinary, resolvePath, type Tool } from './types.js';

interface Args {
  mode: 'glob' | 'grep';
  pattern: string;
  path?: string;
  include?: string;
  case_insensitive?: boolean;
  max_results?: number;
  files_only?: boolean;
}

const MAX_GREP_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILES_SCANNED = 20_000;

const ignorePatterns = DEFAULT_IGNORES.map((d) => `**/${d}/**`);

function toGlob(p: string): string {
  return p.replace(/\\/g, '/');
}

export const fileSearch: Tool<Args> = {
  name: 'file_search',
  description:
    'Busca arquivos. mode="glob": encontra caminhos por padrão (ex.: "**/*.ts", "src/**/config.*"). ' +
    'mode="grep": procura uma expressão regular (JavaScript) dentro do conteúdo dos arquivos e retorna arquivo:linha: trecho; ' +
    'use `include` para filtrar quais arquivos varrer (ex.: "**/*.{ts,tsx}"). Ignora node_modules, .git, venv etc.',
  parameters: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['glob', 'grep'], description: 'Tipo de busca.' },
      pattern: { type: 'string', description: 'Padrão glob (mode=glob) ou regex (mode=grep).' },
      path: { type: 'string', description: 'Diretório base. Padrão: diretório de trabalho.' },
      include: { type: 'string', description: 'Glob de arquivos a varrer no modo grep. Padrão "**/*".' },
      case_insensitive: { type: 'boolean', description: 'Ignorar maiúsculas/minúsculas. Padrão false.' },
      max_results: { type: 'integer', description: 'Máximo de resultados (padrão 200).' },
      files_only: { type: 'boolean', description: 'No modo grep, retornar só os nomes dos arquivos com correspondência.' },
    },
    required: ['mode', 'pattern'],
  },
  requiresApproval: false,

  summarize: (args) => `${args.mode} ${JSON.stringify(args.pattern)}${args.include ? ` em ${args.include}` : ''}${args.path ? ` (${args.path})` : ''}`,

  async execute(args, ctx) {
    if (!args.pattern) throw new Error('Parâmetro "pattern" é obrigatório.');
    const base = resolvePath(args.path || '.', ctx);
    const max = Math.max(1, Number(args.max_results) || 200);
    const ci = Boolean(args.case_insensitive);

    if (args.mode === 'glob') {
      const pattern = toGlob(args.pattern);
      const absolute = path.isAbsolute(args.pattern);
      const found = await fg(pattern, {
        cwd: absolute ? undefined : base,
        absolute,
        dot: true,
        onlyFiles: false,
        markDirectories: true,
        ignore: ignorePatterns,
        caseSensitiveMatch: !ci,
        suppressErrors: true,
      });
      found.sort();
      const shown = found.slice(0, max);
      ctx.ui.toolOk(`${found.length} caminho(s) encontrados`);
      const header = `[glob ${args.pattern} em ${base}] ${found.length} resultado(s)${found.length > max ? `, mostrando ${max}` : ''}`;
      return [header, ...shown].join('\n');
    }

    if (args.mode !== 'grep') throw new Error('mode deve ser "glob" ou "grep".');

    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern, ci ? 'i' : '');
    } catch (err) {
      throw new Error(`Regex inválida: ${(err as Error).message}`);
    }

    const files = await fg(toGlob(args.include || '**/*'), {
      cwd: base,
      absolute: true,
      dot: true,
      onlyFiles: true,
      ignore: ignorePatterns,
      caseSensitiveMatch: !ci,
      suppressErrors: true,
    });

    const results: string[] = [];
    let matchedFiles = 0;
    let totalMatches = 0;
    for (const file of files.slice(0, MAX_FILES_SCANNED)) {
      if (ctx.signal.aborted) break;
      const stat = await fs.stat(file).catch(() => null);
      if (!stat || stat.size > MAX_GREP_FILE_BYTES) continue;
      const buf = await fs.readFile(file).catch(() => null);
      if (!buf || isBinary(buf)) continue;

      const rel = displayPath(path.normalize(file), ctx);
      const lines = buf.toString('utf8').split(/\r?\n/);
      let fileHit = false;
      for (let i = 0; i < lines.length; i++) {
        if (!regex.test(lines[i])) continue;
        totalMatches++;
        if (!fileHit) {
          fileHit = true;
          matchedFiles++;
          if (args.files_only && results.length < max) results.push(rel);
        }
        if (args.files_only) break;
        if (results.length < max) results.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 300)}`);
      }
    }

    ctx.ui.toolOk(`${totalMatches} ocorrência(s) em ${matchedFiles} arquivo(s) (${files.length} varridos)`);
    const header =
      `[grep /${args.pattern}/${ci ? 'i' : ''} em ${base}] ${totalMatches} ocorrência(s) em ${matchedFiles} arquivo(s)` +
      (results.length >= max ? `, mostrando ${max}` : '') +
      (files.length > MAX_FILES_SCANNED ? `, varridos só os primeiros ${MAX_FILES_SCANNED} arquivos` : '');
    return [header, ...results].join('\n');
  },
};
