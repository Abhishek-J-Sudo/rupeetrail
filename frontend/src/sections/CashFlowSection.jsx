import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeftRight, ChartColumn, Scale, Table2 } from 'lucide-react';
import { CurveCorner } from '@/components/brand/Route';
import { usePeriod } from '@/app/hooks';
import { Card, CardHeader } from '@/components/kit/Card';
import Pill from '@/components/kit/Pill';
import Segmented from '@/components/kit/Segmented';
import { cashFlowBuckets } from '@/lib/cashflow';
import { niceScale } from '@/lib/chart';
import { summarize } from '@/lib/finance';
import { formatINR, formatINRCompact } from '@/lib/money';
import { categoryBg } from '@/theme/categories';
import { countUp, stagger } from '@/theme/motion';
import { cn } from '@/lib/utils';

const HEAD = 'font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint';

// Money in (green), and money out as spent (red) with saved (teal) stacked on top.
const SERIES = [
  { key: 'income', label: 'Money in', bg: 'bg-good' },
  { key: 'spent', label: 'Spent', bg: 'bg-bad' },
  { key: 'saved', label: 'Saved', bg: 'bg-accent' },
];

function leftText(left) {
  return left >= 0 ? `${formatINR(left)} left over` : `${formatINR(-left)} more out than in`;
}

// ---------- Money in and out ----------

function Readout({ bucket }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px]" aria-live="polite">
      <span className="font-semibold text-ink">{bucket.longLabel}</span>
      {SERIES.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5 text-ink-muted">
          <span className={cn('size-2 rounded-full', s.bg)} aria-hidden="true" />
          {s.label}
          <span className="font-semibold tabular-nums text-ink">{formatINR(bucket[s.key])}</span>
        </span>
      ))}
      <span className={cn('font-semibold tabular-nums', bucket.left >= 0 ? 'text-good' : 'text-ink')}>
        {bucket.left >= 0 ? `+${formatINR(bucket.left)}` : formatINR(bucket.left)} left
      </span>
    </div>
  );
}

// Phones give every bucket a fixed width and scroll the plot sideways (the ₹ axis stays put),
// so a long period keeps readable bars instead of hairlines. It opens on the latest bucket.
const PHONE_BUCKET = 40;

function Bars({ buckets, active, onActive }) {
  const { max, ticks } = niceScale(Math.max(...buckets.map((b) => Math.max(b.income, b.spent + b.saved))));
  const scroller = useRef(null);
  const scrolls = buckets.length > 8;
  // Label every bucket up to 12, then thin them out so they don't collide
  const every = Math.ceil(buckets.length / 12);
  const everyPhone = scrolls ? 2 : Math.ceil(buckets.length / 4);
  const delay = stagger(buckets.length);
  const pct = (v) => `${(v / max) * 100}%`;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [buckets.length]);

  return (
    <div className="flex gap-2 pt-3">
      {/* Y axis labels */}
      <div className="relative h-52 w-12 shrink-0">
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-ink-faint" style={{ bottom: pct(t) }}>
            {formatINRCompact(t)}
          </span>
        ))}
        <span className="absolute bottom-0 right-0 translate-y-1/2 text-[11px] text-ink-faint">₹0</span>
      </div>

      <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain pb-1">
        <div
          className={cn(scrolls && 'max-sm:min-w-[var(--chart-w)]')}
          style={{ '--chart-w': `${buckets.length * PHONE_BUCKET}px` }}
        >
          <div className="relative h-52 border-b border-line">
            {ticks.map((t) => (
              <span key={t} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: pct(t) }} aria-hidden="true" />
            ))}
            <div className="absolute inset-0 flex items-end">
              {buckets.map((b, i) => (
                <button
                  key={b.key}
                  type="button"
                  aria-pressed={active === i}
                  aria-label={`${b.longLabel}: ${formatINR(b.income)} in, ${formatINR(b.spent)} spent, ${formatINR(b.saved)} saved`}
                  onMouseEnter={() => onActive(i)}
                  onFocus={() => onActive(i)}
                  onClick={() => onActive(i)}
                  className={cn(
                    'group relative flex h-full min-w-0 flex-1 items-end justify-center gap-[3px] rounded-t-md px-1 outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                    active === i ? 'bg-accent/[0.07]' : 'hover:bg-accent/[0.04]'
                  )}
                >
                  <motion.span
                    className="min-w-[3px] max-w-[28px] flex-1 origin-bottom rounded-t-[3px] bg-good"
                    style={{ height: pct(b.income) }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ ...countUp, delay: i * delay }}
                  />
                  <motion.span
                    className="flex min-w-[3px] max-w-[28px] flex-1 origin-bottom flex-col overflow-hidden rounded-t-[3px]"
                    style={{ height: pct(b.spent + b.saved) }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ ...countUp, delay: i * delay }}
                  >
                    <span className="bg-accent" style={{ flexGrow: b.saved }} />
                    {b.saved > 0 && b.spent > 0 && <span className="h-px shrink-0 bg-surface" />}
                    <span className="bg-bad" style={{ flexGrow: b.spent }} />
                  </motion.span>
                </button>
              ))}
            </div>
          </div>

          {/* X axis labels */}
          <div className="flex pt-2">
            {buckets.map((b, i) => (
              <span
                key={b.key}
                className={cn(
                  'flex min-w-0 flex-1 justify-center whitespace-nowrap text-[11px]',
                  active === i ? 'font-semibold text-ink' : 'text-ink-faint'
                )}
              >
                {(active === i || (i % every === 0 && Math.abs(i - active) >= every) || i % everyPhone === 0) && (
                  <span
                    className={cn(
                      active !== i && (i % every !== 0 || Math.abs(i - active) < every) && 'sm:hidden',
                      active !== i && (i % everyPhone !== 0 || Math.abs(i - active) < everyPhone) && 'max-sm:hidden'
                    )}
                  >
                    {b.label}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BucketTable({ buckets, unit }) {
  const total = buckets.reduce(
    (acc, b) => ({ income: acc.income + b.income, spent: acc.spent + b.spent, saved: acc.saved + b.saved, left: acc.left + b.left }),
    { income: 0, spent: 0, saved: 0, left: 0 }
  );
  const cols = 'grid grid-cols-[minmax(0,1fr)_repeat(2,5.5rem)] sm:grid-cols-[minmax(0,1fr)_repeat(4,7.5rem)] items-center gap-x-3';
  const money = 'text-right text-[13px] tabular-nums';
  const left = (v) => (
    <span className={cn(money, 'font-semibold', v >= 0 ? 'text-good' : 'text-ink')}>{formatINR(v, { signed: true })}</span>
  );

  return (
    <div className="flex flex-col" role="table" aria-label={`Money in and out by ${unit}`}>
      <div role="row" className={cn(cols, 'border-b border-line pb-2', HEAD)}>
        <span role="columnheader">{unit === 'week' ? 'Week' : 'Month'}</span>
        <span role="columnheader" className="text-right">In</span>
        <span role="columnheader" className="hidden text-right sm:block">Spent</span>
        <span role="columnheader" className="hidden text-right sm:block">Saved</span>
        <span role="columnheader" className="text-right">Left</span>
      </div>
      {[...buckets].reverse().map((b) => (
        <div role="row" key={b.key} className={cn(cols, 'border-b border-line/70 py-2.5')}>
          <span role="cell" className="truncate text-sm font-medium text-ink">{b.longLabel}</span>
          <span role="cell" className={cn(money, 'text-ink')}>{formatINR(b.income)}</span>
          <span role="cell" className={cn(money, 'hidden text-ink-muted sm:block')}>{formatINR(b.spent)}</span>
          <span role="cell" className={cn(money, 'hidden text-ink-muted sm:block')}>{formatINR(b.saved)}</span>
          <span role="cell" className="text-right">{left(b.left)}</span>
        </div>
      ))}
      <div role="row" className={cn(cols, 'pt-3')}>
        <span role="cell" className="text-sm font-semibold text-ink">
          Total · {buckets.length} {unit}{buckets.length === 1 ? '' : 's'}
        </span>
        <span role="cell" className={cn(money, 'font-semibold text-ink')}>{formatINR(total.income)}</span>
        <span role="cell" className={cn(money, 'hidden font-semibold text-ink sm:block')}>{formatINR(total.spent)}</span>
        <span role="cell" className={cn(money, 'hidden font-semibold text-ink sm:block')}>{formatINR(total.saved)}</span>
        <span role="cell" className="text-right">{left(total.left)}</span>
      </div>
    </div>
  );
}

const VIEWS = [
  { value: 'chart', label: 'Chart', icon: ChartColumn },
  { value: 'table', label: 'Table', icon: Table2 },
];

function InOutCard({ unit, buckets, summary }) {
  const [view, setView] = useState('chart');
  const [chosen, setChosen] = useState(null);
  // Default to the latest bucket that has any money in it
  const latest = buckets.findLastIndex((b) => b.income + b.spent + b.saved > 0);
  const active = chosen !== null && chosen < buckets.length ? chosen : Math.max(latest, 0);
  const left = summary.income - summary.spent - summary.saved;

  return (
    <Card aria-labelledby="inout-title" className="relative overflow-hidden">
      <CardHeader
        band
        id="inout-title"
        title="Money in and out"
        icon={ArrowLeftRight}
        subtitle={`${unit === 'week' ? 'Week by week' : 'Month by month'} · ${leftText(left)}`}
      >
        <Segmented label="Show as" options={VIEWS} value={view} onChange={setView} iconOnly />
      </CardHeader>

      {buckets.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-muted">No money in or out in this period.</p>
      ) : view === 'chart' ? (
        <div className="flex flex-col gap-4">
          <Readout bucket={buckets[active]} />
          <Bars buckets={buckets} active={active} onActive={setChosen} />
          <p className="text-xs text-ink-faint">
            Left bar: money in. Right bar: spent, with saved on top. Point at a {unit} to see its numbers.
            {buckets.length > 8 && <span className="sm:hidden"> Swipe the chart for earlier {unit}s.</span>}
          </p>
        </div>
      ) : (
        <BucketTable buckets={buckets} unit={unit} />
      )}
    </Card>
  );
}

// ---------- Profit and loss ----------

const SHOWN_SOURCES = 6;

// Name · share · amount, plus the monthly average when the period spans months. Phones show
// name and amount only, so the line names aren't cut short.
const pnlCols = (months) =>
  cn(
    'grid grid-cols-[minmax(0,1fr)_6.5rem] gap-x-3 sm:grid-cols-[minmax(0,1fr)_4rem_6.5rem]',
    months > 1 && 'sm:grid-cols-[minmax(0,1fr)_4rem_6.5rem_6.5rem]'
  );

function PnlRow({ name, dot, amount, base, months, strong = false }) {
  return (
    <div role="row" className={cn(pnlCols(months), 'items-center py-2')}>
      <span role="cell" className={cn('flex min-w-0 items-center gap-2 text-sm', strong ? 'font-semibold text-ink' : 'text-ink')}>
        {dot && <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden="true" />}
        <span className="truncate">{name}</span>
      </span>
      <span role="cell" className="hidden text-right text-[13px] tabular-nums text-ink-faint sm:block">
        {base > 0 ? `${((amount / base) * 100).toFixed(1)}%` : base === 0 ? '–' : ''}
      </span>
      <span role="cell" className={cn('text-right text-[13px] tabular-nums', strong ? 'font-semibold text-ink' : 'text-ink')}>
        {formatINR(amount)}
      </span>
      {months > 1 && (
        <span role="cell" className="hidden text-right text-[13px] tabular-nums text-ink-muted sm:block">
          {formatINR(amount / months)}
        </span>
      )}
    </div>
  );
}

function PnlGroup({ title, total, base, months, children }) {
  return (
    <div role="rowgroup" className="flex flex-col">
      <div className="border-b border-line">
        <PnlRow name={title} amount={total} base={base} months={months} strong />
      </div>
      <div className="flex flex-col divide-y divide-line/60">{children}</div>
    </div>
  );
}

function PnlCard({ summary }) {
  const { income, spent, saved, sources, categories } = summary;
  const months = Math.max(summary.months, 1);
  const left = income - spent - saved;
  const shown = sources.slice(0, SHOWN_SOURCES);
  const rest = sources.slice(SHOWN_SOURCES);
  const restTotal = rest.reduce((s, r) => s + r.amount, 0);
  // Shares: money in against income, money out (spent and saved) against all money out
  const out = spent + saved;
  const inRow = { base: income, months };
  const outRow = { base: out, months };

  const head = (
    <div className={cn(pnlCols(months), 'pb-1', HEAD)} role="row">
      <span role="columnheader">Line</span>
      <span role="columnheader" className="hidden text-right sm:block">Share</span>
      <span role="columnheader" className="text-right">Amount</span>
      {months > 1 && <span role="columnheader" className="hidden text-right sm:block">Per month</span>}
    </div>
  );

  return (
    <Card aria-labelledby="pnl-title" className="relative overflow-hidden">
      <CurveCorner className="stroke-accent/35" />
      <CardHeader
        band
        id="pnl-title"
        title="Profit and loss"
        icon={Scale}
        subtitle={`${formatINR(income)} in · ${formatINR(spent)} spent · ${formatINR(saved)} saved`}
      >
        {left >= 0 ? <Pill tone="good">Kept {formatINRCompact(left)}</Pill> : <Pill tone="warn">From balance</Pill>}
      </CardHeader>

      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
        <div role="table" aria-label="Money in, saved and what was left" className="flex flex-col gap-5">
          {head}
          <PnlGroup title="Money in" total={income} {...inRow}>
            {shown.map((s) => (
              <PnlRow key={s.name} name={s.name} amount={s.amount} dot="bg-good" {...inRow} />
            ))}
            {rest.length > 0 && (
              <PnlRow name={`${rest.length} other source${rest.length === 1 ? '' : 's'}`} amount={restTotal} dot="bg-good/50" {...inRow} />
            )}
          </PnlGroup>
          <PnlGroup title="Saved and invested" total={saved} {...outRow} />
          <PnlGroup title="Spent" total={spent} {...outRow} />
          {/* The bottom line: what stayed in the account, or what came out of the balance */}
          <div role="rowgroup" className="rounded-control bg-surface-2 px-3 ring-1 ring-line">
            <PnlRow name={left >= 0 ? 'Left in account' : 'Taken from balance'} amount={Math.abs(left)} months={months} strong />
          </div>
        </div>

        <div role="table" aria-label="Spending by category" className="flex flex-col gap-5">
          <div className="hidden lg:block">{head}</div>
          <PnlGroup title="Spending by category" total={spent} {...outRow}>
            {categories.map((c) => (
              <PnlRow key={c.name} name={c.name} amount={c.amount} dot={categoryBg(c.name)} {...outRow} />
            ))}
          </PnlGroup>
        </div>
      </div>
    </Card>
  );
}

// ---------- Section ----------

export default function CashFlowSection() {
  const { periodTransactions, mode, anchor } = usePeriod();
  const summary = useMemo(() => summarize(periodTransactions), [periodTransactions]);
  const { unit, buckets } = useMemo(() => cashFlowBuckets(periodTransactions, mode, anchor), [periodTransactions, mode, anchor]);

  return (
    <div className="flex flex-col gap-4">
      <InOutCard unit={unit} buckets={buckets} summary={summary} />
      <PnlCard summary={summary} />
    </div>
  );
}
