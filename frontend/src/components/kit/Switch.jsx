import { motion } from 'motion/react';
import { springFast } from '@/theme/motion';
import { cn } from '@/lib/utils';

// On/off switch with a title and one line of explanation.
export default function Switch({ checked, onChange, title, hint, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-control py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
    >
      <span className="flex flex-col">
        <span className="text-sm font-medium text-ink">{title}</span>
        {hint && <span className="text-xs text-ink-faint">{hint}</span>}
      </span>
      <span
        className={cn(
          'flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors duration-fast',
          checked ? 'justify-end bg-accent' : 'justify-start bg-track ring-1 ring-inset ring-line-strong'
        )}
      >
        <motion.span layout transition={springFast} className="size-5 rounded-full bg-surface shadow-card" />
      </span>
    </button>
  );
}
