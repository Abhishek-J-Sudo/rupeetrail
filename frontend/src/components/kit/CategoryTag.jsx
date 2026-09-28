import { categoryBg } from '@/theme/categories';
import { cn } from '@/lib/utils';

// Category name with its colour dot. The dot carries the colour; the text stays readable ink.
export default function CategoryTag({ category, className }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-xs text-ink-muted', className)}>
      <span className={cn('size-2 shrink-0 rounded-full', categoryBg(category))} aria-hidden="true" />
      <span className="truncate">{category}</span>
    </span>
  );
}
