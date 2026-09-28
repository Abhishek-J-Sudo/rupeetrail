import { useId } from 'react';
import { cn } from '@/lib/utils';

// Brand motifs from docs/brand/elements, redrawn as SVG so they follow the theme.
// Their moving parts carry rt-dash / rt-stop / rt-curve: inside an `rt-live` container they
// animate on hover, inside `rt-ambient` all the time (keyframes in index.css).

// "Shapes & containers": a smooth trail curve rising into a card's bottom-right corner.
// Place inside a `relative overflow-hidden` container; set the stroke colour via className.
export function CurveCorner({ className }) {
  return (
    <svg
      viewBox="0 0 180 100"
      fill="none"
      aria-hidden="true"
      className={cn('pointer-events-none absolute bottom-0 right-0 hidden h-[100px] w-[180px] sm:block', className)}
    >
      <path d="M50 101C84 101 90 66 126 66H181" strokeWidth="1.5" className="rt-curve" />
    </svg>
  );
}

// "Example usage": a dashed trail with two stops, ending at an orange marker. For dark banners.
export function DashedTrail({ className }) {
  return (
    <svg
      viewBox="0 0 300 80"
      fill="none"
      aria-hidden="true"
      className={cn('pointer-events-none absolute right-0 top-0 h-full w-[300px]', className)}
    >
      <path d="M0 62H96C132 62 138 22 176 22H286" className="rt-dash stroke-accent" strokeOpacity="0.9" strokeWidth="1.5" strokeDasharray="5 5" />
      <circle cx="96" cy="62" r="4" className="fill-sidebar stroke-sidebar-muted" strokeWidth="1.5" />
      <circle cx="176" cy="22" r="4.5" className="fill-accent" />
      <circle cx="286" cy="22" r="4" className="rt-stop fill-cta" />
    </svg>
  );
}

// Light take on DashedTrail, for tinted heading bands on white cards.
export function LightTrail({ className }) {
  return (
    <svg
      viewBox="0 0 220 64"
      fill="none"
      aria-hidden="true"
      className={cn('pointer-events-none absolute top-0 hidden h-full w-[220px] sm:block', className)}
    >
      <path d="M0 48H70C96 48 102 18 130 18H206" className="rt-dash stroke-accent/50" strokeWidth="1.25" strokeDasharray="4 4" />
      <circle cx="70" cy="48" r="3.5" className="fill-surface-2 stroke-accent/70" strokeWidth="1.25" />
      <circle cx="130" cy="18" r="3.5" className="fill-accent/70" />
      <circle cx="208" cy="18" r="3" className="rt-stop fill-cta" />
    </svg>
  );
}

// Page background ("pattern light tile"): a repeating route pattern, strongest at the page
// edge (`edge` = top or bottom) and fading out towards the middle. Place first inside a `relative isolate` container whose
// content is `relative`, so it shows only in the gaps between cards.
export function PageRoutes({ edge = 'top', className }) {
  const id = useId();
  const fade = `linear-gradient(to ${edge === 'top' ? 'bottom' : 'top'}, black, transparent 520px)`;
  return (
    <svg
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-x-0 h-[560px] w-full', edge === 'top' ? 'top-0' : 'bottom-0', className)}
      style={{ maskImage: fade, WebkitMaskImage: fade }}
    >
      <defs>
        <pattern id={id} width="280" height="180" patternUnits="userSpaceOnUse">
          <g fill="none" className="stroke-accent/[0.09]" strokeWidth="1">
            <path d="M0 24H48V58H112V34H176V74H232V50H280" />
            <path d="M0 120H36V146H96V110H150V136H214V104H280" />
            <path d="M200 0V16" />
            <path d="M60 180V160H124" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${CSS.escape(id)})`} />
    </svg>
  );
}

// "Icon style": a line icon in a soft teal tile, with a dotted trail tail ending in a stop.
export function TrailIcon({ icon: Icon, className }) {
  return (
    <span className={cn('relative inline-flex shrink-0 pb-1 pr-3', className)} aria-hidden="true">
      <span className="flex size-9 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
        <Icon className="size-[18px]" strokeWidth={1.8} />
      </span>
      <svg viewBox="0 0 18 14" fill="none" className="absolute -right-0.5 bottom-0 h-3.5 w-[18px]">
        <path d="M1 1C4 1 5 10 10 10H13" className="rt-dash stroke-accent" strokeWidth="1.5" strokeDasharray="2 2" strokeLinecap="round" />
        <circle cx="15" cy="10" r="2" className="rt-stop fill-accent" />
      </svg>
    </span>
  );
}

// "Trail with orange marker": a short route that steps up and ends at an orange stop.
export function TrailMark({ className }) {
  return (
    <svg viewBox="0 0 40 10" fill="none" aria-hidden="true" className={cn('h-2.5 w-10 shrink-0', className)}>
      <path d="M1 8H14L18 3H30" className="stroke-accent" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="34" cy="3" r="2.5" className="rt-stop fill-cta" />
    </svg>
  );
}
