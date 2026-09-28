// Period maths for the top bar. Months are 'YYYY-MM' keys, which sort as strings.

export const PERIOD_MODES = [
  { id: 'month', label: 'Month' },
  { id: '3m', label: '3 months' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All' },
];

export const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key) {
  const [y, m] = key.split('-');
  return `${LONG[Number(m) - 1]} ${y}`;
}

// Inclusive month range for a mode, or null for all time.
export function periodRange(mode, anchor) {
  if (mode === 'all' || !anchor) return null;
  if (mode === 'month') return { start: anchor, end: anchor };
  if (mode === '3m') return { start: shiftMonth(anchor, -2), end: anchor };
  const year = anchor.slice(0, 4);
  return { start: `${year}-01`, end: `${year}-12` };
}

// The period as the backend's AI insights name it: 'YYYY-MM', 'YYYY', 'YYYY-MM:YYYY-MM' or 'all'.
export function periodKey(mode, anchor) {
  if (mode === 'all' || !anchor) return 'all';
  if (mode === 'month') return anchor;
  if (mode === 'year') return anchor.slice(0, 4);
  const { start, end } = periodRange(mode, anchor);
  return `${start}:${end}`;
}

// periodKey() in reverse: { mode, anchor } for a key, using `months` (months with data,
// newest first) to anchor a year. Null when the key's months have no data any more.
export function fromPeriodKey(key, months) {
  if (key === 'all') return { mode: 'all', anchor: months[0] ?? null };
  if (key.includes(':')) return { mode: '3m', anchor: key.split(':')[1] };
  if (key.length === 7) return months.includes(key) ? { mode: 'month', anchor: key } : null;
  const anchor = months.find((m) => m.startsWith(key));
  return anchor ? { mode: 'year', anchor } : null;
}

export function periodLabel(mode, anchor) {
  if (mode === 'all' || !anchor) return 'All time';
  if (mode === 'month') return monthLabel(anchor);
  if (mode === 'year') return anchor.slice(0, 4);
  const start = shiftMonth(anchor, -2);
  const [sy, sm] = start.split('-');
  const [ey, em] = anchor.split('-');
  return sy === ey
    ? `${SHORT[sm - 1]} – ${SHORT[em - 1]} ${ey}`
    : `${SHORT[sm - 1]} ${sy} – ${SHORT[em - 1]} ${ey}`;
}

// The period just before the current one, for "vs July" comparisons. Null for all time.
// A year is compared with the same months of the year before (Jan–Sep 2026 vs Jan–Sep 2025),
// so a year still in progress isn't set against a full one. `months` = months with data.
export function previousPeriod(mode, anchor, months = []) {
  if (mode === 'all' || !anchor) return null;
  if (mode === 'month') {
    const prev = shiftMonth(anchor, -1);
    return { inPeriod: makeInPeriod('month', prev), label: LONG[Number(prev.slice(5)) - 1] };
  }
  if (mode === '3m') return { inPeriod: makeInPeriod('3m', shiftMonth(anchor, -3)), label: 'previous 3 months' };
  const year = anchor.slice(0, 4);
  const prevYear = String(Number(year) - 1);
  const lastMonth = months.filter((m) => m.startsWith(year)).sort().pop()?.slice(5) || '12';
  const start = `${prevYear}-01`;
  const end = `${prevYear}-${lastMonth}`;
  return {
    inPeriod: (dateString) => {
      const key = dateString.slice(0, 7);
      return key >= start && key <= end;
    },
    label: lastMonth === '12' ? prevYear : `Jan – ${SHORT[Number(lastMonth) - 1]} ${prevYear}`,
  };
}

export function makeInPeriod(mode, anchor) {
  const range = periodRange(mode, anchor);
  if (!range) return () => true;
  return (dateString) => {
    const key = dateString.slice(0, 7);
    return key >= range.start && key <= range.end;
  };
}
