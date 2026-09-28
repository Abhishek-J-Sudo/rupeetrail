// Small helpers for the hand-drawn (non-Recharts) bar charts.

// A round step (1, 2, 2.5 or 5 × 10ⁿ) that splits `max` into at most four gridlines.
export function niceStep(max) {
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * power).find((step) => step >= raw);
}

// Axis top and gridline values for bars up to `tallest`.
export function niceScale(tallest) {
  const step = niceStep(Math.max(tallest, 1));
  const max = Math.ceil(Math.max(tallest, 1) / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) }, (_, i) => (i + 1) * step);
  return { max, ticks };
}
