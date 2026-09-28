// Shared animation settings for Motion (framer-motion), so every animated element moves
// the same way. CSS transitions use the matching --rt-dur-* / --rt-ease-* tokens.

// Default for panels, cards, drawers, layout moves: quick with a soft settle.
export const spring = { type: 'spring', duration: 0.35, bounce: 0.15 };

// Hover and press feedback.
export const springFast = { type: 'spring', duration: 0.18, bounce: 0.2 };

// Page content when switching screens: the old one fades out quickly, the new one eases up
// into place (a tween, so it settles without a bounce). The header stays put.
export const pageTransition = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } },
};

// Lists and tile rows: children appear 25ms apart, never more than ~300ms in total.
export function stagger(count) {
  return Math.min(0.025, 0.3 / Math.max(count, 1));
}

// KPI numbers rolling to a new value, and bars/ribbons appearing. Tween, not spring,
// so numbers never overshoot. Ease matches --rt-ease-out.
export const countUp = { duration: 0.45, ease: [0.22, 1, 0.36, 1] };

export const pressable ={ whileTap: { scale: 0.97 }, transition: springFast };
