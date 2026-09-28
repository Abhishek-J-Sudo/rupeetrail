import { useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, Pencil, PiggyBank, Target } from 'lucide-react';
import { CurveCorner } from '@/components/brand/Route';
import { useData, usePeriod } from '@/app/hooks';
import BudgetBar from '@/components/kit/BudgetBar';
import { Card, CardHeader } from '@/components/kit/Card';
import MoneyInput from '@/components/kit/MoneyInput';
import MonthBars from '@/components/kit/MonthBars';
import Pill from '@/components/kit/Pill';
import { monthlyAverages, roundBudget } from '@/lib/budgets';
import { budgetScale, budgetStatus, summarize } from '@/lib/finance';
import { formatINR } from '@/lib/money';
import { currentRange, savedMonths } from '@/lib/spending';
import { categoryBg } from '@/theme/categories';
import { stagger } from '@/theme/motion';
import { cn } from '@/lib/utils';

// Budgets are stored by the backend (GET/PUT /budgets) and edited in place in the list card.

const HEAD = 'font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint';
const OUTLINE_BUTTON =
  'group inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-accent transition-colors duration-fast hover:border-accent hover:bg-accent-soft';

// ---------- Every budget ----------

function Status({ row }) {
  if (row.state === 'over') return <Pill tone="bad">{formatINR(row.spent - row.limit)} over</Pill>;
  if (row.state === 'at') return <Pill tone="warn">At limit</Pill>;
  return <span className="text-[13px] tabular-nums text-ink-muted">{formatINR(row.limit - row.spent)} left</span>;
}

function BudgetLine({ row, scale, index, delay }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_10.5rem_8.5rem] sm:gap-y-0">
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
        <span className={cn('size-2 shrink-0 rounded-full', categoryBg(row.name))} aria-hidden="true" />
        <span className="truncate">{row.name}</span>
      </span>
      <BudgetBar row={row} scale={scale} index={index} delay={delay} className="order-3 col-span-2 sm:order-none sm:col-span-1" />
      <span className="order-4 col-span-2 whitespace-nowrap text-[13px] tabular-nums sm:order-none sm:col-span-1 sm:text-right">
        <span className={cn('font-semibold', row.state === 'over' ? 'text-bad' : 'text-ink')}>{formatINR(row.spent)}</span>
        <span className="text-ink-faint"> / {formatINR(row.limit)}</span>
        <span className="text-ink-faint"> · {Math.round(row.used * 100)}%</span>
      </span>
      <span className="order-2 flex justify-end sm:order-none">
        <Status row={row} />
      </span>
    </li>
  );
}

function BudgetListCard({ budget, unbudgeted, months, label, onEdit }) {
  const scale = budgetScale(budget.rows);
  const delay = stagger(budget.rows.length);
  const perMonths = months > 1 ? ` · monthly limits × ${months} months` : '';

  return (
    <Card aria-labelledby="budgets-list-title" className="relative overflow-hidden">
      <CurveCorner className="stroke-accent/35" />
      <CardHeader
        band
        id="budgets-list-title"
        title="Every budget"
        icon={Target}
        subtitle={
          budget.rows.length
            ? `${formatINR(budget.spent)} of ${formatINR(budget.limit)} in ${label}${perMonths}`
            : `No budgets yet · ${formatINR(unbudgeted.reduce((sum, c) => sum + c.amount, 0))} spent in ${label}`
        }
      >
        {budget.rows.length > 0 &&
          (budget.over > 0 ? <Pill tone="bad">{budget.over} over</Pill> : <Pill tone="good">All on track</Pill>)}
      </CardHeader>

      {budget.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm font-semibold text-ink">No budgets set yet</p>
          <p className="max-w-md text-[13px] text-ink-muted">
            Give each category a monthly limit. The quickest start is what you usually spend: every field is filled in
            and you change what you like before saving.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => onEdit({ suggest: true })} className={OUTLINE_BUTTON}>
              <Calculator className="size-3.5" strokeWidth={2} aria-hidden="true" />
              Suggest from last 6 months
            </button>
            <button type="button" onClick={() => onEdit()} className={OUTLINE_BUTTON}>
              <Pencil className="size-3.5" strokeWidth={2} aria-hidden="true" />
              Set them myself
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={cn('hidden grid-cols-[11rem_minmax(0,1fr)_10.5rem_8.5rem] gap-x-4 sm:grid', HEAD)}>
            <span>Category</span>
            <span>Against the limit</span>
            <span className="text-right">Spent / limit</span>
            <span className="text-right">Status</span>
          </div>
          <ul className="-mt-2 flex flex-col divide-y divide-line/60">
            {budget.rows.map((row, i) => (
              <BudgetLine key={row.name} row={row} scale={scale} index={i} delay={delay} />
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-faint">The tick marks each limit; amber is close to it, red is the amount over it.</p>
            <button type="button" onClick={() => onEdit()} className={OUTLINE_BUTTON}>
              <Pencil className="size-3.5" strokeWidth={2} aria-hidden="true" />
              Edit budgets
            </button>
          </div>
        </>
      )}

      {budget.rows.length > 0 && unbudgeted.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className={HEAD}>No budget set · {formatINR(unbudgeted.reduce((s, c) => s + c.amount, 0))} spent</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {unbudgeted.map((c) => (
              <li key={c.name} className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted">
                <span className={cn('size-2 shrink-0 rounded-full', categoryBg(c.name))} aria-hidden="true" />
                {c.name}
                <span className="font-semibold tabular-nums text-ink">{formatINR(c.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ---------- Editing ----------

// Every category worth a budget: the ones that have one, plus any spent on in the last 6 months,
// biggest usual spend first.
function editorRows(limits, averages) {
  const names = new Set([...Object.keys(limits), ...Object.keys(averages?.spent ?? {})]);
  const avg = (name) => averages?.spent[name] ?? 0;
  return [...names].sort((a, b) => avg(b) - avg(a) || a.localeCompare(b)).map((name) => ({ name, average: avg(name) }));
}

function suggested(averages) {
  return Object.fromEntries(
    Object.entries(averages?.spent ?? {})
      .filter(([, amount]) => amount >= 50)
      .map(([name, amount]) => [name, roundBudget(amount)])
  );
}

function BudgetEditor({ budgets, averages, suggest, focusSavings, onSave, onClose }) {
  const [limits, setLimits] = useState(() => (suggest ? suggested(averages) : budgets.limits));
  const [target, setTarget] = useState(budgets.savings_target === null ? null : Math.round(budgets.savings_target));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [filled, setFilled] = useState(suggest);
  const cardRef = useRef(null);
  const savingsRef = useRef(null);
  const rows = useMemo(() => editorRows(budgets.limits, averages), [budgets.limits, averages]);

  // Bring the editor (or the savings field, when opened from the Savings card) into view
  useEffect(() => {
    if (focusSavings) {
      savingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      savingsRef.current?.focus({ preventScroll: true });
    } else {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      cardRef.current?.querySelector('input')?.focus({ preventScroll: true });
    }
  }, [focusSavings]);

  const set = (name, value) => setLimits((current) => ({ ...current, [name]: value }));
  const total = Object.values(limits).reduce((s, n) => s + (n || 0), 0);
  const count = Object.values(limits).filter((n) => n > 0).length;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const clean = Object.fromEntries(Object.entries(limits).filter(([, n]) => n > 0));
      await onSave({ limits: clean, savings_target: target > 0 ? target : null });
      onClose();
    } catch {
      setError('Couldn’t save the budgets. Is the app still running?');
      setBusy(false);
    }
  };

  return (
    <Card
      as="form"
      ref={cardRef}
      onSubmit={save}
      onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}
      aria-labelledby="budgets-edit-title"
      className="relative scroll-mt-[calc(var(--header-h)+1rem)] overflow-hidden"
    >
      <CardHeader
        band
        id="budgets-edit-title"
        title="Edit budgets"
        icon={Pencil}
        subtitle={`${formatINR(total)} a month across ${count} ${count === 1 ? 'budget' : 'budgets'}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-muted">
          Monthly limits. Leave a field empty for no budget.
          {averages && ` Averages are from ${averages.label}.`}
        </p>
        {averages && (
          <button
            type="button"
            onClick={() => {
              setLimits(suggested(averages));
              setFilled(true);
            }}
            className={OUTLINE_BUTTON}
          >
            <Calculator className="size-3.5" strokeWidth={2} aria-hidden="true" />
            Suggest from last 6 months
          </button>
        )}
      </div>
      {filled && (
        <p role="status" className="-mt-1 text-[13px] text-ink-muted">
          Filled in each category’s average, rounded up. Change any of them, then save.
        </p>
      )}

      <div className={cn('hidden grid-cols-[minmax(0,1fr)_10rem_10rem] gap-x-4 sm:grid', HEAD)}>
        <span>Category</span>
        <span className="text-right">Usual month</span>
        <span className="text-right">Monthly limit</span>
      </div>
      <ul className="-mt-2 flex flex-col divide-y divide-line/60">
        {rows.map((row) => (
          <li key={row.name} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-x-4 py-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
            <label htmlFor={`budget-${row.name}`} className="flex min-w-0 flex-col text-sm font-medium text-ink">
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn('size-2 shrink-0 rounded-full', categoryBg(row.name))} aria-hidden="true" />
                <span className="truncate">{row.name}</span>
              </span>
              <span className="pl-4 text-xs font-normal tabular-nums text-ink-faint sm:hidden">
                {row.average > 0 ? `Usually ${formatINR(row.average)}` : 'Nothing lately'}
              </span>
            </label>
            <span className="hidden text-right text-[13px] tabular-nums text-ink-muted sm:block">
              {row.average > 0 ? formatINR(row.average) : '–'}
            </span>
            <MoneyInput
              id={`budget-${row.name}`}
              value={limits[row.name] ?? null}
              onChange={(value) => set(row.name, value)}
              placeholder="No budget"
            />
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-x-4 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
        <label htmlFor="budget-savings-target" className="flex min-w-0 flex-col text-sm font-medium text-ink">
          <span className="flex items-center gap-2">
            <PiggyBank className="size-4 text-accent" strokeWidth={1.8} aria-hidden="true" />
            Savings target
          </span>
          <span className="pl-6 text-xs font-normal text-ink-faint">
            Saved and invested each month
            <span className="sm:hidden">{averages && `, usually ${formatINR(averages.saved)}`}</span>
          </span>
        </label>
        <span className="hidden text-right text-[13px] tabular-nums text-ink-muted sm:block">
          {averages ? formatINR(averages.saved) : '–'}
        </span>
        <MoneyInput id="budget-savings-target" ref={savingsRef} value={target} onChange={setTarget} placeholder="No target" />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
        {error && (
          <p role="alert" className="mr-auto text-[13px] text-bad">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-control px-3.5 py-2 text-[13px] font-semibold text-ink-muted transition-colors duration-fast hover:bg-surface-2 hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-control bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save budgets'}
        </button>
      </div>
    </Card>
  );
}

// ---------- Savings target ----------

function SavingsCard({ months, target, label, saved, onEdit }) {
  const [chosen, setChosen] = useState(null);
  const latest = months.findLastIndex((m) => m.inPeriod);
  const active = chosen !== null && chosen < months.length ? chosen : latest;
  const month = months[active];
  const inPeriod = months.filter((m) => m.inPeriod);
  const met = inPeriod.filter((m) => m.amount >= target).length;
  const gap = month.amount - target;

  return (
    <Card aria-labelledby="savings-title">
      <CardHeader
        band
        id="savings-title"
        title="Savings target"
        icon={PiggyBank}
        subtitle={`${target > 0 ? `${formatINR(target)} a month` : 'No monthly target'} · ${formatINR(saved)} saved in ${label}`}
      >
        {target > 0 && (
          <Pill tone={met === inPeriod.length ? 'good' : 'warn'}>
            {inPeriod.length === 1 ? (met ? 'Target met' : 'Below target') : `Met ${met} of ${inPeriod.length}`}
          </Pill>
        )}
      </CardHeader>

      <div className="flex flex-col gap-3">
        <p className={HEAD}>Saved and invested · 12 months to {months[months.length - 1].longLabel}</p>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px]" aria-live="polite">
          <span className="font-semibold text-ink">{month.longLabel}</span>
          <span className="font-semibold tabular-nums text-ink">{formatINR(month.amount)}</span>
          {target > 0 && (
            <span className={gap >= 0 ? 'font-semibold text-good' : 'text-ink-muted'}>
              {gap >= 0 ? `${formatINR(gap)} above target` : `${formatINR(-gap)} short of target`}
            </span>
          )}
        </div>
        <MonthBars months={months} barClass="bg-accent" line={target} active={active} onActive={setChosen} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-faint">
            Transfers to savings and investments each month.{target > 0 && ' Dashed line: the monthly target.'} Bright bars
            are in the chosen period.
          </p>
          <button type="button" onClick={onEdit} className={OUTLINE_BUTTON}>
            <Pencil className="size-3.5" strokeWidth={2} aria-hidden="true" />
            {target > 0 ? 'Change target' : 'Set a target'}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ---------- Section ----------

export default function BudgetsSection() {
  const { transactions, budgets, updateBudgets } = useData();
  const { periodTransactions, mode, anchor, months, label } = usePeriod();
  // null, or how the editor opens: { suggest, focusSavings }
  const [editing, setEditing] = useState(null);
  const summary = useMemo(() => summarize(periodTransactions), [periodTransactions]);
  const budget = useMemo(() => budgetStatus(summary.categories, budgets.limits, summary.months), [summary, budgets.limits]);
  const range = useMemo(() => currentRange(mode, anchor, months), [mode, anchor, months]);
  const saved = useMemo(() => range && savedMonths(transactions, range.end, range), [transactions, range]);
  const averages = useMemo(() => monthlyAverages(transactions), [transactions]);

  if (!range) return null;
  const budgeted = new Set(budget.rows.map((r) => r.name));
  const unbudgeted = summary.categories.filter((c) => !budgeted.has(c.name));

  return (
    <div className="flex flex-col gap-4">
      {editing ? (
        <BudgetEditor
          budgets={budgets}
          averages={averages}
          suggest={editing.suggest}
          focusSavings={editing.focusSavings}
          onSave={updateBudgets}
          onClose={() => setEditing(null)}
        />
      ) : (
        <BudgetListCard
          budget={budget}
          unbudgeted={unbudgeted}
          months={summary.months}
          label={label}
          onEdit={(how = {}) => setEditing(how)}
        />
      )}
      <SavingsCard
        months={saved}
        target={budgets.savings_target || 0}
        label={label}
        saved={summary.saved}
        onEdit={() => setEditing({ focusSavings: true })}
      />
    </div>
  );
}
