import { useId } from 'react';
import { motion } from 'motion/react';
import { spring } from '@/theme/motion';
import { cn } from '@/lib/utils';

// Small segmented control (e.g. Light / Dark / System). The selected segment's background
// slides between options. `onDark` is for the sidebar; `iconOnly` hides labels visually
// but keeps them for screen readers and as a tooltip.
export default function Segmented({ label, options, value, onChange, onDark = false, iconOnly = false, className }) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex gap-0.5 rounded-control p-[3px]',
        onDark ? 'bg-sidebar-account ring-1 ring-sidebar-account-line' : 'bg-surface-2 ring-1 ring-line',
        className
      )}
    >
      {options.map(({ value: v, label: optionLabel, icon: Icon }) => {
        const selected = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            title={iconOnly ? optionLabel : undefined}
            onClick={() => onChange(v)}
            className={cn(
              'relative flex flex-1 items-center justify-center gap-1.5 rounded-[6px] text-[13px] font-medium outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-accent',
              iconOnly ? 'h-8 min-w-9 px-2.5' : 'px-3 py-1.5',
              onDark
                ? selected
                  ? 'text-sidebar-active-ink'
                  : 'text-sidebar-muted hover:text-sidebar-ink'
                : selected
                  ? 'text-ink'
                  : 'text-ink-muted hover:text-ink'
            )}
          >
            {selected && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={spring}
                className={cn('absolute inset-0 rounded-[inherit]', onDark ? 'bg-sidebar-active' : 'bg-surface shadow-card')}
              />
            )}
            {Icon && <Icon className="relative size-3.5" strokeWidth={1.9} aria-hidden="true" />}
            <span className={cn('relative', iconOnly && 'sr-only')}>{optionLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
