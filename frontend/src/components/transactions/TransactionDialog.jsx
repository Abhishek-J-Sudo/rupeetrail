import { useState } from 'react';
import { ReceiptText, Tag, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { TrailIcon } from '@/components/brand/Route';
import Pill from '@/components/kit/Pill';
import Select from '@/components/kit/Select';
import Switch from '@/components/kit/Switch';
import { formatINR, formatTxnAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { payeeName } from '@/lib/payee';
import { SetByLine } from '@/components/transactions/SetBy';

const longDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

function Fact({ label, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  );
}

// One transaction in full: category, flags, and the line exactly as the bank printed it.
// The page does the saving (onCategory / onExclude / onSavings return promises) and passes
// the refreshed transaction back in.
export default function TransactionDialog({ transaction: t, categories, onClose, onCategory, onExclude, onSavings }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.response?.data?.detail || 'Couldn’t save that change. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const excluded = t?.is_excluded === 1;
  const savings = t?.is_savings_transfer === 1;
  const isCredit = t?.txn_type === 'credit';

  return (
    <Dialog open={Boolean(t)} onOpenChange={(open) => !open && onClose()}>
      {t && (
        <DialogContent hideClose className="max-w-lg gap-0 overflow-hidden p-0">
          <div className="relative overflow-hidden border-b border-line bg-surface-2 px-5 py-4">
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <TrailIcon icon={ReceiptText} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <DialogTitle className="truncate leading-tight text-ink">{payeeName(t)}</DialogTitle>
                  <DialogDescription className="text-[13px] text-ink-muted">
                    {longDate(t.date)} · {isCredit ? 'Money in' : 'Money out'}
                  </DialogDescription>
                </div>
              </div>
              <DialogClose className="-mr-1.5 rounded-control p-1.5 text-ink-muted transition-colors duration-fast hover:bg-surface hover:text-ink">
                <X className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>
          </div>

          <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <span
                className={cn(
                  'font-display text-[32px] font-semibold leading-none tracking-tight tabular-nums',
                  isCredit ? 'text-good' : 'text-ink',
                  excluded && 'text-ink-faint line-through decoration-1'
                )}
              >
                {formatTxnAmount(t)}
              </span>
              {excluded && <Pill tone="neutral">Left out of totals</Pill>}
              {savings && <Pill tone="accent">Counted as savings</Pill>}
            </div>

            <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
              <div className="col-span-2 sm:col-span-1">
                <Fact label="Category">
                  <Select
                    label="Category"
                    icon={Tag}
                    value={t.category || 'Other'}
                    onChange={(c) => run(() => onCategory(t, c))}
                    options={categories.map((c) => ({ value: c, label: c }))}
                    className="w-full"
                  />
                  <span className="mt-1.5 block">
                    <SetByLine t={t} />
                  </span>
                </Fact>
              </div>
              {t.balance != null && <Fact label="Balance after">{formatINR(t.balance, { paise: t.balance % 1 !== 0 })}</Fact>}
              {t.ref_no && (
                <Fact label="Reference">
                  <span className="break-all font-mono text-[13px]">{t.ref_no}</span>
                </Fact>
              )}
            </dl>

            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint">From your statement</span>
              <p className="max-h-28 select-all overflow-y-auto break-all rounded-control border border-line bg-surface-2 px-3 py-2.5 font-mono text-xs leading-relaxed text-ink-muted">
                {t.narration}
              </p>
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-4">
              {!isCredit && (
                <Switch
                  checked={savings}
                  disabled={busy}
                  onChange={(v) => run(() => onSavings(t, v))}
                  title="Count as savings"
                  hint="Moves it from spending to saved, e.g. a SIP or a transfer to your savings"
                />
              )}
              <Switch
                checked={excluded}
                disabled={busy}
                onChange={(v) => run(() => onExclude([t], v))}
                title="Leave out of totals"
                hint="For moves between your own accounts, refunds that cancel out, or mistakes"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-bad">
                {error}
              </p>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
