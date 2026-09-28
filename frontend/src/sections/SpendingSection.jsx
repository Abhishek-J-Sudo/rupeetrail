import { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, Crosshair, GitCompareArrows } from 'lucide-react';
import { CurveCorner } from '@/components/brand/Route';
import { useData, usePeriod } from '@/app/hooks';
import { Card, CardHeader } from '@/components/kit/Card';
import MonthBars from '@/components/kit/MonthBars';
import Select from '@/components/kit/Select';
import { formatChange, formatINR } from '@/lib/money';
import { baselineOptions, categoryDetail, categoryMonths, compareCategories, currentRange } from '@/lib/spending';
import { summarize } from '@/lib/finance';
import { categoryBg } from '@/theme/categories';
import { countUp, stagger } from '@/theme/motion';
import { cn } from '@/lib/utils';
import { payeeName } from '@/lib/payee';

const HEAD = 'font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint';

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// "+₹2,400" in warn (spent more) or "−₹1,100" in good (spent less). Not red: red text means over budget.
function Change({ diff, before, className }) {
  if (Math.round(diff) === 0) return <span className={cn('text-[13px] text-ink-faint', className)}>No change</span>;
  const up = diff > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center justify-end gap-1 text-[13px] font-semibold tabular-nums', up ? 'text-warn' : 'text-good', className)}>
      <Icon className="size-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      {formatINR(diff, { signed: true })}
      <span className="font-normal text-ink-faint">{before > 0 ? formatChange(diff / before) : 'new'}</span>
    </span>
  );
}

// ---------- What changed ----------

const SHOWN_ROWS = 8;

function ChangeRow({ row, scale, index, delay, beforeLabel, onFocus }) {
  const pct = (v) => `${(v / scale) * 100}%`;
  return (
    <li>
      <button
        type="button"
        onClick={() => onFocus(row.name)}
        aria-label={`${row.name}: ${formatINR(row.now)}, was ${formatINR(row.before)} in ${beforeLabel}. Show this category`}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-control px-2 py-2.5 text-left outline-none transition-colors duration-fast hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent sm:grid-cols-[10rem_minmax(0,1fr)_6.5rem_9.5rem] sm:gap-y-0"
      >
        <span className="order-1 flex min-w-0 items-center gap-2 text-sm font-medium text-ink sm:order-none">
          <span className={cn('size-2 shrink-0 rounded-full', categoryBg(row.name))} aria-hidden="true" />
          <span className="truncate">{row.name}</span>
        </span>
        {/* This period (category colour) over the baseline (faint), on one shared scale */}
        <span className="order-3 col-span-2 flex flex-col gap-1 sm:order-none sm:col-span-1" aria-hidden="true">
          <motion.span
            className={cn('block h-2 origin-left rounded-full', categoryBg(row.name))}
            style={{ width: pct(row.now) }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ ...countUp, delay: index * delay }}
          />
          <motion.span
            className="block h-1 origin-left rounded-full bg-ink-faint/40"
            style={{ width: pct(row.before) }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ ...countUp, delay: index * delay }}
          />
        </span>
        <span className="hidden flex-col items-end text-[13px] tabular-nums sm:flex">
          <span className="text-ink">{formatINR(row.now)}</span>
          <span className="text-xs text-ink-faint">was {formatINR(row.before)}</span>
        </span>
        <Change diff={row.diff} before={row.before} className="order-2 sm:order-none" />
      </button>
    </li>
  );
}

function ChangeCard({ transactions, mode, range, onFocus }) {
  const options = useMemo(() => baselineOptions(mode, range), [mode, range]);
  const months = useMemo(() => new Set(transactions.map((t) => t.date.slice(0, 7))), [transactions]);
  const hasData = (o) => [...months].some((m) => m >= o.range.start && m <= o.range.end);
  const [chosen, setChosen] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const option = options.find((o) => o.value === chosen) || options.find(hasData) || options[0];
  const result = useMemo(
    () => option && compareCategories(transactions, range, option.range),
    [transactions, range, option]
  );

  if (!option) return null;
  const empty = !hasData(option);
  const rows = showAll ? result.rows : result.rows.slice(0, SHOWN_ROWS);
  const scale = Math.max(1, ...result.rows.map((r) => Math.max(r.now, r.before)));
  const diff = result.now - result.before;
  const delay = stagger(rows.length);
  // Only when there's a choice; a year has just the year before, named in the subtitle
  const compareWith = options.length > 1 && (
    <Select
      label="Compare with"
      value={option.value}
      onChange={setChosen}
      options={options.map((o) => ({ value: o.value, label: `vs ${o.label}` }))}
    />
  );

  return (
    <Card aria-labelledby="changed-title" className="relative overflow-hidden">
      <CurveCorner className="stroke-accent/35" />
      <CardHeader
        band
        id="changed-title"
        title="What changed"
        icon={GitCompareArrows}
        subtitle={`${result.label} against ${option.label}, biggest change first`}
      >
        {compareWith && <div className="hidden sm:block">{compareWith}</div>}
      </CardHeader>
      {compareWith && <div className="flex flex-col sm:hidden">{compareWith}</div>}

      {empty ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          No statements for {option.label} yet, so there&apos;s nothing to compare with.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-2xl font-semibold tabular-nums text-ink">{formatINR(result.now)}</span>
            <span className="text-sm text-ink-muted">spent, against {formatINR(result.before)} in {option.label}</span>
            <Change diff={diff} before={result.before} />
          </div>

          <div className={cn('hidden items-center gap-4 px-2 sm:flex', HEAD)}>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-ink-muted" aria-hidden="true" />
              {result.label}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-4 rounded-full bg-ink-faint/40" aria-hidden="true" />
              {option.label}
            </span>
            <span className="ml-auto normal-case tracking-normal">Pick a row to look closer</span>
          </div>

          <ul className="-mx-2 flex flex-col divide-y divide-line/60">
            {rows.map((row, i) => (
              <ChangeRow
                key={row.name}
                row={row}
                scale={scale}
                index={i}
                delay={delay}
                beforeLabel={option.label}
                onFocus={onFocus}
              />
            ))}
          </ul>

          {result.rows.length > SHOWN_ROWS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="group inline-flex items-center gap-1 self-start text-[13px] font-semibold text-accent transition-colors duration-fast hover:text-accent-hover"
            >
              {showAll ? 'Show fewer' : `Show all ${result.rows.length} categories`}
              <ChevronDown
                className={cn('size-3.5 transition-transform duration-fast', showAll && 'rotate-180')}
                strokeWidth={2}
                aria-hidden="true"
              />
            </button>
          )}
        </>
      )}
    </Card>
  );
}

// ---------- Category focus ----------

const SHOWN_MERCHANTS = 7;

function MerchantList({ detail, category }) {
  const shown = detail.merchants.slice(0, SHOWN_MERCHANTS);
  const rest = detail.merchants.slice(SHOWN_MERCHANTS);
  const restTotal = rest.reduce((s, m) => s + m.total, 0);
  const top = detail.merchants[0]?.total || 1;

  return (
    <ul className="flex flex-col divide-y divide-line/60">
      {shown.map((m) => (
        <li key={m.name} className="flex flex-col gap-1.5 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium text-ink">{m.name}</span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">{formatINR(m.total)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-1.5 flex-1 rounded-full bg-track" aria-hidden="true">
              <span className={cn('block h-full rounded-full', categoryBg(category))} style={{ width: `${(m.total / top) * 100}%` }} />
            </span>
            <span className="shrink-0 text-right text-xs tabular-nums text-ink-faint sm:w-40">
              {m.count} payment{m.count === 1 ? '' : 's'}
              {m.count > 1 && ` · avg ${formatINR(m.total / m.count)}`}
            </span>
          </div>
        </li>
      ))}
      {rest.length > 0 && (
        <li className="flex items-baseline justify-between gap-3 py-2.5 text-sm text-ink-muted">
          <span>{rest.length} more merchant{rest.length === 1 ? '' : 's'}</span>
          <span className="text-[13px] tabular-nums">{formatINR(restTotal)}</span>
        </li>
      )}
    </ul>
  );
}

function FocusCard({ transactions, periodTransactions, range, label, category, onCategory, spentInPeriod, cardRef }) {
  const allMonths = useMemo(
    () => categoryMonths(transactions, null, range.end, range),
    [transactions, range]
  );
  const months = useMemo(
    () => categoryMonths(transactions, category, range.end, range),
    [transactions, category, range]
  );
  const detail = useMemo(() => categoryDetail(periodTransactions, category), [periodTransactions, category]);
  const options = useCategoryOptions(transactions, periodTransactions, allMonths, category);
  const [chosen, setChosen] = useState(null);
  const latest = months.findLastIndex((m) => m.inPeriod);
  const active = chosen !== null && chosen < months.length ? chosen : latest;
  const average = months.reduce((s, m) => s + m.amount, 0) / months.length;
  const ratio = spentInPeriod > 0 ? detail.total / spentInPeriod : 0;
  const share = ratio > 0 && ratio < 0.01 ? 'under 1%' : `${Math.round(ratio * 100)}%`;
  const month = months[active];
  // In the header on wide screens, under it on phones so the title keeps its room
  const picker = <Select label="Category" value={category} onChange={onCategory} options={options} />;

  return (
    <Card ref={cardRef} aria-labelledby="focus-title" className="scroll-mt-[calc(var(--header-h)+20px)]">
      <CardHeader
        band
        id="focus-title"
        title="Category focus"
        icon={Crosshair}
        subtitle={`${category} · ${formatINR(detail.total)} in ${label} · ${share} of spending`}
      >
        <div className="hidden sm:block">{picker}</div>
      </CardHeader>
      <div className="flex flex-col sm:hidden">{picker}</div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <p className={HEAD}>Month by month · 12 months to {months[months.length - 1].longLabel}</p>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px]" aria-live="polite">
            <span className="font-semibold text-ink">{month.longLabel}</span>
            <span className="font-semibold tabular-nums text-ink">{formatINR(month.amount)}</span>
            {average > 0 && (
              <span className="text-ink-muted">
                {month.amount >= average ? 'above' : 'below'} the {formatINR(average)} monthly average
              </span>
            )}
          </div>
          <MonthBars months={months} barClass={categoryBg(category)} line={average} active={active} onActive={setChosen} />
          <p className="text-xs text-ink-faint">
            Bright bars are in the chosen period. Dashed line: average month. Point at a month to see it.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <p className={HEAD}>Where it went in {label}</p>
          {detail.count === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">No {category} spending in {label}.</p>
          ) : (
            <>
              <MerchantList detail={detail} category={category} />
              <p className="border-t border-line pt-3 text-[13px] text-ink-muted">
                {detail.count} payment{detail.count === 1 ? '' : 's'}, {formatINR(detail.total / detail.count)} on average.
                Largest: <span className="font-semibold tabular-nums text-ink">{formatINR(Math.abs(detail.largest.amount))}</span> at{' '}
                {payeeName(detail.largest) || 'Unknown'} on {shortDate(detail.largest.date)}.
              </p>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

// Categories with any spending in the 12-month window, biggest in the period first.
function useCategoryOptions(transactions, periodTransactions, allMonths, current) {
  return useMemo(() => {
    const start = allMonths[0].key;
    const end = allMonths[allMonths.length - 1].key;
    const inWindow = transactions.filter((t) => {
      const key = t.date.slice(0, 7);
      return key >= start && key <= end;
    });
    const period = Object.fromEntries(summarize(periodTransactions).categories.map((c) => [c.name, c.amount]));
    const names = summarize(inWindow)
      .categories.sort((a, b) => (period[b.name] || 0) - (period[a.name] || 0) || b.amount - a.amount)
      .map((c) => c.name);
    // A category picked earlier stays selectable even with no spending in this window
    if (!names.includes(current)) names.push(current);
    return names.map((name) => ({ value: name, label: name, dot: categoryBg(name) }));
  }, [transactions, periodTransactions, allMonths, current]);
}

// ---------- Section ----------

export default function SpendingSection() {
  const { transactions } = useData();
  const { periodTransactions, mode, anchor, months, label } = usePeriod();
  const range = useMemo(() => currentRange(mode, anchor, months), [mode, anchor, months]);
  const summary = useMemo(() => summarize(periodTransactions), [periodTransactions]);
  const [chosen, setChosen] = useState(null);
  const focusRef = useRef(null);

  if (!range) return null;
  // The period's biggest category until one is picked; a picked one stays across periods
  const category = chosen || summary.categories[0]?.name || 'Other';

  const focus = (name) => {
    setChosen(name);
    focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex flex-col gap-4">
      <ChangeCard transactions={transactions} mode={mode} range={range} onFocus={focus} />
      <FocusCard
        transactions={transactions}
        periodTransactions={periodTransactions}
        range={range}
        label={label}
        category={category}
        onCategory={setChosen}
        spentInPeriod={summary.spent}
        cardRef={focusRef}
      />
    </div>
  );
}
