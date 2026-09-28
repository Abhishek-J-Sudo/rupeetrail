import { payeeName } from './payee';

// Filtering and sorting for the Transactions page.

// Who set the category (backend category_source): 'rule', 'manual' (you) or 'ai'
export const categorySource = (t) => (t.category_source === 'manual' || t.category_source === 'ai' ? t.category_source : 'rule');
export const SET_BY_OPTIONS = [
  { value: 'all', label: 'Set by anyone' },
  { value: 'rule', label: 'Set by the rules' },
  { value: 'manual', label: 'Set by you' },
  { value: 'ai', label: 'Set by AI' },
];

// Amount queries: ">2000", "<=500", "220". Returns a test for Math.abs(amount), or null when the
// text isn't an amount query.
export function amountTest(text) {
  const m = text.replace(/[₹,\s]/g, '').match(/^(>=|<=|>|<|=)?(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const n = Number(m[2]);
  switch (m[1]) {
    case '>=':
      return (a) => a >= n;
    case '<=':
      return (a) => a <= n;
    case '>':
      return (a) => a > n;
    case '<':
      return (a) => a < n;
    default:
      return (a) => a === n;
  }
}

// One search box for merchant, narration or amount. A plain number also matches text
// (reference numbers, card digits); an operator like ">2000" only matches amounts.
export function matchesSearch(t, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const test = amountTest(q);
  if (test && test(Math.abs(t.amount))) return true;
  if (test && /^[<>=]/.test(q)) return false;
  return payeeName(t).toLowerCase().includes(q) || t.merchant.toLowerCase().includes(q) || t.narration.toLowerCase().includes(q);
}

export function filterTransactions(list, { query, category, direction, setBy = 'all' }) {
  return list.filter(
    (t) =>
      (category === 'all' || (t.category || 'Other') === category) &&
      (setBy === 'all' || categorySource(t) === setBy) &&
      (direction === 'all' || (direction === 'in' ? t.txn_type === 'credit' : t.txn_type === 'debit')) &&
      matchesSearch(t, query)
  );
}

const SORTERS = {
  date: (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
  amount: (a, b) => Math.abs(a.amount) - Math.abs(b.amount),
  merchant: (a, b) => payeeName(a).localeCompare(payeeName(b), 'en-IN', { sensitivity: 'base' }),
};

export function sortTransactions(list, by, order) {
  const sign = order === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => sign * SORTERS[by](a, b));
}

// Money in / out for a list, leaving out excluded rows (as every other total in the app does).
export function totals(list) {
  let moneyIn = 0;
  let moneyOut = 0;
  let uncategorised = 0;
  for (const t of list) {
    if (t.is_excluded === 1) continue;
    if (t.txn_type === 'credit') moneyIn += Math.abs(t.amount);
    else moneyOut += Math.abs(t.amount);
    if ((t.category || 'Other') === 'Other') uncategorised += 1;
  }
  return { moneyIn, moneyOut, net: moneyIn - moneyOut, uncategorised };
}
