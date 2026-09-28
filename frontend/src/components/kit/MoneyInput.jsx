import { useState } from 'react';
import { cn } from '@/lib/utils';

const grouped = (n) => (n === null ? '' : n.toLocaleString('en-IN'));

// A whole-rupee amount. Plain digits while typing, Indian grouping (₹1,34,340) once the field
// is left, so the caret never jumps. `value` is a number or null (empty field).
export default function MoneyInput({ value, onChange, className, ...props }) {
  const [editing, setEditing] = useState(null);

  return (
    <span
      className={cn(
        'flex items-center rounded-control border border-line bg-surface px-3 transition-colors duration-fast focus-within:border-accent',
        className
      )}
    >
      <span className="text-sm text-ink-faint" aria-hidden="true">
        ₹
      </span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={editing ?? grouped(value)}
        onFocus={() => setEditing(value === null ? '' : String(value))}
        onBlur={() => setEditing(null)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
          setEditing(digits);
          onChange(digits === '' ? null : Number(digits));
        }}
        className="w-full min-w-0 bg-transparent py-2 pl-1.5 text-right text-sm tabular-nums text-ink outline-none placeholder:text-ink-faint"
        {...props}
      />
    </span>
  );
}
