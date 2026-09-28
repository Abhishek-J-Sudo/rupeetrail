import { cn } from '@/lib/utils';

// The brand's trail line: a vertical route with a stop per item, joined by a dashed line.
// Open stops are still ahead; filled stops need attention.
export function TrailList({ className, children, ...props }) {
  return (
    <ol className={cn('flex flex-col', className)} {...props}>
      {children}
    </ol>
  );
}

const STOPS = {
  open: 'border-accent bg-surface',
  filled: 'border-accent bg-accent',
  warn: 'border-warn bg-warn',
};

export function TrailStop({ stop = 'open', className, children }) {
  return (
    <li className={cn('group relative grid grid-cols-[12px_minmax(0,1fr)] gap-3 pb-3.5 last:pb-0', className)}>
      <span
        className="absolute -bottom-1 left-[5px] top-[18px] border-l-[1.5px] border-dashed border-line-strong group-last:hidden"
        aria-hidden="true"
      />
      <span className={cn('mt-[5px] size-3 rounded-full border-2', STOPS[stop])} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </li>
  );
}
