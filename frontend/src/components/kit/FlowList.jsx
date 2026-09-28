import { motion } from 'motion/react';
import { formatINR } from '@/lib/money';
import { countUp, stagger } from '@/theme/motion';

// The phone version of MoneyFlow: a Sankey is too narrow to read at 390px, so each side
// becomes one proportion bar plus a list with full names. Takes the same items as MoneyFlow
// (from buildFlow()), so the numbers match the wide chart exactly.
function Side({ title, items }) {
  // The header and shares count real money only; the balancing row ("From balance",
  // "Left in account") still shows in the bar and list, without a share
  const total = items.filter((i) => !i.muted).reduce((s, i) => s + i.amount, 0);
  const delay = stagger(items.length);
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint">{title}</span>
        <span className="text-sm font-semibold tabular-nums text-ink">{formatINR(total)}</span>
      </div>
      <div className="flex h-3 gap-px overflow-hidden rounded-full bg-track" aria-hidden="true">
        {items.map((item, i) => (
          <motion.span
            key={item.key}
            className="h-full origin-left"
            style={{ flexGrow: item.amount, backgroundColor: item.color, opacity: item.muted ? 0.6 : 1 }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ ...countUp, delay: i * delay }}
          />
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-line/60">
        {items.map((item) => (
          <li key={item.key} className="flex items-start justify-between gap-3 py-2 text-sm">
            <span className="flex min-w-0 items-start gap-2">
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
              <span className={item.muted ? 'text-ink-muted' : 'text-ink'}>{item.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
              {!item.muted && total > 0 && (
                <span className="text-xs text-ink-faint">{Math.round((item.amount / total) * 100)}%</span>
              )}
              <span className="font-semibold text-ink">{formatINR(item.amount)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function FlowList({ sources, outflows }) {
  return (
    <div className="flex flex-col gap-6">
      <Side title="Money in" items={sources} />
      <Side title="Where it went" items={outflows} />
    </div>
  );
}
