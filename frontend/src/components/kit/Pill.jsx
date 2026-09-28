import { cn } from '@/lib/utils';

// Status tag in the brand's language: a trail stop (node) in the tone plus a mono label, no
// background. A red ("bad") pill means over budget and nothing else; use warn for "near the limit"
// or "went up". `inverse` is for dark surfaces such as the hero tile.
const NODE = { good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad', accent: 'bg-accent', neutral: 'bg-ink-faint' };
const TEXT = { good: 'text-good', warn: 'text-warn', bad: 'text-bad', accent: 'text-accent', neutral: 'text-ink-muted' };

export default function Pill({ tone = 'neutral', inverse = false, className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] font-medium uppercase tracking-[0.04em]',
        inverse ? 'text-sidebar-active-ink' : TEXT[tone],
        className
      )}
    >
      <span
        className={cn('size-2 shrink-0 rounded-full', NODE[tone], inverse && 'ring-1 ring-sidebar-active-ink/60')}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
