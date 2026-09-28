// "Suggest from last 6 months": what each category usually costs a month, no AI.

import { SHORT, shiftMonth } from '@/app/period';

// Round a monthly average up to an amount people would type: ₹100 steps below ₹1,000,
// ₹500 steps above.
export function roundBudget(amount) {
  const step = amount < 1000 ? 100 : 500;
  return Math.ceil(amount / step) * step;
}

// Monthly averages over the last `count` complete months: the month the statements end in is
// usually partial, so the window ends the month before (or on it, when it's the only month).
// Returns { spent: {category: average}, saved: average, months, label } or null without data.
export function monthlyAverages(transactions, count = 6) {
  if (transactions.length === 0) return null;
  const keys = transactions.map((t) => t.date.slice(0, 7)).sort();
  const first = keys[0];
  const last = keys[keys.length - 1];
  const end = first < last ? shiftMonth(last, -1) : last;
  let start = shiftMonth(end, -(count - 1));
  if (first > start) start = first;

  let months = 0;
  for (let key = start; key <= end; key = shiftMonth(key, 1)) months += 1;

  const spent = {};
  let saved = 0;
  for (const t of transactions) {
    const key = t.date.slice(0, 7);
    if (key < start || key > end || t.txn_type === 'credit') continue;
    const amount = Math.abs(t.amount);
    if (t.is_savings_transfer === 1) saved += amount;
    else {
      const category = t.category || 'Other';
      spent[category] = (spent[category] || 0) + amount;
    }
  }
  for (const name of Object.keys(spent)) spent[name] /= months;

  const short = (key) => `${SHORT[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`;
  const label = start === end ? short(end) : `${short(start)} to ${short(end)}`;
  return { spent, saved: saved / months, months, label };
}
