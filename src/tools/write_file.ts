import fs from 'node:fs/promises';
import path from 'node:path';
import { languageFromPath } from '../ui/highlight.js';
import { countLines, displayPath, resolvePath, type Tool } from './types.js';

interface Args {
  path: string;
  content: string;
}

async function existingLines(abs: string): Promise<number | null> {
  try {
    return countLines(await fs.readFile(abs, 'utf8'));
  } catch {
    return null;
  }
}

export const writeFile: Tool<Args> = {
  name: 'write_file',
  description:
    'Cria ou sobrescreve um arquivo com o conteúdo completo informado (cria pastas intermediárias). ' +
    'Aceita caminhos absolutos ou relativos ao diretório de trabalho. Para mudanças pontuais em arquivos existentes prefira edit_file_diff.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho do arquivo.' },
      content: { type: 'string', description: 'Conteúdo completo do arquivo.' },
    },
    required: ['path', 'content'],
  },
  requiresApproval: true,

  summarize: (args, ctx) => displayPath(resolvePath(args.path, ctx), ctx),

  async preview(args, ctx) {
    if (typeof args.content !== 'string') throw new Error('Parâmetro "content" é obrigatório (string).');
    const abs = resolvePath(args.path, ctx);
    const before = await existingLines(abs);
    const after = countLines(args.content);
    ctx.ui.dim(before === null ? `  novo arquivo, ${after} linhas` : `  SOBRESCREVER arquivo existente: ${before} → ${after} linhas`);
    ctx.ui.showCode(args.content, languageFromPath(abs), 30);
  },

  async execute(args, ctx) {
    if (typeof args.content !== 'string') throw new Error('Parâmetro "content" é obrigatório (string).');
    const abs = resolvePath(args.path, ctx);
    const before = await existingLines(abs);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, args.content, 'utf8');
    const after = countLines(args.content);
    const kind = before === null ? 'criado' : 'sobrescrito';
    ctx.ui.fileChanged(kind, displayPath(abs, ctx), before === null ? `(${after} linhas)` : `(${before} → ${after} linhas)`);
    return `Arquivo ${kind}: ${abs} (${after} linhas, ${Buffer.byteLength(args.content, 'utf8')} bytes)`;
  },
};
