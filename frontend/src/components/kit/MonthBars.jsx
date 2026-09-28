import { motion } from 'motion/react';
import { niceScale } from '@/lib/chart';
import { formatINR, formatINRCompact } from '@/lib/money';
import { countUp, stagger } from '@/theme/motion';
import { cn } from '@/lib/utils';

// One bar per month, drawn with token-coloured elements (no Recharts, so themes need no
// re-read). `months` = [{ key, label ('Sep 26'), longLabel, amount, inPeriod }]: months outside
// the period are faded. `line` draws a dashed reference (an average or a target). Bars are
// buttons: hover, focus or click reports the month through `onActive`.
export default function MonthBars({ months, barClass, line = null, active, onActive }) {
  const { max, ticks } = niceScale(Math.max(line || 0, ...months.map((m) => m.amount)));
  const delay = stagger(months.length);
  const pct = (v) => `${(v / max) * 100}%`;

  return (
    <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 pt-4">
      <div className="relative h-44">
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-ink-faint" style={{ bottom: pct(t) }}>
            {formatINRCompact(t)}
          </span>
        ))}
        <span className="absolute bottom-0 right-0 translate-y-1/2 text-[11px] text-ink-faint">₹0</span>
      </div>

      <div className="relative h-44 border-b border-line">
        {ticks.map((t) => (
          <span key={t} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: pct(t) }} aria-hidden="true" />
        ))}
        <div className="absolute inset-0 flex items-end">
          {months.map((m, i) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={active === i}
              aria-label={`${m.longLabel}: ${formatINR(m.amount)}${m.inPeriod ? ', in this period' : ''}`}
              onMouseEnter={() => onActive(i)}
              onFocus={() => onActive(i)}
              onClick={() => onActive(i)}
              className={cn(
                'relative flex h-full min-w-0 flex-1 items-end justify-center rounded-t-md px-[3px] outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-accent sm:px-1.5',
                active === i ? 'bg-accent/[0.07]' : 'hover:bg-accent/[0.04]'
              )}
            >
              <motion.span
                className={cn('w-full max-w-[26px] origin-bottom rounded-t-[3px]', barClass, !m.inPeriod && 'opacity-35')}
                style={{ height: pct(m.amount) }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ ...countUp, delay: i * delay }}
              />
            </button>
          ))}
        </div>
        {line > 0 && (
          <span
            className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-ink-muted"
            style={{ bottom: pct(line) }}
            aria-hidden="true"
          />
        )}
      </div>

      <div />
      <div className="flex pt-2">
        {months.map((m, i) => (
          <span
            key={m.key}
            className={cn(
              'flex min-w-0 flex-1 justify-center whitespace-nowrap text-[11px]',
              active === i ? 'font-semibold text-ink' : 'text-ink-faint',
              // Phones: every third month counting back from the last, never beside the active one
              active !== i && ((months.length - 1 - i) % 3 !== 0 || Math.abs(i - active) === 1) && 'max-sm:invisible'
            )}
          >
            {m.label.split(' ')[0]}
          </span>
        ))}
      </div>
    </div>
  );
}
