import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_IGNORES, displayPath, resolvePath, type Tool } from './types.js';

interface Args {
  path?: string;
  recursive?: boolean;
  max_depth?: number;
  ignore?: string[];
  show_hidden?: boolean;
}

const MAX_ENTRIES = 1000;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export const listDirectory: Tool<Args> = {
  name: 'list_directory',
  description:
    'Lista arquivos e pastas em formato de árvore (com tamanhos). Recursivo por padrão até max_depth, ignorando pastas pesadas ' +
    `(${DEFAULT_IGNORES.slice(0, 6).join(', ')}, ...). Use \`ignore\` para nomes extras a ignorar.`,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Diretório. Padrão: diretório de trabalho.' },
      recursive: { type: 'boolean', description: 'Listar subpastas. Padrão true.' },
      max_depth: { type: 'integer', description: 'Profundidade máxima (padrão 3).' },
      ignore: { type: 'array', items: { type: 'string' }, description: 'Nomes de arquivos/pastas adicionais a ignorar.' },
      show_hidden: { type: 'boolean', description: 'Incluir itens que começam com ".". Padrão true.' },
    },
  },
  requiresApproval: false,

  summarize: (args, ctx) => displayPath(resolvePath(args.path || '.', ctx), ctx) || '.',

  async execute(args, ctx) {
    const root = resolvePath(args.path || '.', ctx);
    const stat = await fs.stat(root).catch(() => null);
    if (!stat?.isDirectory()) throw new Error(`Diretório não encontrado: ${root}`);

    const ignore = new Set([...DEFAULT_IGNORES, ...(args.ignore ?? [])].map((s) => s.toLowerCase()));
    const recursive = args.recursive !== false;
    const maxDepth = recursive ? Math.max(1, Number(args.max_depth) || 3) : 1;
    const showHidden = args.show_hidden !== false;

    const lines: string[] = [];
    let files = 0;
    let dirs = 0;
    let truncated = false;
    const skipped = new Set<string>();

    const walk = async (dir: string, depth: number, prefix: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (err) {
        lines.push(`${prefix}[sem acesso: ${(err as Error).message}]`);
        return;
      }
      entries = entries
        .filter((e) => showHidden || !e.name.startsWith('.'))
        .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

      for (const entry of entries) {
        if (lines.length >= MAX_ENTRIES) {
          truncated = true;
          return;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (ignore.has(entry.name.toLowerCase())) {
            skipped.add(entry.name);
            lines.push(`${prefix}${entry.name}/ (ignorado)`);
            continue;
          }
          dirs++;
          lines.push(`${prefix}${entry.name}/`);
          if (depth < maxDepth) await walk(full, depth + 1, prefix + '  ');
        } else {
          if (ignore.has(entry.name.toLowerCase())) continue;
          files++;
          const size = await fs.stat(full).then((s) => formatSize(s.size)).catch(() => '?');
          lines.push(`${prefix}${entry.name} (${size})`);
        }
      }
    };

    await walk(root, 1, '');
    const summary = `${dirs} pastas, ${files} arquivos${truncated ? `, truncado em ${MAX_ENTRIES} entradas` : ''}`;
    ctx.ui.toolOk(summary);
    return [`[${root}] ${summary} (profundidade ${maxDepth})`, ...lines].join('\n');
  },
};
