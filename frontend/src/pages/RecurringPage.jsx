import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import { CurveCorner } from '@/components/brand/Route';
import PageHeader from '@/app/PageHeader';
import { LoadingState } from '@/app/StateViews';
import { useData } from '@/app/hooks';
import { useRecurring } from '@/app/useRecurring';
import { Card, CardHeader } from '@/components/kit/Card';
import CategoryTag from '@/components/kit/CategoryTag';
import KpiTile from '@/components/kit/KpiTile';
import Pill from '@/components/kit/Pill';
import Segmented from '@/components/kit/Segmented';
import { formatINR, formatINRCompact } from '@/lib/money';
import { shiftMonth } from '@/app/period';
import {
  averagePaid,
  calendarBounds,
  defaultCalendarMonth,
  groupRecurring,
  notSeenYet,
  paymentMonths,
  recurringMonth,
} from '@/lib/recurring';
import { categoryBg } from '@/theme/categories';
import { countUp, spring } from '@/theme/motion';
import { cn } from '@/lib/utils';

// Recurring payments are detected across all history, so this screen ignores the period.

const HEAD = 'font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const longDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const names = (list) => {
  if (list.length === 0) return 'None found';
  const shown = list.slice(0, 3).map((i) => i.name).join(', ');
  return list.length > 3 ? `${shown} + ${list.length - 3} more` : shown;
};

// ---------- Tiles ----------

// The hero is a typical month today (each active payment's usual amount); under it, what
// recurring payments actually averaged per month in the statements.
function KpiRow({ grouped, average }) {
  const { totals, groups, active } = grouped;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <KpiTile label="Typical month" value={totals.all} hero>
        <span>
          {active.length} payment{active.length === 1 ? '' : 's'}
          {average && ` · averaged ${formatINR(average.amount)} a month over the last ${average.months} months`}
        </span>
      </KpiTile>
      <KpiTile label="Bills and EMIs" value={totals.bills}>
        <span className="truncate">{names(groups.bills)}</span>
      </KpiTile>
      <KpiTile label="Subscriptions" value={totals.subs}>
        <span className="truncate">{names(groups.subs)}</span>
      </KpiTile>
      <KpiTile label="SIPs and savings" value={totals.invest}>
        <span className="truncate">{names(groups.invest)}</span>
      </KpiTile>
    </div>
  );
}

// ---------- Every regular payment ----------

const COLS = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 sm:grid-cols-[minmax(0,1fr)_10rem_9rem_7.5rem]';

// A payment's last 12 months as small bars: the pattern (steady, rising, a skipped month)
// reads at a glance. Dashed line: its usual monthly amount. Point at a bar for that month.
function History({ item, byId }) {
  const months = useMemo(() => paymentMonths(item, byId), [item, byId]);
  const [chosen, setChosen] = useState(null);
  const latest = months.findLastIndex((m) => m.amount > 0);
  const active = chosen ?? latest;
  const top = Math.max(item.monthly_amount, ...months.map((m) => m.amount), 1);
  const pct = (v) => `${(v / top) * 100}%`;
  const month = months[active];

  return (
    <div className="flex flex-col gap-3 rounded-control bg-surface-2 px-3 py-3 text-[13px] text-ink-muted">
      <p>
        Paid in {item.months_paid} months since {longDate(item.first_paid)} ·{' '}
        <span className="font-semibold tabular-nums text-ink">{formatINR(item.total_paid)}</span> in all
      </p>
      <div className="flex items-baseline gap-2" aria-live="polite">
        <span className="font-semibold text-ink">{month.longLabel}</span>
        <span className={cn('tabular-nums', month.amount > 0 ? 'font-semibold text-ink' : 'text-ink-faint')}>
          {month.amount > 0 ? formatINR(month.amount) : 'Not paid'}
        </span>
      </div>
      <div className="relative h-16">
        <span
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-faint"
          style={{ bottom: pct(item.monthly_amount) }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 flex items-end gap-1">
          {months.map((m, i) => (
            <button
              key={m.key}
              type="button"
              aria-label={`${m.longLabel}: ${m.amount > 0 ? formatINR(m.amount) : 'not paid'}`}
              aria-pressed={active === i}
              onMouseEnter={() => setChosen(i)}
              onFocus={() => setChosen(i)}
              onClick={() => setChosen(i)}
              className={cn(
                'flex h-full min-w-0 flex-1 items-end justify-center rounded-t-[3px] outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-accent',
                active === i ? 'bg-accent/[0.08]' : 'hover:bg-accent/[0.05]'
              )}
            >
              <motion.span
                className={cn('w-full max-w-[22px] origin-bottom rounded-t-[3px]', m.amount > 0 ? categoryBg(item.category) : 'bg-track')}
                style={{ height: m.amount > 0 ? pct(m.amount) : '3px' }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ ...countUp, delay: i * 0.02 }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="-mt-1 flex justify-between text-[11px] text-ink-faint" aria-hidden="true">
        <span>{months[0].label}</span>
        <span>Dashed: usual {formatINR(item.monthly_amount)}</span>
        <span>{months[months.length - 1].label}</span>
      </div>
    </div>
  );
}

function PaymentRow({ item, dataUntil, open, onToggle, byId }) {
  const late = notSeenYet(item, dataUntil);
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          COLS,
          'w-full items-center gap-y-1 rounded-control px-2 py-3 text-left outline-none transition-colors duration-fast hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent',
          !item.active && 'opacity-70'
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <ChevronDown
              className={cn('size-3.5 shrink-0 text-ink-faint transition-transform duration-fast', open && 'rotate-180')}
              strokeWidth={2}
              aria-hidden="true"
            />
            <span className="truncate">{item.name}</span>
          </span>
          <span className="pl-5 text-xs text-ink-faint">
            {item.active ? `Seen ${item.months_paid} months` : `Stopped · last paid ${longDate(item.last_paid)}`}
          </span>
        </span>
        <span className="order-3 col-span-2 pl-5 sm:order-none sm:col-span-1 sm:pl-0">
          <CategoryTag category={item.category} />
        </span>
        <span className="order-4 col-span-2 pl-5 text-[13px] sm:order-none sm:col-span-1 sm:pl-0">
          {!item.active ? (
            <span className="text-ink-faint">–</span>
          ) : late ? (
            <Pill tone="warn">Due {shortDate(item.next_expected)}, not seen</Pill>
          ) : (
            <span className="tabular-nums text-ink">{shortDate(item.next_expected)}</span>
          )}
        </span>
        <span className="order-2 text-right sm:order-none">
          <span className="text-sm font-semibold tabular-nums text-ink">{formatINR(item.monthly_amount)}</span>
          <span className="text-xs text-ink-faint"> /mo</span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="px-2 pb-3 sm:pl-7">
              <History item={item} byId={byId} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

// Soonest (next due date), biggest (monthly amount) or longest running (months paid).
const SORTS = [
  { value: 'soonest', label: 'Soonest', note: 'soonest first', by: (a, b) => a.next_expected.localeCompare(b.next_expected) },
  { value: 'biggest', label: 'Biggest', note: 'biggest first', by: (a, b) => b.monthly_amount - a.monthly_amount },
  { value: 'longest', label: 'Longest', note: 'longest running first', by: (a, b) => b.months_paid - a.months_paid || b.monthly_amount - a.monthly_amount },
];

function PaymentsCard({ grouped, dataUntil, byId }) {
  const [open, setOpen] = useState(null);
  const [showStopped, setShowStopped] = useState(false);
  const [sort, setSort] = useState('soonest');
  const order = SORTS.find((o) => o.value === sort);
  const active = useMemo(() => [...grouped.active].sort(order.by), [grouped.active, order]);
  const late = grouped.active.filter((i) => notSeenYet(i, dataUntil)).length;
  const row = (item) => (
    <PaymentRow
      key={item.id}
      item={item}
      dataUntil={dataUntil}
      byId={byId}
      open={open === item.id}
      onToggle={() => setOpen(open === item.id ? null : item.id)}
    />
  );

  return (
    <Card aria-labelledby="payments-title" className="relative overflow-hidden">
      <CurveCorner className="stroke-accent/35" />
      <CardHeader
        band
        id="payments-title"
        title="Regular payments"
        icon={Repeat}
        subtitle={`${grouped.active.length} active, ${order.note} · statements up to ${longDate(dataUntil)}`}
      >
        {late > 0 ? <Pill tone="warn">{late} not seen</Pill> : <Pill tone="good">All on time</Pill>}
      </CardHeader>

      <Segmented label="Sort payments" options={SORTS} value={sort} onChange={setSort} className="self-start" />

      <div className={cn(COLS, 'hidden px-2 sm:grid', HEAD)}>
        <span>Payment</span>
        <span>Category</span>
        <span>Next</span>
        <span className="text-right">Amount</span>
      </div>
      <ul className="-mx-2 -mt-2 flex flex-col divide-y divide-line/60">{active.map(row)}</ul>

      {grouped.stopped.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => setShowStopped((v) => !v)}
            aria-expanded={showStopped}
            className="inline-flex items-center gap-1 self-start text-[13px] font-semibold text-accent transition-colors duration-fast hover:text-accent-hover"
          >
            {showStopped ? 'Hide' : 'Show'} {grouped.stopped.length} stopped
            <ChevronDown className={cn('size-3.5 transition-transform duration-fast', showStopped && 'rotate-180')} strokeWidth={2} aria-hidden="true" />
          </button>
          {showStopped && <ul className="-mx-2 flex flex-col divide-y divide-line/60">{grouped.stopped.map(row)}</ul>}
        </div>
      )}

      <p className="text-xs text-ink-faint">
        Found automatically: paid on about the same day for 3 or more months in a row. Daily shops don&apos;t count.
      </p>
    </Card>
  );
}

// ---------- Calendar ----------

const STATUS = {
  actual: { tone: 'neutral', label: 'From statements' },
  partial: { tone: 'accent', label: 'Partly projected' },
  projected: { tone: 'accent', label: 'Projected' },
};
const KIND = {
  paid: { label: 'Paid', text: 'text-ink-muted' },
  expected: { label: 'Expected', text: 'text-accent' },
  overdue: { label: 'Not seen yet', text: 'text-warn' },
};

function monthSubtitle(cal) {
  const days = cal.days.filter((d) => d.entries.length > 0).length;
  if (cal.status === 'projected') return `${formatINR(cal.expected)} expected`;
  if (cal.status === 'partial') return `${formatINR(cal.paid)} paid · ${formatINR(cal.expected)} to come`;
  return cal.paid > 0 ? `${formatINR(cal.paid)} paid across ${days} day${days === 1 ? '' : 's'}` : 'No recurring payments this month';
}

function MonthNav({ month, bounds, onMonth }) {
  const buttons = [
    { label: 'Previous month', icon: ChevronLeft, to: shiftMonth(month, -1), disabled: month <= bounds.min },
    { label: 'Next month', icon: ChevronRight, to: shiftMonth(month, 1), disabled: month >= bounds.max },
  ];
  return (
    <span className="flex items-center gap-1">
      {buttons.map(({ label, icon: Icon, to, disabled }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={() => onMonth(to)}
          className="rounded-control border border-line bg-surface p-1.5 text-ink transition-colors duration-fast hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
        </button>
      ))}
    </span>
  );
}

function CalendarCard({ items, byId, dataUntil, initialMonth }) {
  const bounds = useMemo(() => calendarBounds(items, dataUntil), [items, dataUntil]);
  const [month, setMonth] = useState(initialMonth);
  const [picked, setPicked] = useState(null);
  const cal = useMemo(() => recurringMonth(items, byId, month, dataUntil), [items, byId, month, dataUntil]);
  const day = picked !== null ? cal.days[picked] : null;
  const status = STATUS[cal.status];
  const goTo = (next) => {
    setMonth(next);
    setPicked(null);
  };

  return (
    <Card aria-labelledby="calendar-title">
      <CardHeader band id="calendar-title" title={cal.label} icon={CalendarDays} subtitle={monthSubtitle(cal)}>
        <MonthNav month={month} bounds={bounds} onMonth={goTo} />
      </CardHeader>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Pill tone={status.tone}>{status.label}</Pill>
        <span className="flex items-center gap-3 text-[11px] text-ink-faint" aria-hidden="true">
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-[3px] bg-accent-soft ring-1 ring-accent/30" /> Paid
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-[3px] border border-dashed border-accent/70" /> Expected
          </span>
          {cal.status === 'partial' && (
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-[3px] border border-dashed border-warn" /> Not seen
            </span>
          )}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`Recurring payments in ${cal.label}`}>
        {WEEKDAYS.map((w) => (
          <span key={w} className={cn(HEAD, 'pb-1 text-center')} role="columnheader">
            {w}
          </span>
        ))}
        {Array.from({ length: cal.offset }, (_, i) => (
          <span key={`pad-${i}`} aria-hidden="true" />
        ))}
        {cal.days.map((d, i) => {
          const has = d.entries.length > 0;
          const paid = d.entries.some((e) => e.kind === 'paid');
          const overdue = d.entries.some((e) => e.kind === 'overdue');
          const total = d.entries.reduce((s, e) => s + e.amount, 0);
          return (
            <button
              key={d.day}
              type="button"
              disabled={!has}
              onClick={() => setPicked(picked === i ? null : i)}
              onMouseEnter={() => has && setPicked(i)}
              aria-pressed={picked === i}
              aria-label={
                has
                  ? `${d.day} ${cal.short}: ${d.entries.map((e) => `${e.item.name} ${KIND[e.kind].label.toLowerCase()}`).join(', ')}, ${formatINR(total)}`
                  : `${d.day} ${cal.short}`
              }
              className={cn(
                'flex min-h-14 flex-col items-start justify-between rounded-control px-1 py-1 text-left outline-none sm:px-1.5 transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-accent',
                !has && 'cursor-default',
                has && paid && 'bg-accent-soft/60 hover:bg-accent-soft',
                has && !paid && (overdue ? 'border border-dashed border-warn' : 'border border-dashed border-accent/60 hover:bg-accent-soft/40'),
                picked === i && 'bg-accent-soft ring-1 ring-accent/40'
              )}
            >
              <span className={cn('text-xs tabular-nums', has ? 'font-semibold text-ink' : 'text-ink-faint')}>{d.day}</span>
              {has && (
                <span className="flex w-full flex-col gap-0.5">
                  <span className="flex gap-0.5" aria-hidden="true">
                    {d.entries.slice(0, 4).map((e, k) => (
                      <span
                        key={k}
                        className={cn('size-1.5 rounded-full', categoryBg(e.item.category), e.kind !== 'paid' && 'opacity-60')}
                      />
                    ))}
                  </span>
                  <span className={cn('truncate text-[10px] font-semibold tabular-nums sm:text-[11px]', paid ? 'text-ink' : overdue ? 'text-warn' : 'text-ink-muted')}>
                    {formatINRCompact(total)}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-[4.5rem] border-t border-line pt-3" aria-live="polite">
        {day ? (
          <ul className="flex flex-col gap-1.5">
            <li className={HEAD}>
              {day.day} {cal.short}
            </li>
            {day.entries.map((e, k) => (
              <li key={k} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-center gap-2 text-ink">
                  <span className={cn('size-2 shrink-0 rounded-full', categoryBg(e.item.category))} aria-hidden="true" />
                  <span className="truncate">{e.item.name}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className={cn('text-xs', KIND[e.kind].text)}>{KIND[e.kind].label}</span>
                  <span className="font-semibold tabular-nums text-ink">{formatINR(e.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-faint">
            Past months show what was paid; later months show what&apos;s expected on each payment&apos;s usual day. Point at a
            day to see it.
          </p>
        )}
      </div>
    </Card>
  );
}

// ---------- Screen ----------

export default function RecurringPage() {
  const { data, error } = useRecurring();
  const { transactions } = useData();
  const byId = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions]);
  const grouped = useMemo(() => data && groupRecurring(data), [data]);
  const items = useMemo(() => grouped && [...grouped.active, ...grouped.stopped], [grouped]);
  const initialMonth = useMemo(() => grouped && defaultCalendarMonth(grouped.active, data.data_until), [grouped, data]);
  const average = useMemo(() => items && averagePaid(items, byId, data.data_until), [items, byId, data]);

  return (
    <>
      <PageHeader title="Recurring" subtitle="EMIs, SIPs, subscriptions and bills that go out every month" />
      {error && <p className="text-sm text-bad">{error}</p>}
      {!data && !error && <LoadingState />}
      {grouped &&
        (grouped.active.length + grouped.stopped.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-ink-muted">
              No regular payments found yet. They show up once the same payment appears 3 months in a row.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <KpiRow grouped={grouped} average={average} />
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <PaymentsCard grouped={grouped} dataUntil={data.data_until} byId={byId} />
              {initialMonth && (
                <CalendarCard items={items} byId={byId} dataUntil={data.data_until} initialMonth={initialMonth} />
              )}
            </div>
          </div>
        ))}
    </>
  );
}
