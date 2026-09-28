import { CurveCorner } from '@/components/brand/Route';
import { cn } from '@/lib/utils';
import CountUp from './CountUp';

// One headline number: a small label, the amount, and a line of context under it.
// `hero` fills the tile slate-teal (use for one tile per row, as the row's anchor). `format`
// turns the number into text (rupees by default).
export default function KpiTile({ label, value, format, hero = false, children }) {
  return (
    <div
      className={cn(
        'rt-live relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-card px-4 py-4 transition-[transform,box-shadow] duration-base ease-out hover:-translate-y-0.5 hover:shadow-lift sm:px-5 sm:py-[18px]',
        hero ? 'bg-sidebar-active text-sidebar-active-ink' : 'border border-line bg-surface shadow-card'
      )}
    >
      <CurveCorner className={hero ? 'stroke-sidebar-active-ink/40' : 'stroke-accent/35'} />
      <span
        className={cn(
          'relative font-mono text-[11px] uppercase tracking-[0.06em]',
          hero ? 'text-sidebar-active-ink/75' : 'text-ink-faint'
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'relative truncate font-display text-2xl font-semibold tracking-tight sm:text-[30px] sm:leading-9',
          hero ? 'text-sidebar-active-ink' : 'text-ink'
        )}
      >
        <CountUp value={value} format={format} />
      </span>
      {children && (
        <span
          className={cn(
            'relative flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]',
            hero ? 'text-sidebar-active-ink/80' : 'text-ink-muted'
          )}
        >
          {children}
        </span>
      )}
    </div>
  );
}
