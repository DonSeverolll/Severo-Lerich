import { useEffect } from 'react';
import { useApp } from './store';

const META_COLORS = { dark: '#0c0a09', light: '#fafaf9' } as const;

function resolve(pref: 'system' | 'dark' | 'light'): 'dark' | 'light' {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function apply(theme: 'dark' | 'light') {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[theme]);
}

/** Aplica o tema escolhido (ou o do sistema) em <html data-theme> e acompanha mudanças do sistema. */
export function useTheme(): void {
  const pref = useApp((s) => s.settings.theme);
  useEffect(() => {
    apply(resolve(pref));
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => apply(resolve('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);
}
