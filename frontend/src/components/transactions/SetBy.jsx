import { Sparkles, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { categorySource } from '@/lib/transactions';

// Who set a transaction's category (backend category_source). Rules are the default,
// so only your own choices and the AI's get a mark.
const SOURCES = {
  rule: { label: 'Set by the rules' },
  manual: { label: 'Set by you', icon: UserRound, className: 'text-ink-faint' },
  ai: { label: 'Set by AI', icon: Sparkles, className: 'text-accent' },
};

// Small icon beside the category tag in the list
export function SetByMark({ t, className }) {
  const source = SOURCES[categorySource(t)];
  if (!source.icon) return null;
  const Icon = source.icon;
  return (
    <span title={source.label} className={cn('inline-flex shrink-0', source.className, className)}>
      <Icon className="size-3" strokeWidth={2} aria-hidden="true" />
      <span className="sr-only">{source.label}</span>
    </span>
  );
}

// Full line for the transaction dialog
export function SetByLine({ t }) {
  const source = SOURCES[categorySource(t)];
  const Icon = source.icon;
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-muted">
      {Icon && <Icon className={cn('size-3.5', source.className)} strokeWidth={2} aria-hidden="true" />}
      {source.label}
    </span>
  );
}
