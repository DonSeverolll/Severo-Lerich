import type { Provider } from './types';

/**
 * Ordem de fallback padrão — mesma do llm_fallback.py: o app tenta de cima para baixo,
 * pula provedores sem chave e passa para o próximo em qualquer falha.
 * Tudo é editável em Configurações (ordem, modelo, URL, provedores extras).
 */
export const DEFAULT_PROVIDERS: Provider[] = [
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', apiKey: '', enabled: true },
  { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', model: 'llama3.1-70b', apiKey: '', enabled: true },
  { id: 'gemini', name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', apiKey: '', enabled: true },
  { id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', apiKey: '', enabled: true },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', apiKey: '', enabled: true },
];

/** Onde gerar cada chave (exibido nas Configurações). */
export const KEY_LINKS: Record<string, string> = {
  groq: 'https://console.groq.com/keys',
  cerebras: 'https://cloud.cerebras.ai/',
  gemini: 'https://aistudio.google.com/app/apikey',
  mistral: 'https://console.mistral.ai/api-keys',
  openrouter: 'https://openrouter.ai/keys',
};

export function splitKeys(apiKey: string): string[] {
  return apiKey.split(/[,;\s]+/).map((k) => k.trim()).filter(Boolean);
}
