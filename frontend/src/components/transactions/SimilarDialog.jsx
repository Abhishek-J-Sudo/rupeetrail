import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CategoryTag from '@/components/kit/CategoryTag';
import { formatTxnAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { payeeName } from '@/lib/payee';

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });

// After a category change: offer the same change for this merchant's other payments.
// Everything starts ticked. `offer` = { merchant, category, items } or null.
export default function SimilarDialog({ offer, onApply, onClose }) {
  return (
    <Dialog open={Boolean(offer)} onOpenChange={(open) => !open && onClose()}>
      {offer && <SimilarBody key={offer.items.map((t) => t.id).join()} offer={offer} onApply={onApply} onClose={onClose} />}
    </Dialog>
  );
}

function SimilarBody({ offer, onApply, onClose }) {
  const { merchant, category, items } = offer;
  const [picked, setPicked] = useState(() => new Set(items.map((t) => t.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const allPicked = picked.size === items.length;

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await onApply([...picked], category);
      onClose();
    } catch {
      setError('Couldn’t update them. Please try again.');
      setBusy(false);
    }
  };

  return (
    <DialogContent className="flex max-w-xl flex-col">
      <DialogHeader>
        <DialogTitle className="text-ink">
          Change {items.length} more from {merchant}?
        </DialogTitle>
        <DialogDescription className="text-ink-muted">
          These payments to the same merchant would also move to <CategoryTag category={category} className="align-middle text-sm text-ink" />.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between text-[13px]">
        <button
          type="button"
          onClick={() => setPicked(allPicked ? new Set() : new Set(items.map((t) => t.id)))}
          className="font-semibold text-accent hover:text-accent-hover"
        >
          {allPicked ? 'Untick all' : 'Tick all'}
        </button>
        <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-ink-faint">{picked.size} ticked</span>
      </div>

      <ul className="-mx-1 max-h-[45vh] divide-y divide-line overflow-y-auto">
        {items.map((t) => (
          <li key={t.id}>
            <label
              className={cn(
                'grid cursor-pointer grid-cols-[1.25rem_4.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-control px-1 py-2.5 transition-colors duration-fast hover:bg-surface-2',
                !picked.has(t.id) && 'opacity-60'
              )}
            >
              <input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} className="size-4 accent-accent" />
              <span className="font-mono text-xs text-ink-faint">{shortDate(t.date)}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-ink">{payeeName(t)}</span>
                <CategoryTag category={t.category || 'Other'} className="text-[11px]" />
              </span>
              <span className="text-right text-sm font-semibold tabular-nums text-ink">{formatTxnAmount(t)}</span>
            </label>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-control border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors duration-fast hover:bg-surface-2"
        >
          Just this one
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={busy || picked.size === 0}
          className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Updating…' : `Change ${picked.size}`}
        </button>
      </div>
    </DialogContent>
  );
}
