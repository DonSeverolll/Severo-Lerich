import path from 'node:path';
import { highlight, supportsLanguage } from 'cli-highlight';

const EXT_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.ps1': 'powershell', '.psm1': 'powershell', '.bat': 'dos', '.cmd': 'dos',
  '.sh': 'bash', '.bash': 'bash', '.json': 'json', '.md': 'markdown', '.html': 'xml', '.htm': 'xml',
  '.xml': 'xml', '.svg': 'xml', '.css': 'css', '.scss': 'scss', '.yml': 'yaml', '.yaml': 'yaml',
  '.toml': 'ini', '.ini': 'ini', '.env': 'ini', '.cs': 'csharp', '.java': 'java', '.go': 'go',
  '.rs': 'rust', '.rb': 'ruby', '.php': 'php', '.sql': 'sql', '.c': 'c', '.h': 'c', '.cpp': 'cpp',
  '.hpp': 'cpp', '.kt': 'kotlin', '.swift': 'swift', '.dockerfile': 'dockerfile',
};

const ALIASES: Record<string, string> = { ps: 'powershell', ps1: 'powershell', pwsh: 'powershell', sh: 'bash', shell: 'bash', ts: 'typescript', js: 'javascript', py: 'python', cmd: 'dos', bat: 'dos', yml: 'yaml' };

export function languageFromPath(filePath: string): string | undefined {
  const base = path.basename(filePath).toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  return EXT_LANG[path.extname(base)];
}

export function highlightCode(code: string, language?: string): string {
  const lang = language ? (ALIASES[language.toLowerCase()] ?? language.toLowerCase()) : undefined;
  try {
    return highlight(code, { language: lang && supportsLanguage(lang) ? lang : undefined, ignoreIllegals: true });
  } catch {
    return code;
  }
}
