import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose, DialogHeader } from '@/components/ui/dialog';
import { clearDatabase } from '@/services/api';
import { useData } from './hooks';

const WORD = 'DELETE';

// Deleting every transaction can't be undone and makes no backup, so it takes two steps:
// open this dialog, then type DELETE to enable the button.
export default function ClearDataDialog({ keepStatements = false }) {
  const { refreshAll } = useData();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const onOpenChange = (next) => {
    if (busy) return;
    setOpen(next);
    setTyped('');
    setError(null);
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await clearDatabase();
      setDone(res.count ?? 0);
      setOpen(false);
      setTyped('');
      refreshAll();
    } catch (err) {
      setError(err.response?.data?.detail || 'Couldn’t delete the transactions. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setDone(null);
            onOpenChange(true);
          }}
          className="inline-flex items-center gap-2 rounded-control border border-bad/40 px-3 py-2 text-[13px] font-semibold text-bad transition-colors duration-fast hover:bg-bad-soft"
        >
          <Trash2 className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Delete all transactions
        </button>
        {done !== null && (
          <span role="status" className="text-[13px] text-ink-muted">
            Deleted {done.toLocaleString('en-IN')} transactions.
          </span>
        )}
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <span className="mb-1 flex size-10 items-center justify-center rounded-[10px] bg-bad-soft text-bad">
              <AlertTriangle className="size-5" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <DialogTitle className="text-ink">Delete all transactions?</DialogTitle>
            <DialogDescription className="text-ink-muted">
              Every imported transaction is removed from your computer.{' '}
              {keepStatements
                ? 'The statement copies you chose to keep stay, so you can import them again.'
                : 'To get them back you’ll need to import your statements again.'}
            </DialogDescription>
          </DialogHeader>

          <p className="flex items-start gap-2 rounded-control border border-bad/30 bg-bad-soft px-3 py-2.5 text-sm font-medium text-bad">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
            Clearing has no backup and deletes every transaction, including manual category edits. It can’t be undone.
          </p>

          <label className="flex flex-col gap-1.5 text-sm text-ink">
            <span>
              Type <span className="font-mono font-semibold">{WORD}</span> to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="rounded-control border border-line bg-surface px-3 py-2 font-mono text-sm text-ink outline-none transition-colors duration-fast focus:border-bad"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <DialogClose className="rounded-control border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors duration-fast hover:bg-surface-2">
              Cancel
            </DialogClose>
            <button
              type="button"
              onClick={clear}
              disabled={typed.trim() !== WORD || busy}
              className="rounded-control bg-bad px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity duration-fast disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Deleting…' : 'Delete everything'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
