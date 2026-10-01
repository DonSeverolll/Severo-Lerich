import type { ToolSchema } from '../llm/types.js';
import { editFileDiff } from './edit_file_diff.js';
import { executeCommand } from './execute_command.js';
import { fileSearch } from './file_search.js';
import { listDirectory } from './list_directory.js';
import { readFile } from './read_file.js';
import type { Tool } from './types.js';
import { writeFile } from './write_file.js';

export const ALL_TOOLS: Tool[] = [executeCommand, writeFile, readFile, editFileDiff, listDirectory, fileSearch];

export function toSchemas(tools: Tool[]): ToolSchema[] {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export type { Tool, ToolContext } from './types.js';
