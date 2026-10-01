import fs from 'node:fs/promises';
import { displayPath, resolvePath, type Tool, type ToolContext } from './types.js';

interface Edit {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

interface Args {
  path: string;
  edits?: Edit[];
  // Forma curta para uma única edição (vários modelos preferem enviar assim).
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
}

interface Hunk {
  line: number;
  oldText: string;
  newText: string;
  occurrences: number;
}

interface Plan {
  abs: string;
  original: string;
  updated: string;
  hunks: Hunk[];
}

function normalizeEdits(args: Args): Edit[] {
  if (Array.isArray(args.edits) && args.edits.length) return args.edits;
  if (typeof args.old_string === 'string') {
    return [{ old_string: args.old_string, new_string: args.new_string ?? '', replace_all: args.replace_all }];
  }
  throw new Error('Informe "edits": [{ old_string, new_string, replace_all? }].');
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) count++;
  return count;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Calcula todas as edições em memória; nada é gravado se qualquer uma falhar. */
async function plan(args: Args, ctx: ToolContext): Promise<Plan> {
  const abs = resolvePath(args.path, ctx);
  const original = await fs.readFile(abs, 'utf8').catch(() => {
    throw new Error(`Arquivo não encontrado: ${abs}. Para criar arquivos use write_file.`);
  });
  const crlf = original.includes('\r\n');
  const fixEol = (s: string) => (crlf ? s.replace(/\r?\n/g, '\r\n') : s);

  let text = original;
  const hunks: Hunk[] = [];
  normalizeEdits(args).forEach((edit, i) => {
    if (typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string') {
      throw new Error(`Edição ${i + 1}: old_string e new_string devem ser strings.`);
    }
    const oldS = fixEol(edit.old_string);
    const newS = fixEol(edit.new_string);
    if (!oldS) throw new Error(`Edição ${i + 1}: old_string vazio.`);
    if (oldS === newS) throw new Error(`Edição ${i + 1}: old_string e new_string são idênticos.`);

    const occurrences = countOccurrences(text, oldS);
    if (occurrences === 0) {
      throw new Error(
        `Edição ${i + 1}: old_string não encontrado em ${abs}. Leia o arquivo com read_file e copie o trecho exato (incluindo indentação e espaços).`,
      );
    }
    if (occurrences > 1 && !edit.replace_all) {
      throw new Error(
        `Edição ${i + 1}: old_string aparece ${occurrences} vezes. Inclua mais linhas de contexto para torná-lo único ou use replace_all=true.`,
      );
    }
    hunks.push({ line: lineAt(text, text.indexOf(oldS)), oldText: edit.old_string, newText: edit.new_string, occurrences: edit.replace_all ? occurrences : 1 });
    text = edit.replace_all ? text.split(oldS).join(newS) : text.replace(oldS, () => newS);
  });

  return { abs, original, updated: text, hunks };
}

function showHunks(p: Plan, ctx: ToolContext): void {
  for (const h of p.hunks) {
    ctx.ui.showDiff(h.line, h.oldText, h.newText);
    if (h.occurrences > 1) ctx.ui.dim(`    (substituído em ${h.occurrences} ocorrências)`);
  }
}

export const editFileDiff: Tool<Args> = {
  name: 'edit_file_diff',
  description:
    'Edita um arquivo existente por substituição exata de trechos (search & replace), sem reescrever o arquivo inteiro. ' +
    'Cada old_string deve corresponder EXATAMENTE ao texto atual (inclusive indentação) e ser único, a menos que replace_all=true. ' +
    'Várias edições são aplicadas em sequência e de forma atômica: se uma falhar, nada é gravado. Leia o arquivo antes de editar.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Caminho do arquivo.' },
      edits: {
        type: 'array',
        description: 'Lista de substituições aplicadas em ordem.',
        items: {
          type: 'object',
          properties: {
            old_string: { type: 'string', description: 'Trecho exato a substituir.' },
            new_string: { type: 'string', description: 'Novo texto.' },
            replace_all: { type: 'boolean', description: 'Substituir todas as ocorrências. Padrão false.' },
          },
          required: ['old_string', 'new_string'],
        },
      },
    },
    required: ['path', 'edits'],
  },
  requiresApproval: true,

  summarize: (args, ctx) => {
    const n = Array.isArray(args.edits) ? args.edits.length : 1;
    return `${displayPath(resolvePath(args.path, ctx), ctx)} (${n} ${n === 1 ? 'edição' : 'edições'})`;
  },

  async preview(args, ctx) {
    showHunks(await plan(args, ctx), ctx);
  },

  async execute(args, ctx) {
    const p = await plan(args, ctx);
    // Garante que o arquivo não mudou entre a prévia/leitura e a gravação.
    const current = await fs.readFile(p.abs, 'utf8');
    if (current !== p.original) throw new Error('O arquivo mudou durante a edição; leia-o novamente e refaça.');
    await fs.writeFile(p.abs, p.updated, 'utf8');

    if (!ctx.previewed) showHunks(p, ctx);
    const total = p.hunks.reduce((s, h) => s + h.occurrences, 0);
    ctx.ui.fileChanged('editado', displayPath(p.abs, ctx), `(${total} ${total === 1 ? 'substituição' : 'substituições'})`);
    const lines = p.hunks.map((h) => `linha ${h.line}${h.occurrences > 1 ? ` (+${h.occurrences - 1} ocorrências)` : ''}`).join(', ');
    return `Arquivo editado: ${p.abs} — ${total} substituição(ões) em ${lines}.`;
  },
};
