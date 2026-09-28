import { payeeName } from './payee';

// Money-in / money-out maths shared by the pages. Transactions arrive already without
// excluded ones (see DataContext). Savings transfers and investments are flagged
// is_savings_transfer and count as "saved", never as spending.

const isSaving = (t) => t.is_savings_transfer === 1;

export function summarize(transactions) {
  let spent = 0;
  let income = 0;
  let saved = 0;
  const byCategory = {};
  const bySource = {};

  for (const t of transactions) {
    const amount = Math.abs(t.amount);
    if (t.txn_type === 'credit') {
      income += amount;
      const source = payeeName(t) || 'Other';
      bySource[source] = (bySource[source] || 0) + amount;
    } else if (isSaving(t)) {
      saved += amount;
    } else {
      spent += amount;
      const category = t.category || 'Other';
      byCategory[category] = (byCategory[category] || 0) + amount;
    }
  }

  const sortDesc = (obj) =>
    Object.entries(obj)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

  return {
    spent,
    income,
    saved,
    categories: sortDesc(byCategory),
    sources: sortDesc(bySource),
    months: new Set(transactions.map((t) => t.date.slice(0, 7))).size,
  };
}

// Share of income that went to savings, or null when it wouldn't mean anything:
// no income, or savings bigger than income (money moved from an earlier balance).
export function savingsRate(saved, income) {
  if (income <= 0 || saved > income) return null;
  return saved / income;
}

// Budget use per category for a period covering `months` months.
// limits: { category: monthly limit | null }. Categories without a positive limit are skipped.
export function budgetStatus(categories, limits, months) {
  const spentBy = Object.fromEntries(categories.map((c) => [c.name, c.amount]));
  const rows = Object.entries(limits)
    .filter(([, limit]) => limit > 0)
    .map(([name, monthly]) => {
      const limit = monthly * Math.max(months, 1);
      const spent = spentBy[name] || 0;
      const used = spent / limit;
      return { name, spent, limit, used, state: used > 1 ? 'over' : used >= 0.95 ? 'at' : 'under' };
    })
    .sort((a, b) => b.used - a.used);

  const limit = rows.reduce((s, r) => s + r.limit, 0);
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  return { rows, limit, spent, left: limit - spent, over: rows.filter((r) => r.state === 'over').length };
}

// Budget bars in one list share a scale up to the biggest overspend, capped at 3× the limit.
export const MAX_OVER = 3;

export function budgetScale(rows) {
  return Math.max(1.25, ...rows.map((r) => Math.min(r.used, MAX_OVER)));
}
