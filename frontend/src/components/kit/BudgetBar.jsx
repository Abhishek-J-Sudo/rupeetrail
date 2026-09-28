import { motion } from 'motion/react';
import { MAX_OVER } from '@/lib/finance';
import { countUp } from '@/theme/motion';
import { cn } from '@/lib/utils';

// Limit-tick bar: every bar in a list shares one scale (budgetScale()), the limit is a tick,
// teal up to it (amber at 95–100%), and only the part past the limit is red, so "how far over"
// is visible at a glance. `row` comes from budgetStatus().

export default function BudgetBar({ row, scale, index = 0, delay = 0, className }) {
  const used = Math.min(row.used, MAX_OVER);
  const within = Math.min(used, 1);
  const total = (used / scale) * 100;

  return (
    <div className={cn('relative h-2 rounded-full bg-track', className)} aria-hidden="true">
      {used > 0 && (
        <motion.div
          className="absolute inset-y-0 left-0 flex origin-left overflow-hidden rounded-full"
          style={{ width: `${total}%` }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ ...countUp, delay: index * delay }}
        >
          <span className={cn('h-full', row.state === 'at' ? 'bg-warn' : 'bg-accent')} style={{ width: `${(within / used) * 100}%` }} />
          {used > 1 && <span className="h-full flex-1 bg-bad" />}
        </motion.div>
      )}
      <span className="absolute -inset-y-1 w-px bg-ink/40" style={{ left: `${100 / scale}%` }} />
    </div>
  );
}
