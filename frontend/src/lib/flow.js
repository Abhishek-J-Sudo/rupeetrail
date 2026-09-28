import { categoryColor } from '@/theme/categories';

// Turns a summarize() result into MoneyFlow items: income sources on the left; savings, the
// biggest categories and "Everything else" on the right. Adds "Left in account" or "From
// balance" so both sides add up to the same total.
export function buildFlow({ spent, income, saved, categories, sources }, { shownSources = 3, shownCategories = 7 } = {}) {
  const good = 'rgb(var(--rt-good))';
  const neutral = 'rgb(var(--rt-line-strong))';

  const inItems = sources.slice(0, shownSources).map((s) => ({ key: s.name, label: s.name, amount: s.amount, color: good }));
  const otherIncome = sources.slice(shownSources).reduce((sum, s) => sum + s.amount, 0);
  if (otherIncome > 0) inItems.push({ key: 'other-in', label: 'Other income', amount: otherIncome, color: good });

  const outItems = [];
  if (saved > 0) outItems.push({ key: 'saved', label: 'Saved', amount: saved, color: good });
  categories.slice(0, shownCategories).forEach((c) =>
    outItems.push({ key: c.name, label: c.name, amount: c.amount, color: categoryColor(c.name) })
  );
  const rest = categories.slice(shownCategories).reduce((sum, c) => sum + c.amount, 0);
  if (rest > 0) outItems.push({ key: 'rest', label: 'Everything else', amount: rest, color: categoryColor('Other') });

  const out = spent + saved;
  if (income > out) {
    outItems.push({ key: 'kept', label: 'Left in account', amount: income - out, color: neutral, muted: true });
  } else if (out > income) {
    inItems.push({ key: 'balance', label: 'From balance', amount: out - income, color: neutral, muted: true });
  }
  return { inItems, outItems };
}

// The outflows alone, biggest first, for the treemap / ring / bars views: without the
// balancing "Left in account" row, since that money didn't go anywhere.
export function spendItems(outItems) {
  return outItems.filter((i) => !i.muted && i.amount > 0).sort((a, b) => b.amount - a.amount);
}
