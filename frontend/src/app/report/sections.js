import { ArrowRightLeft, ChartPie, LayoutDashboard, Repeat, Settings, Sparkles, Target, Waypoints } from 'lucide-react';

// The report's sections, top to bottom. `id` is the #anchor; `mobile` marks the phone bottom-bar jumps.
export const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, mobile: true },
  { id: 'cash-flow', label: 'Cash flow', icon: Waypoints },
  { id: 'spending', label: 'Spending', icon: ChartPie, mobile: true },
  { id: 'budgets', label: 'Budgets', icon: Target, mobile: true },
  { id: 'transactions', label: 'Transactions', shortLabel: 'Activity', icon: ArrowRightLeft, mobile: true },
];

// The report itself, as a header link back from the other screens.
export const REPORT = { to: '/', label: 'Report', icon: LayoutDashboard };

// Screens opened from the header. Recurring and Settings ignore the period; AI insights follows it.
export const SCREENS = [
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/ai', label: 'AI insights', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// Smooth-scroll to a section and put its #anchor in the address bar.
export function goToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.history.replaceState(null, '', `#${id}`);
}
