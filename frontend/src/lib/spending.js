// Spending over time and between periods: what changed by category, one category's months,
// and where it went. Spending = debits that aren't savings (excluded rows never arrive here).
import { SHORT, monthLabel, periodRange, shiftMonth } from '@/app/period';
import { payeeName } from './payee';

const isSpend = (t) => t.txn_type === 'debit' && t.is_savings_transfer !== 1;
const categoryOf = (t) => t.category || 'Other';
const monthOf = (t) => t.date.slice(0, 7);

function inRange(range) {
  return (t) => {
    const key = monthOf(t);
    return key >= range.start && key <= range.end;
  };
}

function rangeLabel({ start, end }) {
  if (start === end) return monthLabel(start);
  const [sy, sm] = start.split('-');
  const [ey, em] = end.split('-');
  if (sm === '01' && em === '12' && sy === ey) return sy;
  return sy === ey ? `${SHORT[sm - 1]} – ${SHORT[em - 1]} ${ey}` : `${SHORT[sm - 1]} ${sy} – ${SHORT[em - 1]} ${ey}`;
}

const shiftRange = (range, delta) => ({ start: shiftMonth(range.start, delta), end: shiftMonth(range.end, delta) });

// The months the period actually covers, ending at the last month with data in it (so a year
// still in progress is Jan–Sep, not Jan–Dec). All time is the latest 12 months.
// `months` = months with data, newest first.
export function currentRange(mode, anchor, months) {
  if (!anchor || months.length === 0) return null;
  if (mode === 'all') return { start: shiftMonth(months[0], -11), end: months[0] };
  const range = periodRange(mode, anchor);
  const last = months.find((m) => m >= range.start && m <= range.end) || range.end;
  return { start: range.start, end: last };
}

// What the period can be compared with: the period before it and the same months a year
// earlier. A year (and all time's latest 12 months) only has the year before.
export function baselineOptions(mode, range) {
  if (!range) return [];
  const length = Math.round(
    (Number(range.end.slice(0, 4)) - Number(range.start.slice(0, 4))) * 12 +
      Number(range.end.slice(5)) - Number(range.start.slice(5)) + 1
  );
  const options = [];
  if (mode === 'month' || mode === '3m') {
    const before = shiftRange(range, -length);
    options.push({ value: 'previous', range: before, label: rangeLabel(before) });
  }
  const yearAgo = shiftRange(range, -12);
  options.push({ value: 'year', range: yearAgo, label: rangeLabel(yearAgo) });
  return options;
}

function totalsByCategory(transactions) {
  const totals = {};
  let total = 0;
  for (const t of transactions) {
    if (!isSpend(t)) continue;
    const amount = Math.abs(t.amount);
    totals[categoryOf(t)] = (totals[categoryOf(t)] || 0) + amount;
    total += amount;
  }
  return { totals, total };
}

// Every category in either period, biggest change first.
export function compareCategories(transactions, range, baseline) {
  const now = totalsByCategory(transactions.filter(inRange(range)));
  const before = totalsByCategory(transactions.filter(inRange(baseline)));
  const names = new Set([...Object.keys(now.totals), ...Object.keys(before.totals)]);
  const rows = [...names]
    .map((name) => {
      const a = now.totals[name] || 0;
      const b = before.totals[name] || 0;
      return { name, now: a, before: b, diff: a - b };
    })
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  return { rows, now: now.total, before: before.total, label: rangeLabel(range) };
}

// Month-by-month totals of the transactions passing `test`: `count` months ending at `end`,
// each flagged when it's inside the period (`range`).
export function monthTotals(transactions, test, end, range, count = 12) {
  const start = shiftMonth(end, -(count - 1));
  const byKey = {};
  for (let key = start; key <= end; key = shiftMonth(key, 1)) {
    const [y, m] = key.split('-');
    byKey[key] = {
      key,
      label: `${SHORT[m - 1]} ${y.slice(2)}`,
      longLabel: monthLabel(key),
      amount: 0,
      inPeriod: key >= range.start && key <= range.end,
    };
  }
  for (const t of transactions) {
    if (!test(t)) continue;
    const bucket = byKey[monthOf(t)];
    if (bucket) bucket.amount += Math.abs(t.amount);
  }
  return Object.values(byKey);
}

// One category's spending month by month (`category` null = all spending).
export function categoryMonths(transactions, category, end, range, count = 12) {
  return monthTotals(transactions, (t) => isSpend(t) && (!category || categoryOf(t) === category), end, range, count);
}

// Money moved to savings and investments, month by month.
export function savedMonths(transactions, end, range, count = 12) {
  return monthTotals(transactions, (t) => t.txn_type === 'debit' && t.is_savings_transfer === 1, end, range, count);
}

// Where one category's money went in a period: merchants biggest first, plus the facts line.
export function categoryDetail(transactions, category) {
  const rows = transactions.filter((t) => isSpend(t) && categoryOf(t) === category);
  const byMerchant = {};
  let total = 0;
  let largest = null;
  for (const t of rows) {
    const amount = Math.abs(t.amount);
    const name = payeeName(t) || 'Unknown';
    byMerchant[name] ??= { name, total: 0, count: 0 };
    byMerchant[name].total += amount;
    byMerchant[name].count += 1;
    total += amount;
    if (!largest || amount > Math.abs(largest.amount)) largest = t;
  }
  return {
    total,
    count: rows.length,
    largest,
    merchants: Object.values(byMerchant).sort((a, b) => b.total - a.total),
  };
}
