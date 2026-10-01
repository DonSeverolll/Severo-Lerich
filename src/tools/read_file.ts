import fs from 'node:fs/promises';
import { displayPath, isBinary, resolvePath, type Tool } from './types.js';

interface Args {
  path: string;
  offset?: number;
  limit?: number;
}

const DEFAULT_LIMIT = 400;
const MAX_LIMIT = 2000;
const MAX_LINE_CHARS = 2000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const readFile: Tool<Args> = {
  name: 'read_file',
  description:
    'Lê um arquivo de texto e retorna as linhas numeradas. Suporta paginação: `offset` (linha inicial, 1-based) e ' +
    `\`limit\` (padrão ${DEFAULT_LIMIT}, máx. ${MAX_LIMIT}). Use para inspecionar código antes de editá-lo.`,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho do arquivo.' },
      offset: { type: 'integer', description: 'Linha inicial (1-based). Padrão 1.' },
      limit: { type: 'integer', description: `Quantidade de linhas. Padrão ${DEFAULT_LIMIT}.` },
    },
    required: ['path'],
  },
  requiresApproval: false,

  summarize: (args, ctx) => {
    const p = displayPath(resolvePath(args.path, ctx), ctx);
    return args.offset || args.limit ? `${p} (a partir da linha ${args.offset ?? 1})` : p;
  },

  async execute(args, ctx) {
    const abs = resolvePath(args.path, ctx);
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat) throw new Error(`Arquivo não encontrado: ${abs}`);
    if (stat.isDirectory()) throw new Error(`${abs} é um diretório. Use list_directory.`);
    if (stat.size > MAX_FILE_BYTES) throw new Error(`Arquivo muito grande (${(stat.size / 1048576).toFixed(1)} MB).`);

    const buf = await fs.readFile(abs);
    if (isBinary(buf)) throw new Error(`Arquivo binário (${stat.size} bytes); leitura como texto não suportada.`);

    const lines = buf.toString('utf8').split(/\r?\n/);
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const total = lines.length;
    const offset = Math.max(1, Math.floor(Number(args.offset) || 1));
    const limit = Math.min(Math.max(1, Math.floor(Number(args.limit) || DEFAULT_LIMIT)), MAX_LIMIT);

    if (total === 0) {
      ctx.ui.toolOk('arquivo vazio');
      return `[${abs}] arquivo vazio`;
    }
    if (offset > total) throw new Error(`offset ${offset} além do fim do arquivo (${total} linhas).`);

    const end = Math.min(total, offset + limit - 1);
    const width = String(end).length;
    const body = lines
      .slice(offset - 1, end)
      .map((line, i) => {
        const text = line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}… [linha truncada]` : line;
        return `${String(offset + i).padStart(width)}\t${text}`;
      })
      .join('\n');

    ctx.ui.toolOk(`${displayPath(abs, ctx)}: linhas ${offset}-${end} de ${total}`);
    const more = end < total ? `\n[... mais ${total - end} linhas. Use offset=${end + 1} para continuar.]` : '';
    return `[${abs} | linhas ${offset}-${end} de ${total}]\n${body}${more}`;
  },
};
