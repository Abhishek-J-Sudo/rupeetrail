// Money formatting. Always Indian grouping (₹1,34,340), whole rupees unless asked for paise.

const MINUS = '−'; // a real minus sign, the same width as "+" in tabular figures

export function formatINR(amount, { signed = false, paise = false } = {}) {
  const value = Number(amount) || 0;
  const digits = paise ? 2 : 0;
  const body = `₹${Math.abs(value).toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
  if (value < 0) return `${MINUS}${body}`;
  if (signed && value > 0) return `+${body}`;
  return body;
}

// A transaction as it reads in a list: spending "−₹486", income "+₹1,20,000".
export function formatTxnAmount(txn) {
  const amount = Math.abs(txn.amount);
  return formatINR(txn.txn_type === 'credit' ? amount : -amount, { signed: true, paise: amount % 1 !== 0 });
}

// "−4.2%" / "+12.0%", for changes between periods.
export function formatChange(ratio) {
  const pct = (ratio * 100).toFixed(1);
  if (ratio < 0) return `${MINUS}${pct.slice(1)}%`;
  return `+${pct}%`;
}

// Short form for chart labels: "₹950", "₹12k", "₹1.3L", "₹2.4Cr" (Indian lakh/crore).
export function formatINRCompact(amount) {
  const value = Math.abs(Number(amount) || 0);
  const sign = amount < 0 ? MINUS : '';
  const trim = (n) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
  if (value >= 1e7) return `${sign}₹${trim(value / 1e7)}Cr`;
  if (value >= 1e5) return `${sign}₹${trim(value / 1e5)}L`;
  if (value >= 1e3) return `${sign}₹${trim(value / 1e3)}k`;
  return `${sign}₹${Math.round(value)}`;
}
