// Recurring payments (from GET /recurring, detected across all history) grouped for the
// Recurring screen, plus the month calendar they're drawn on.
import { SHORT, monthLabel, shiftMonth } from '@/app/period';

const SUBSCRIPTIONS = new Set(['Software & AI', 'Entertainment']);

// Which box a payment counts in: SIPs and savings, subscriptions, or bills and EMIs.
export function recurringKind(item) {
  if (item.category === 'Investments') return 'invest';
  if (SUBSCRIPTIONS.has(item.category)) return 'subs';
  return 'bills';
}

// A due date on or before the last statement date means it hasn't shown up yet.
export const notSeenYet = (item, dataUntil) => Boolean(item.next_expected && dataUntil && item.next_expected <= dataUntil);

export function groupRecurring(data) {
  const active = data.items.filter((i) => i.active).sort((a, b) => a.next_expected.localeCompare(b.next_expected));
  const stopped = data.items.filter((i) => !i.active).sort((a, b) => b.last_paid.localeCompare(a.last_paid));
  const sum = (kind) => active.filter((i) => recurringKind(i) === kind);
  const total = (list) => list.reduce((s, i) => s + i.monthly_amount, 0);
  const groups = { bills: sum('bills'), subs: sum('subs'), invest: sum('invest') };
  return {
    active,
    stopped,
    groups,
    totals: { all: total(active), bills: total(groups.bills), subs: total(groups.subs), invest: total(groups.invest) },
  };
}

// The month the calendar opens on: the one most upcoming payments fall in (else the month
// after the statements end).
export function defaultCalendarMonth(active, dataUntil) {
  const counts = {};
  for (const i of active) {
    if (i.next_expected && i.next_expected > (dataUntil || '')) {
      const key = i.next_expected.slice(0, 7);
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  const busiest = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return busiest || (dataUntil ? shiftMonth(dataUntil.slice(0, 7), 1) : null);
}

// How far the calendar can move: back to the first recurring payment, 3 months past the statements.
export function calendarBounds(items, dataUntil) {
  const first = items.map((i) => i.first_paid.slice(0, 7)).sort()[0];
  return { min: first, max: shiftMonth(dataUntil.slice(0, 7), 3) };
}

// One month of recurring payments, day by day. Each entry is one of:
//   paid     – in the statements (real date and amount)
//   expected – still to come: every month after the statements, and the rest of the month
//              the statements end in (usual day after the last statement date)
//   overdue  – its usual day in that last month has passed but it hasn't shown up
// `byId` maps transaction id -> transaction (for the real dates and amounts).
export function recurringMonth(items, byId, month, dataUntil) {
  const [y, m] = month.split('-').map(Number);
  const length = new Date(y, m, 0).getDate();
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first
  const lastMonth = dataUntil.slice(0, 7);
  const lastDay = Number(dataUntil.slice(8, 10));
  const days = Array.from({ length }, (_, i) => ({ day: i + 1, entries: [] }));
  const add = (day, item, amount, kind) => days[Math.min(day, length) - 1].entries.push({ item, amount, kind });

  for (const item of items) {
    let paidHere = false;
    if (month <= lastMonth) {
      for (const id of item.transaction_ids) {
        const t = byId.get(id);
        if (!t || t.date.slice(0, 7) !== month) continue;
        add(Number(t.date.slice(8, 10)), item, Math.abs(t.amount), 'paid');
        paidHere = true;
      }
    }
    if (!item.active || paidHere || month < lastMonth) continue;
    if (month > lastMonth) add(item.usual_day, item, item.monthly_amount, 'expected');
    else if (Math.min(item.usual_day, length) > lastDay) add(item.usual_day, item, item.monthly_amount, 'expected');
    else if (item.next_expected?.slice(0, 7) === month) add(item.usual_day, item, item.monthly_amount, 'overdue');
  }

  const sum = (kind) => days.reduce((s, d) => s + d.entries.filter((e) => e.kind === kind).reduce((a, e) => a + e.amount, 0), 0);
  const status = month > lastMonth ? 'projected' : month === lastMonth ? 'partial' : 'actual';
  return {
    month,
    label: monthLabel(month),
    short: SHORT[m - 1],
    offset,
    days,
    status,
    paid: sum('paid'),
    expected: sum('expected') + sum('overdue'),
  };
}

// What recurring payments actually came to per month: the last `count` complete months of
// statements (the month they end in is usually partial), from the first recurring payment on.
export function averagePaid(items, byId, dataUntil, count = 12) {
  const end = shiftMonth(dataUntil.slice(0, 7), -1);
  const first = items.map((i) => i.first_paid.slice(0, 7)).sort()[0];
  let start = shiftMonth(end, -(count - 1));
  if (first > start) start = first;
  if (start > end) return null;
  let total = 0;
  for (const item of items) {
    for (const id of item.transaction_ids) {
      const t = byId.get(id);
      const key = t?.date.slice(0, 7);
      if (key && key >= start && key <= end) total += Math.abs(t.amount);
    }
  }
  let months = 0;
  for (let key = start; key <= end; key = shiftMonth(key, 1)) months += 1;
  return { amount: total / months, months };
}

// One payment month by month: the 12 months up to its last payment, with what was paid in
// each (0 = skipped). `byId` maps transaction id -> transaction.
export function paymentMonths(item, byId, count = 12) {
  const end = item.last_paid.slice(0, 7);
  const byKey = {};
  for (let key = shiftMonth(end, -(count - 1)); key <= end; key = shiftMonth(key, 1)) {
    const [y, m] = key.split('-');
    byKey[key] = { key, label: `${SHORT[m - 1]} ${y.slice(2)}`, longLabel: monthLabel(key), amount: 0 };
  }
  for (const id of item.transaction_ids) {
    const t = byId.get(id);
    const bucket = t && byKey[t.date.slice(0, 7)];
    if (bucket) bucket.amount += Math.abs(t.amount);
  }
  return Object.values(byKey);
}
