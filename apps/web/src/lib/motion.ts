import type { Transition, Variants } from "motion/react";

/** Mirrors the duration/easing tokens in styles/tokens.css (seconds for Motion). */
export const duration = { fast: 0.12, base: 0.22, slow: 0.32 } as const;
export const easeStandard = [0.2, 0, 0, 1] as const;
export const easeEmphasized = [0.16, 1, 0.3, 1] as const;

export const baseTransition: Transition = { duration: duration.base, ease: easeStandard };

/** Fade + 12px rise: page and section entrances. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: easeEmphasized } },
};

/** Parent variant that staggers children; keep lists short (<~20 items). */
export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
