import { useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowDown, CalendarClock, Target } from 'lucide-react';
import { CurveCorner, DashedTrail } from '@/components/brand/Route';
import { useData, usePeriod } from '@/app/hooks';
import { goToSection } from '@/app/report/sections';
import { useRecurring } from '@/app/useRecurring';
import BudgetBar from '@/components/kit/BudgetBar';
import { AIBriefCard } from '@/sections/AISummary';
import { Card, CardHeader, CardLink } from '@/components/kit/Card';
import CategoryTag from '@/components/kit/CategoryTag';
import FlowList from '@/components/kit/FlowList';
import KpiTile from '@/components/kit/KpiTile';
import MoneyFlow from '@/components/kit/MoneyFlow';
import Pill from '@/components/kit/Pill';
import { TrailList, TrailStop } from '@/components/kit/Trail';
import { budgetScale, budgetStatus, savingsRate, summarize } from '@/lib/finance';
import { buildFlow } from '@/lib/flow';
import { formatChange, formatINR } from '@/lib/money';
import { stagger } from '@/theme/motion';
import { cn } from '@/lib/utils';

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// ---------- KPI row ----------

function KpiRow({ summary, previous, budget }) {
  const { spent, income, saved, sources } = summary;
  const rate = savingsRate(saved, income);
  const change = previous && previous.spent > 0 ? spent / previous.spent - 1 : null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <KpiTile label="Spent" value={spent} hero>
        {change !== null ? (
          <>
            <Pill tone={change <= 0 ? 'good' : 'warn'} inverse>{formatChange(change)}</Pill>
            <span>
              vs {previous.label} ({formatINR(previous.spent)})
            </span>
          </>
        ) : (
          <span>Savings not included</span>
        )}
      </KpiTile>

      <KpiTile label="Income" value={income}>
        {sources.length === 0 ? (
          <span>No money in this period</span>
        ) : (
          <span className="truncate">
            {sources[0].name}
            {sources.length > 1 && ` + ${sources.length - 1} other source${sources.length > 2 ? 's' : ''}`}
          </span>
        )}
      </KpiTile>

      <KpiTile label="Saved" value={saved}>
        {rate !== null ? (
          <Pill tone="good">{Math.round(rate * 100)}% of income</Pill>
        ) : (
          <span>{saved > 0 ? "More than this period's income" : 'No savings or investments'}</span>
        )}
      </KpiTile>

      {budget.rows.length === 0 ? (
        <KpiTile label="Budget left" value={0} format={() => '–'}>
          <CardLink section="budgets">Set budgets</CardLink>
        </KpiTile>
      ) : (
        <KpiTile label="Budget left" value={budget.left}>
          {budget.over > 0 ? <Pill tone="bad">{budget.over} over</Pill> : <Pill tone="good">On track</Pill>}
          <span>of {formatINR(budget.limit)}</span>
        </KpiTile>
      )}
    </div>
  );
}

// ---------- Where the money went ----------

function FlowCard({ summary }) {
  const { spent, income, saved } = summary;
  const flow = useMemo(() => buildFlow(summary), [summary]);

  return (
    <Card aria-labelledby="flow-title" className="gap-0 overflow-hidden p-0 sm:p-0">
      {/* Dark banner from the brand sheet's "example usage", with the dashed trail */}
      <div className="relative overflow-hidden bg-sidebar px-4 py-4 sm:px-6 sm:py-5">
        <DashedTrail className="hidden md:block" />
        <div className="relative flex flex-col gap-1">
          <h2 id="flow-title" className="font-display text-xl font-semibold text-sidebar-ink">
            Where the money went
          </h2>
          <p className="text-[13px] text-sidebar-muted">
            {formatINR(spent + saved)} out · {formatINR(income)} in
          </p>
        </div>
      </div>
      <div className="p-4 sm:p-5">
        {income + spent + saved > 0 ? (
          <>
            <div className="hidden sm:block">
              <MoneyFlow
                sources={flow.inItems}
                outflows={flow.outItems}
                centerLabel="Total"
                ariaLabel="Where the money went: money in on the left, split into savings and spending categories on the right"
              />
            </div>
            {/* Phones: a Sankey is unreadable at this width, so the same numbers as bars and lists */}
            <div className="sm:hidden">
              <FlowList sources={flow.inItems} outflows={flow.outItems} />
            </div>
          </>
        ) : (
          <p className="py-10 text-center text-sm text-ink-muted">No money in or out in this period.</p>
        )}
        {/* Next step after reading the chart, so it sits where the eye ends up */}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => goToSection('cash-flow')}
            aria-label="More detail below, in Cash flow"
            className="group inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-accent transition-colors duration-fast hover:border-accent hover:bg-accent-soft"
          >
            More detail below
            <ArrowDown
              className="size-3.5 transition-transform duration-fast ease-out group-hover:translate-y-0.5"
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </Card>
  );
}

// ---------- Budgets ----------

function BudgetRow({ row, scale, index, delay }) {
  return (
    <li className="grid grid-cols-[6.5rem_minmax(0,1fr)_8.5rem] items-center gap-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)_9.5rem]">
      <span className="truncate font-medium text-ink">{row.name}</span>
      <BudgetBar row={row} scale={scale} index={index} delay={delay} />
      <span className="whitespace-nowrap text-right text-[13px]">
        <span className={cn('font-semibold', row.state === 'over' ? 'text-bad' : 'text-ink')}>{formatINR(row.spent)}</span>
        <span className="text-ink-faint"> / {formatINR(row.limit)}</span>
        {row.state === 'over' && <span className="sr-only">, {formatINR(row.spent - row.limit)} over budget</span>}
      </span>
    </li>
  );
}

function BudgetCard({ budget }) {
  const rows = budget.rows.slice(0, 9);
  const scale = budgetScale(rows);
  const delay = stagger(rows.length);
  return (
    <Card aria-labelledby="budget-title" className="relative overflow-hidden">
      <CurveCorner className="stroke-accent/35" />
      <CardHeader
        band
        id="budget-title"
        title="Budgets"
        icon={Target}
        subtitle={rows.length ? `${formatINR(budget.spent)} of ${formatINR(budget.limit)} budgeted` : 'No budgets set yet'}
      >
        {rows.length > 0 &&
          (budget.over > 0 ? <Pill tone="bad">{budget.over} over</Pill> : <Pill tone="good">All on track</Pill>)}
      </CardHeader>
      {rows.length === 0 && (
        <p className="py-6 text-center text-sm text-ink-muted">
          Give each category a monthly limit, or start from what you usually spend.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <BudgetRow key={row.name} row={row} scale={scale} index={i} delay={delay} />
        ))}
      </ul>
      {rows.length > 0 && <p className="text-xs text-ink-faint">The tick marks each limit; red is the amount over it.</p>}
      <div className="mt-auto pt-1">
        <CardLink section="budgets">{rows.length ? 'All budgets' : 'Set budgets'}</CardLink>
      </div>
    </Card>
  );
}

// ---------- Coming up ----------

function ComingUpCard() {
  const { data, error } = useRecurring();
  const upcoming = useMemo(
    () =>
      (data?.items || [])
        .filter((i) => i.active && i.next_expected)
        .sort((a, b) => a.next_expected.localeCompare(b.next_expected))
        .slice(0, 7),
    [data]
  );

  return (
    <Card aria-labelledby="upcoming-title" className="relative overflow-hidden">
      <CurveCorner className="stroke-accent/35" />
      <CardHeader
        band
        id="upcoming-title"
        title="Coming up"
        icon={CalendarClock}
        subtitle={data && data.active_monthly_total > 0 ? `${formatINR(data.active_monthly_total)} a month in regular payments` : 'Regular payments'}
      />

      {error && <p className="text-sm text-ink-muted">{error}.</p>}
      {!data && !error && <div className="h-40 animate-pulse rounded-control bg-track" aria-label="Loading" />}
      {data && upcoming.length === 0 && (
        <p className="text-sm text-ink-muted">No regular payments found yet. They show up after 3 months of statements.</p>
      )}

      {upcoming.length > 0 && (
        <TrailList>
          {upcoming.map((item) => {
            // Due on or before the last statement date but not in it: flag it
            const missed = item.next_expected <= data.data_until;
            return (
              <TrailStop key={item.id} stop={missed ? 'warn' : 'open'}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-ink">{item.name}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={cn('font-mono text-[11px] uppercase', missed ? 'text-warn' : 'text-ink-faint')}>
                        {missed ? `Due ${shortDate(item.next_expected)}, not seen` : shortDate(item.next_expected)}
                      </span>
                      <CategoryTag category={item.category} />
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-ink">{formatINR(item.monthly_amount)}</span>
                </div>
              </TrailStop>
            );
          })}
        </TrailList>
      )}

      <div className="mt-auto pt-1">
        <CardLink to="/recurring">All recurring</CardLink>
      </div>
    </Card>
  );
}

// ---------- Page ----------

export default function OverviewSection() {
  const { periodTransactions, previous } = usePeriod();
  const { budgets } = useData();

  const summary = useMemo(() => summarize(periodTransactions), [periodTransactions]);
  const previousSummary = useMemo(
    () => previous && previous.transactions.length > 0 && { label: previous.label, ...summarize(previous.transactions) },
    [previous]
  );
  const budget = useMemo(() => budgetStatus(summary.categories, budgets.limits, summary.months), [summary, budgets.limits]);

  return (
    <>
      <div className="flex flex-col gap-4">
        <KpiRow summary={summary} previous={previousSummary} budget={budget} />
        <AIBriefCard />
        <FlowCard summary={summary} />
        <div className="grid gap-4 lg:grid-cols-2">
          <BudgetCard budget={budget} />
          <ComingUpCard />
        </div>
      </div>
    </>
  );
}
