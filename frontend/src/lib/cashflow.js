// Cash flow over time: the period split into buckets (weeks for a single month, months
// otherwise), each with money in, spent, saved and what was left.
import { SHORT, monthLabel, shiftMonth } from '@/app/period';

const WEEK_STARTS = [1, 8, 15, 22, 29];

function emptyBucket(key, label, longLabel) {
  return { key, label, longLabel, income: 0, spent: 0, saved: 0 };
}

function add(bucket, t) {
  const amount = Math.abs(t.amount);
  if (t.txn_type === 'credit') bucket.income += amount;
  else if (t.is_savings_transfer === 1) bucket.saved += amount;
  else bucket.spent += amount;
}

const withLeft = (b) => ({ ...b, left: b.income - b.spent - b.saved });

// Weeks of one month: 1–7, 8–14, 15–21, 22–28, 29–end.
function weekBuckets(transactions, month) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const name = SHORT[m - 1];
  const buckets = WEEK_STARTS.filter((d) => d <= days).map((start, i, starts) => {
    const end = (starts[i + 1] || days + 1) - 1;
    const range = start === end ? `${start}` : `${start}–${end}`;
    return emptyBucket(`w${i}`, `${range} ${name}`, `${range} ${monthLabel(month)}`);
  });
  for (const t of transactions) {
    const day = Number(t.date.slice(8, 10));
    const index = WEEK_STARTS.filter((d) => d <= day).length - 1;
    add(buckets[index], t);
  }
  return buckets.map(withLeft);
}

// Every month from the first to the last with data, gaps included (shown as empty months).
function monthBuckets(transactions) {
  const keys = transactions.map((t) => t.date.slice(0, 7)).sort();
  if (keys.length === 0) return [];
  const byKey = {};
  for (let key = keys[0]; key <= keys[keys.length - 1]; key = shiftMonth(key, 1)) {
    const [y, m] = key.split('-');
    byKey[key] = emptyBucket(key, `${SHORT[m - 1]} ${y.slice(2)}`, monthLabel(key));
  }
  for (const t of transactions) add(byKey[t.date.slice(0, 7)], t);
  return Object.values(byKey).map(withLeft);
}

// `mode` is the header's period mode; a single month is split into weeks.
export function cashFlowBuckets(transactions, mode, anchor) {
  if (mode === 'month' && anchor) return { unit: 'week', buckets: weekBuckets(transactions, anchor) };
  return { unit: 'month', buckets: monthBuckets(transactions) };
}
