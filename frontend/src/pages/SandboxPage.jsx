import { useMemo } from 'react';
import { ArrowDownLeft, PiggyBank, Target, Wallet } from 'lucide-react';
import { useData, usePeriod } from '@/app/hooks';
import { useRecurring } from '@/app/useRecurring';
import { shiftMonth } from '@/app/period';
import { Card, CardHeader, CardLink } from '@/components/kit/Card';
import CategoryTag from '@/components/kit/CategoryTag';
import CountUp from '@/components/kit/CountUp';
import KpiTile from '@/components/kit/KpiTile';
import Pill from '@/components/kit/Pill';
import { TrailList, TrailStop } from '@/components/kit/Trail';
import { budgetStatus, savingsRate, summarize } from '@/lib/finance';
import { formatINR, formatTxnAmount } from '@/lib/money';
import { categoryColor } from '@/theme/categories';
import { cn } from '@/lib/utils';

// Dev-only page (/sandbox) for comparing card designs with real data before they go into
// a page. Not linked from the nav and not built into production.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function Variant({ id, title, note, className, children }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex items-baseline gap-2">
        <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-fg">{id}</span>
        <span className="text-sm font-semibold text-ink">{title}</span>
      </div>
      {note && <p className="text-[13px] text-ink-muted">{note}</p>}
      {children}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

// ---------- KPI tiles ----------

// Last 6 months up to the anchor month, each summarised
function useMonthSeries() {
  const { transactions } = useData();
  const { anchor } = usePeriod();
  return useMemo(() => {
    if (!anchor) return [];
    return [-5, -4, -3, -2, -1, 0].map((d) => {
      const key = shiftMonth(anchor, d);
      return { key, label: MONTHS[Number(key.slice(5)) - 1], ...summarize(transactions.filter((t) => t.date.startsWith(key))) };
    });
  }, [transactions, anchor]);
}

function Spark({ values }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-8 items-end gap-[3px]" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn('w-2 rounded-[2px]', i === values.length - 1 ? 'bg-accent' : 'bg-accent/20')}
          style={{ height: `${Math.max((v / max) * 100, 6)}%` }}
        />
      ))}
    </div>
  );
}

function SparkTile({ label, value, series, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-card border border-line bg-surface px-5 py-[18px] shadow-card">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint">{label}</span>
        <Spark values={series} />
      </div>
      <span className="truncate font-display text-[30px] font-semibold leading-9 tracking-tight text-ink">
        <CountUp value={value} />
      </span>
      <span className="flex min-h-5 flex-wrap items-center gap-2 text-[13px] text-ink-muted">{children}</span>
    </div>
  );
}

function IconTile({ label, value, icon: Icon, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface px-5 py-[18px] shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="text-[13px] font-semibold text-ink-muted">{label}</span>
      </div>
      <span className="truncate font-display text-[30px] font-semibold leading-9 tracking-tight text-ink">
        <CountUp value={value} />
      </span>
      <span className="flex min-h-5 flex-wrap items-center gap-2 text-[13px] text-ink-muted">{children}</span>
    </div>
  );
}

function KpiSamples({ summary, budget }) {
  const { budgets } = useData();
  const series = useMonthSeries();
  const rate = savingsRate(summary.saved, summary.income);
  const savedNote = rate !== null ? <Pill tone="good">{Math.round(rate * 100)}% of income</Pill> : 'More than income';
  const budgetNote = (
    <>
      {budget.over > 0 ? <Pill tone="bad">{budget.over} over</Pill> : <Pill tone="good">On track</Pill>} of {formatINR(budget.limit)}
    </>
  );
  const grid = 'grid grid-cols-2 gap-4 lg:grid-cols-4';

  return (
    <div className="flex flex-col gap-6">
      <Variant id="A" title="Current" note="Now on Overview: trail curve on every tile, Spent as the slate hero tile.">
        <div className={grid}>
          <KpiTile label="Spent" value={summary.spent} hero>Savings not included</KpiTile>
          <KpiTile label="Income" value={summary.income}>{summary.sources[0]?.name}</KpiTile>
          <KpiTile label="Saved" value={summary.saved}>{savedNote}</KpiTile>
          <KpiTile label="Budget left" value={budget.left}>{budgetNote}</KpiTile>
        </div>
      </Variant>

      <Variant id="B" title="Six-month sparkline" note="Adds a small trend to each tile: last 6 months, this one in teal. Adds information, not decoration.">
        <div className={grid}>
          <SparkTile label="Spent" value={summary.spent} series={series.map((m) => m.spent)}>
            {series.length > 1 && `${series[0].label} – ${series.at(-1).label}`}
          </SparkTile>
          <SparkTile label="Income" value={summary.income} series={series.map((m) => m.income)}>
            {summary.sources[0]?.name}
          </SparkTile>
          <SparkTile label="Saved" value={summary.saved} series={series.map((m) => m.saved)}>
            {savedNote}
          </SparkTile>
          <SparkTile label="Budget left" value={budget.left} series={series.map((m) => budgetStatus(m.categories, budgets.limits, 1).spent)}>
            {budgetNote}
          </SparkTile>
        </div>
      </Variant>

      <Variant id="C" title="Icon chip" note="A Lucide icon in a teal circle names each tile; sentence-case labels instead of mono caps.">
        <div className={grid}>
          <IconTile label="Spent" value={summary.spent} icon={Wallet}>Savings not included</IconTile>
          <IconTile label="Income" value={summary.income} icon={ArrowDownLeft}>{summary.sources[0]?.name}</IconTile>
          <IconTile label="Saved" value={summary.saved} icon={PiggyBank}>{savedNote}</IconTile>
          <IconTile label="Budget left" value={budget.left} icon={Target}>{budgetNote}</IconTile>
        </div>
      </Variant>
    </div>
  );
}

// ---------- Budgets ----------

const TONE_BG = { over: 'bg-bad', at: 'bg-warn', under: 'bg-good' };

function BudgetCurrent({ rows }) {
  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((r) => (
        <li key={r.name} className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-3 text-sm">
            <span className="font-medium text-ink">{r.name}</span>
            <span className={cn('text-[13px] font-semibold', r.state === 'over' ? 'text-bad' : r.state === 'at' ? 'text-warn' : 'text-ink-muted')}>
              {r.state === 'over' ? `${formatINR(r.spent - r.limit)} over` : r.state === 'at' ? 'At limit' : `${formatINR(r.limit - r.spent)} left`}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-track">
            <div className={cn('h-full rounded-full', TONE_BG[r.state])} style={{ width: `${Math.min(r.used, 1) * 100}%` }} />
          </div>
          <span className="text-xs text-ink-faint">
            {formatINR(r.spent)} of {formatINR(r.limit)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Bar scaled to the biggest overspend; the limit is a tick, only the part past it is red.
function BudgetTicks({ rows }) {
  const scale = Math.max(1.25, ...rows.map((r) => Math.min(r.used, 3)));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => {
        const within = (Math.min(r.used, 1) / scale) * 100;
        const over = r.used > 1 ? ((Math.min(r.used, 3) - 1) / scale) * 100 : 0;
        return (
          <li key={r.name} className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
            <span className="truncate font-medium text-ink">{r.name}</span>
            <div className="relative h-2 rounded-full bg-track">
              <div className="absolute inset-y-0 left-0 flex overflow-hidden rounded-full" style={{ width: `${within + over}%` }}>
                <span className={cn('h-full', r.state === 'at' ? 'bg-warn' : 'bg-accent')} style={{ width: `${(within / (within + over)) * 100}%` }} />
                {over > 0 && <span className="h-full flex-1 bg-bad" />}
              </div>
              <span className="absolute -inset-y-1 w-px bg-ink/40" style={{ left: `${100 / scale}%` }} aria-hidden="true" />
            </div>
            <span className="w-32 text-right text-[13px]">
              <span className={cn('font-semibold', r.state === 'over' ? 'text-bad' : 'text-ink')}>{formatINR(r.spent)}</span>
              <span className="text-ink-faint"> / {formatINR(r.limit)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function BudgetSummary({ budget }) {
  const overRows = budget.rows.filter((r) => r.state === 'over');
  const used = Math.min(budget.spent / budget.limit, 1);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="font-display text-2xl font-semibold text-ink">
          {budget.left < 0 ? `${formatINR(-budget.left)} over` : `${formatINR(budget.left)} left`}
        </span>
        <span className="text-[13px] text-ink-muted">
          {formatINR(budget.spent)} of {formatINR(budget.limit)} budgeted
        </span>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-track">
          <div className={cn('h-full rounded-full', budget.left < 0 ? 'bg-bad' : 'bg-accent')} style={{ width: `${used * 100}%` }} />
        </div>
      </div>
      {overRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint">Over budget</span>
          <ul className="flex flex-col divide-y divide-line">
            {overRows.map((r) => (
              <li key={r.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                <CategoryTag category={r.name} className="text-sm text-ink" />
                <span className="font-semibold text-bad">+{formatINR(r.spent - r.limit)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BudgetSamples({ budget }) {
  const rows = budget.rows.slice(0, 5);
  const header = (
    <CardHeader title="Budgets">
      {budget.over > 0 ? <Pill tone="bad">{budget.over} over</Pill> : <Pill tone="good">All on track</Pill>}
    </CardHeader>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Variant id="A" title="Current" note="Full bars; every overspent row is a solid red bar.">
        <Card>
          {header}
          <BudgetCurrent rows={rows} />
        </Card>
      </Variant>
      <Variant id="B" title="Limit tick" note="One line per category. Bars share a scale, the limit is a tick, and only the overspend is red, so you see how far over.">
        <Card>
          {header}
          <BudgetTicks rows={budget.rows.slice(0, 7)} />
        </Card>
      </Variant>
      <Variant id="C" title="Total first" note="Answer first: the overall position, then only the categories that are over.">
        <Card>
          {header}
          <BudgetSummary budget={budget} />
        </Card>
      </Variant>
    </div>
  );
}

// ---------- Coming up ----------

function ComingUpSamples() {
  const { data } = useRecurring();
  const items = useMemo(
    () =>
      (data?.items || [])
        .filter((i) => i.active && i.next_expected)
        .sort((a, b) => a.next_expected.localeCompare(b.next_expected))
        .slice(0, 5),
    [data]
  );
  if (!data) return <div className="h-40 animate-pulse rounded-card bg-track" />;
  const missed = (i) => i.next_expected <= data.data_until;
  const header = (
    <CardHeader title="Coming up">
      <span className="text-[13px] text-ink-muted">{formatINR(data.active_monthly_total)} / month fixed</span>
    </CardHeader>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Variant id="A" title="Current" note="Trail line with a stop per payment.">
        <Card>
          {header}
          <TrailList>
            {items.map((i) => (
              <TrailStop key={i.name} stop={missed(i) ? 'warn' : 'open'}>
                <div className="flex justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-ink">{i.name}</span>
                    <span className="flex items-center gap-2">
                      <span className={cn('font-mono text-[11px] uppercase', missed(i) ? 'text-warn' : 'text-ink-faint')}>
                        {shortDate(i.next_expected)}
                      </span>
                      <CategoryTag category={i.category} />
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-ink">{formatINR(i.monthly_amount)}</span>
                </div>
              </TrailStop>
            ))}
          </TrailList>
        </Card>
      </Variant>

      <Variant id="B" title="Date tiles" note="From the mockup: a calendar-style date tile per payment, easier to scan by day.">
        <Card>
          {header}
          <ul className="flex flex-col divide-y divide-line">
            {items.map((i) => {
              const d = new Date(`${i.next_expected}T00:00:00`);
              return (
                <li key={i.name} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      'flex w-11 shrink-0 flex-col items-center rounded-control border py-1',
                      missed(i) ? 'border-warn/40 bg-warn-soft text-warn' : 'border-line bg-surface-2 text-ink'
                    )}
                  >
                    <span className="font-display text-base font-semibold leading-5">{d.getDate()}</span>
                    <span className="font-mono text-[10px] uppercase">{MONTHS[d.getMonth()]}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-ink">{i.name}</span>
                    <span className="flex items-center gap-2 text-xs">
                      <CategoryTag category={i.category} />
                      {missed(i) && <span className="font-semibold text-warn">Not seen yet</span>}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-ink">{formatINR(i.monthly_amount)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </Variant>
    </div>
  );
}

// ---------- Recent transactions ----------

function Avatar({ name, category }) {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold"
      style={{ background: categoryColor(category, 0.14), color: categoryColor(category) }}
      aria-hidden="true"
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

function CategoryChip({ category }) {
  return (
    <span className="inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs font-medium text-ink" style={{ background: categoryColor(category, 0.14) }}>
      {category}
    </span>
  );
}

function RecentSamples({ transactions }) {
  const recent = useMemo(() => [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 6), [transactions]);
  const byDay = useMemo(() => {
    const groups = [];
    for (const t of recent) {
      const last = groups.at(-1);
      if (last && last.date === t.date) last.items.push(t);
      else groups.push({ date: t.date, items: [t] });
    }
    return groups;
  }, [recent]);
  const header = (
    <CardHeader title="Recent transactions">
      <CardLink section="transactions">All {transactions.length}</CardLink>
    </CardHeader>
  );
  const amount = (t) => (
    <span className={cn('text-right text-sm font-semibold', t.txn_type === 'credit' ? 'text-good' : 'text-ink')}>{formatTxnAmount(t)}</span>
  );

  return (
    <div className="flex flex-col gap-6">
      <Variant id="A" title="Current" note="Date column, full raw narration, category pinned far right: wide gaps on big screens.">
        <Card>
          {header}
          <ul className="flex flex-col divide-y divide-line">
            {recent.map((t) => (
              <li key={t.id} className="grid grid-cols-[3.25rem_minmax(0,1fr)_9.5rem_auto] items-center gap-3 py-2.5">
                <span className="font-mono text-xs text-ink-faint">{shortDate(t.date)}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-ink">{t.merchant}</span>
                  <span className="truncate font-mono text-[11px] text-ink-faint">{t.narration}</span>
                </span>
                <CategoryTag category={t.category} />
                {amount(t)}
              </li>
            ))}
          </ul>
        </Card>
      </Variant>

      <div className="grid gap-6 lg:grid-cols-2">
        <Variant id="B" title="Avatar + chip" note="Initial in a category-tinted circle, category as a soft chip under the name. Common in finance apps; reads well at any width.">
          <Card>
            {header}
            <ul className="flex flex-col divide-y divide-line">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={t.merchant} category={t.category} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm font-semibold text-ink">{t.merchant}</span>
                    <span className="flex min-w-0 items-center gap-2">
                      <CategoryChip category={t.category} />
                      <span className="shrink-0 font-mono text-[11px] text-ink-faint">{shortDate(t.date)}</span>
                    </span>
                  </span>
                  {amount(t)}
                </li>
              ))}
            </ul>
          </Card>
        </Variant>

        <Variant id="C" title="Grouped by day" note="Day headings replace the date column; raw narration kept but capped in width.">
          <Card>
            {header}
            <div className="flex flex-col gap-3">
              {byDay.map((g) => (
                <div key={g.date} className="flex flex-col">
                  <span className="border-b border-line pb-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint">
                    {new Date(`${g.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </span>
                  <ul className="flex flex-col">
                    {g.items.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 py-2">
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-semibold text-ink">{t.merchant}</span>
                            <CategoryTag category={t.category} className="shrink-0" />
                          </span>
                          <span className="max-w-md truncate font-mono text-[11px] text-ink-faint">{t.narration}</span>
                        </span>
                        {amount(t)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </Variant>
      </div>
    </div>
  );
}

// ---------- Page ----------

export default function SandboxPage() {
  const { periodTransactions, label } = usePeriod();
  const { budgets } = useData();
  const summary = useMemo(() => summarize(periodTransactions), [periodTransactions]);
  const budget = useMemo(() => budgetStatus(summary.categories, budgets.limits, summary.months), [summary, budgets.limits]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">UI sandbox</h1>
        <p className="text-sm text-ink-muted">
          Overview card variants with your real data ({label}). Dev only; pick a letter per section.
        </p>
      </header>
      <Section title="1 · KPI tiles">
        <KpiSamples summary={summary} budget={budget} />
      </Section>
      <Section title="2 · Budgets">
        <BudgetSamples budget={budget} />
      </Section>
      <Section title="3 · Coming up">
        <ComingUpSamples />
      </Section>
      <Section title="4 · Recent transactions">
        <RecentSamples transactions={periodTransactions} />
      </Section>
    </div>
  );
}
