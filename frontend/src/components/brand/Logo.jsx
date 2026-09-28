import { cn } from '@/lib/utils';

// The RupeeTrail mark plus wordmark. `onDark` uses the lighter mark made for the sidebar.
export default function Logo({ onDark = false, showWordmark = true, className }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <img src={onDark ? '/logo-on-dark.svg' : '/logo.svg'} alt="" className="size-7 shrink-0" />
      {showWordmark ? (
        <span
          className={cn(
            'font-display text-xl font-bold tracking-tight',
            onDark ? 'text-sidebar-ink' : 'text-ink'
          )}
        >
          RupeeTrail
        </span>
      ) : (
        <span className="sr-only">RupeeTrail</span>
      )}
    </span>
  );
}
