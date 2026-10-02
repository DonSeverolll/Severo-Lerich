import type { Transition, Variants } from 'motion/react';

/**
 * Tokens de movimento (DESIGN.md › Motion). Ponderação: Jakub primário (polimento sutil),
 * Emil secundário (só anima o que tem propósito). Reduced motion é aplicado globalmente
 * pelo <MotionConfig reducedMotion="user"> em App.tsx.
 */

export const spring: Transition = { type: 'spring', duration: 0.4, bounce: 0 };
export const easeOut = [0.22, 1, 0.36, 1] as const;

/** Entrada: opacidade + leve subida + desfoque → foco. Saída mais sutil que a entrada. */
export const enter: Variants = {
  initial: { opacity: 0, y: 8, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.22, ease: easeOut } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15, ease: easeOut } },
};

/** Troca de tela (chat ↔ configurações): só opacidade, rápida. */
export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.18, ease: easeOut } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: easeOut } },
};
