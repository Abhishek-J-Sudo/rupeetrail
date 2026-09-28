import { CATEGORY_SLUGS } from './categorySlugs.js';

const KNOWN = new Set(CATEGORY_SLUGS);

// "Food & Dining" -> "food-dining". Unknown categories (e.g. user-created) fall back to "other".
export function categorySlug(category) {
  const slug = String(category || '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return KNOWN.has(slug) ? slug : 'other';
}

// For inline styles and SVG style props: categoryColor('Groceries', 0.15)
export function categoryColor(category, alpha = 1) {
  return `rgb(var(--rt-cat-${categorySlug(category)}) / ${alpha})`;
}

// Tailwind class helpers, e.g. <span className={categoryBg('Groceries')} />.
// Full class names are listed so Tailwind's scanner generates them.
const BG = {
  'home-expense': 'bg-cat-home-expense',
  'loans-emi': 'bg-cat-loans-emi',
  'credit-cards': 'bg-cat-credit-cards',
  groceries: 'bg-cat-groceries',
  'food-dining': 'bg-cat-food-dining',
  shopping: 'bg-cat-shopping',
  transportation: 'bg-cat-transportation',
  fuel: 'bg-cat-fuel',
  bills: 'bg-cat-bills',
  'software-ai': 'bg-cat-software-ai',
  healthcare: 'bg-cat-healthcare',
  entertainment: 'bg-cat-entertainment',
  'travel-stays': 'bg-cat-travel-stays',
  education: 'bg-cat-education',
  services: 'bg-cat-services',
  'personal-expense': 'bg-cat-personal-expense',
  investments: 'bg-cat-investments',
  income: 'bg-cat-income',
  'personal-transfer': 'bg-cat-personal-transfer',
  'atm-withdrawal': 'bg-cat-atm-withdrawal',
  miscellaneous: 'bg-cat-miscellaneous',
  other: 'bg-cat-other',
};

export function categoryBg(category) {
  return BG[categorySlug(category)];
}
