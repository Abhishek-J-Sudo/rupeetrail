import { useLayoutEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { spring } from '@/theme/motion';
import { cn } from '@/lib/utils';
import { usePeriod } from './hooks';
import { PERIOD_MODES, SHORT, periodRange } from './period';

export function PeriodSwitcher() {
  const { mode, setMode } = usePeriod();
  return (
    <div role="group" aria-label="Period" className="flex shrink-0 gap-0.5 rounded-control bg-track p-[3px]">
      {PERIOD_MODES.map(({ id, label }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => setMode(id)}
            className={cn(
              'relative rounded-[6px] px-3 py-1.5 text-[13px] transition-colors duration-fast',
              active ? 'font-semibold text-ink' : 'font-medium text-ink-muted hover:text-ink'
            )}
          >
            {active && (
              <motion.span
                layoutId="period-pill"
                transition={spring}
                className="absolute inset-0 rounded-[6px] bg-surface shadow-card"
              />
            )}
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// `glide`: delay in seconds for sliding in from the right when the tags change (null = no slide)
function Chip({ selected, inRange, disabled, onClick, label, glide = null, children }) {
  return (
    <motion.button
      initial={glide === null ? false : { opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...spring, delay: glide ?? 0 }}
      type="button"
      aria-pressed={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative shrink-0 rounded-full px-2 py-1 xl:px-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.04em] outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-accent',
        selected && 'text-accent-fg',
        !selected && inRange && 'bg-accent-soft text-accent',
        !selected && !inRange && !disabled && 'text-ink-muted hover:bg-surface-2 hover:text-ink',
        disabled && 'cursor-default text-ink-faint/50'
      )}
    >
      {selected && (
        <motion.span layoutId="period-chip" transition={spring} className="absolute inset-0 rounded-full bg-accent" />
      )}
      <span className="relative">{children}</span>
    </motion.button>
  );
}

// Period controls as a row of tags: the Month / 3 months / Year / All switcher, then the
// years with data and (except in Year mode) that year's months. In 3 months mode the whole
// range is tinted. Months without statements are shown but can't be picked.
// `compact` (the report header): one line, tags right-aligned before the switcher, which sits
// at the far right; the tags scroll sideways when they don't fit.
export default function PeriodBar({ className, compact = false }) {
  const { mode, anchor, setAnchor, months } = usePeriod();
  const years = [...new Set(months.map((m) => m.slice(0, 4)))].sort();
  const year = anchor?.slice(0, 4);
  const range = periodRange(mode, anchor);
  const showTags = mode !== 'all' && anchor;
  const tagsRef = useRef(null);

  // On narrow screens the tags scroll sideways; keep the selected one in view
  useLayoutEffect(() => {
    const row = tagsRef.current;
    const chip = row?.querySelector('[aria-pressed="true"]');
    if (!chip || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft = chip.offsetLeft - row.clientWidth / 2 + chip.offsetWidth / 2;
  }, [mode, anchor]);

  // Picking a year keeps the same month when it has data, else jumps to the year's latest month
  const pickYear = (y) => {
    const same = `${y}-${anchor.slice(5)}`;
    setAnchor(months.includes(same) ? same : months.find((m) => m.startsWith(y)));
  };

  // Tags in reading order; in the header they glide in from the right, rightmost first
  const tags = showTags
    ? [
        ...years.map((y) => ({
          key: y,
          label: y,
          selected: mode === 'year' && y === year,
          inRange: mode !== 'year' && y === year,
          onClick: () => pickYear(y),
        })),
        ...(mode === 'year'
          ? []
          : [
              { key: 'divider' },
              ...SHORT.map((name, i) => {
                const key = `${year}-${String(i + 1).padStart(2, '0')}`;
                return {
                  key,
                  label: name,
                  aria: `${name} ${year}`,
                  selected: key === anchor,
                  inRange: range && key >= range.start && key <= range.end,
                  disabled: !months.includes(key),
                  onClick: () => setAnchor(key),
                };
              }),
            ]),
      ]
    : [];
  const glide = (i) => (compact ? (tags.length - 1 - i) * 0.018 : null);
  // A new set of tags (Year vs a year's months) remounts, so it glides in afresh
  const group = mode === 'year' ? 'years' : `months-${year}`;

  const tagRow = showTags && (
    <div
      ref={tagsRef}
      className={cn(
        'relative flex min-w-0 items-center overflow-x-auto',
        compact ? 'flex-1' : '-mx-4 basis-full px-4 md:mx-0 md:basis-auto md:flex-1 md:px-0'
      )}
    >
      {/* ml-auto (not justify-end) keeps the start reachable when the row scrolls */}
      <div key={group} className={cn('flex items-center gap-1', compact && 'ml-auto')}>
        {tags.map((t, i) =>
          t.key === 'divider' ? (
            <motion.span
              key="divider"
              initial={compact ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ ...spring, delay: glide(i) ?? 0 }}
              className="mx-1.5 h-4 w-px shrink-0 bg-line"
              aria-hidden="true"
            />
          ) : (
            <Chip
              key={t.key}
              label={t.aria}
              selected={t.selected}
              inRange={t.inRange}
              disabled={t.disabled}
              onClick={t.onClick}
              glide={glide(i)}
            >
              {t.label}
            </Chip>
          )
        )}
      </div>
    </div>
  );

  return (
    <div
      role="group"
      aria-label="Choose period"
      className={cn('flex items-center gap-x-4 gap-y-2', compact ? 'min-w-0 flex-nowrap' : 'flex-wrap', className)}
    >
      {compact ? (
        <>
          {tagRow || <span className="flex-1" />}
          <PeriodSwitcher />
        </>
      ) : (
        <>
          <PeriodSwitcher />
          {tagRow}
        </>
      )}
    </div>
  );
}
