import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// Dropdown in the app's style (Radix Select: keyboard, typeahead and screen readers built in).
// `options` = [{ value, label, dot? }] where `dot` is a colour class such as a category's
// bg-cat-*. `label` is read out but not shown. Values must be non-empty strings.
export default function Select({ label, value, onChange, options, icon: Icon, className }) {
  const current = options.find((o) => o.value === value);
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        aria-label={label}
        className={cn(
          'group relative inline-flex min-w-0 items-center gap-2 rounded-control border border-line bg-surface py-2 pl-3 pr-8 text-left text-[13px] font-medium text-ink outline-none transition-colors duration-fast hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 data-[state=open]:border-accent',
          className
        )}
      >
        {Icon && <Icon className="size-4 shrink-0 text-ink-muted" strokeWidth={1.8} aria-hidden="true" />}
        {current?.dot && <span className={cn('size-2 shrink-0 rounded-full', current.dot)} aria-hidden="true" />}
        <span className="truncate">
          <SelectPrimitive.Value>{current?.label}</SelectPrimitive.Value>
        </span>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 size-4 text-ink-muted transition-transform duration-fast group-data-[state=open]:rotate-180"
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'relative z-[60] min-w-[max(var(--radix-select-trigger-width),10rem)] max-w-[min(20rem,calc(100vw-24px))] overflow-hidden rounded-control border border-line bg-surface text-ink shadow-pop',
            'max-h-[min(22rem,var(--radix-select-content-available-height))]',
            'duration-fast data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1'
          )}
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-ink-muted">
            <ChevronUp className="size-4" strokeWidth={1.8} aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-[6px] py-2 pl-2.5 pr-8 text-[13px] text-ink-muted outline-none transition-colors duration-fast data-[highlighted]:bg-accent-soft data-[highlighted]:text-ink data-[state=checked]:font-semibold data-[state=checked]:text-ink"
              >
                {o.dot && <span className={cn('size-2 shrink-0 rounded-full', o.dot)} aria-hidden="true" />}
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2.5 inline-flex">
                  <Check className="size-3.5 text-accent" strokeWidth={2.2} aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-ink-muted">
            <ChevronDown className="size-4" strokeWidth={1.8} aria-hidden="true" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
