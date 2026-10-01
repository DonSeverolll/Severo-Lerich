/** Detecção de ambiente: navegador (dev), Tauri desktop ou Tauri Android. */

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const isAndroid = /android/i.test(navigator.userAgent);
export const isWindows = /windows/i.test(navigator.userAgent);
/** O agente com acesso ao sistema (PowerShell, arquivos) só existe no app desktop. */
export const hasSystemTools = isTauri && !isAndroid;

/**
 * fetch que, dentro do Tauri, sai pelo Rust (plugin-http): sem bloqueio de CORS e com streaming.
 * No navegador (npm run dev) usa o fetch normal.
 */
export async function httpFetch(input: string, init?: RequestInit): Promise<Response> {
  if (isTauri) {
    const { fetch } = await import('@tauri-apps/plugin-http');
    return fetch(input, init);
  }
  return fetch(input, init);
}
