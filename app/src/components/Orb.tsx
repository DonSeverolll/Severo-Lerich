import { useEffect, useRef } from 'react';
import { useApp } from '../lib/store';
import type { OrbState } from '../lib/types';

interface Props {
  /** px (número) ou qualquer tamanho CSS, ex.: 'min(240px, 58vw)'. */
  size: number | string;
  state?: OrbState;
  onClick?: () => void;
  label?: string;
  className?: string;
}

/**
 * Orbe Morph dourado — ícone central de interação. O nível do microfone/voz é aplicado direto
 * na variável CSS --lvl (suavizado a cada quadro), sem re-renderizar o React.
 */
export function Orb({ size, state, onClick, label, className = '' }: Props) {
  const ref = useRef<HTMLElement>(null);
  const globalState = useApp((s) => s.orb);
  const current = state ?? globalState;

  useEffect(() => {
    let raf = 0;
    let shown = 0;
    const loop = () => {
      const target = useApp.getState().micLevel;
      shown += (target - shown) * (target > shown ? 0.45 : 0.12);
      ref.current?.style.setProperty('--lvl', shown.toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const style = { '--size': typeof size === 'number' ? `${size}px` : size } as React.CSSProperties;
  const inner = (
    <>
      <span className="orb__aura" />
      <span className="orb__ring" />
      <span className="orb__ring orb__ring--b" />
      <span className="orb__disc" />
      <span className="orb__rim" />
    </>
  );
  const cls = `orb ${typeof size === 'number' && size < 80 ? 'orb--small' : ''} ${className}`;

  if (!onClick) {
    return (
      <span ref={ref as React.RefObject<HTMLSpanElement>} className={cls} data-state={current} style={{ ...style, display: 'block' }} aria-hidden>
        {inner}
      </span>
    );
  }
  return (
    <button ref={ref as React.RefObject<HTMLButtonElement>} type="button" className={cls} data-state={current} style={style} onClick={onClick} aria-label={label} title={label}>
      {inner}
    </button>
  );
}
