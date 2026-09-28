import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CategoryTag from '@/components/kit/CategoryTag';
import Pill from '@/components/kit/Pill';
import { useData, useInsight } from '@/app/hooks';
import { formatINR } from '@/lib/money';
import { aiErrorMessage, applyPayees, dismissPayees, getPayeeReview, previewPayees, suggestPayees } from '@/services/api';
import { cn } from '@/lib/utils';

// "Review payees with AI" (Transactions): one AI pass suggests a category and a clean name for
// every business payee; you tick what to accept. Suggestions are saved, so reopening costs
// nothing, and payees already reviewed aren't sent again. People you pay are never sent.

const OUTLINE =
  'inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-accent transition-colors duration-fast hover:border-accent hover:bg-accent-soft disabled:opacity-60';
const PRIMARY =
  'inline-flex items-center gap-1.5 rounded-control bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60';
const TEXT_BUTTON = 'text-[13px] font-semibold text-accent hover:text-accent-hover disabled:opacity-60';
const CONFIDENCE = { high: 'good', medium: 'warn', low: 'neutral' };

const count = (n) => n.toLocaleString('en-IN');

// Ticked by default: every rename, and category changes the AI is sure about
const defaultTicks = (rows) =>
  Object.fromEntries(
    rows.map((r) => [r.name, { name: Boolean(r.suggested_name), category: Boolean(r.suggested_category) && r.confidence === 'high' }])
  );

export function ReviewPayeesButton() {
  const { status } = useInsight();
  const [open, setOpen] = useState(false);
  if (!status?.configured) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={OUTLINE}>
        <Sparkles className="size-3.5" strokeWidth={2} aria-hidden="true" />
        Review payees with AI
      </button>
      <Dialog open={open} onOpenChange={setOpen}>{open && <ReviewBody onClose={() => setOpen(false)} />}</Dialog>
    </>
  );
}

function Change({ checked, onChange, label, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 shrink-0 accent-accent" />
      <span className="w-16 shrink-0 text-ink-faint">{label}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</span>
    </label>
  );
}

function ReviewBody({ onClose }) {
  const { refreshAll } = useData();
  const { status } = useInsight();
  const [review, setReview] = useState(null);
  const [ticks, setTicks] = useState({});
  const [busy, setBusy] = useState(null); // 'suggest' | 'apply' | 'dismiss'
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [sent, setSent] = useState(null);
  const [showSent, setShowSent] = useState(false);

  const load = (next) => {
    setReview(next);
    setTicks(defaultTicks(next.rows));
  };

  useEffect(() => {
    getPayeeReview()
      .then(load)
      .catch((err) => setError(aiErrorMessage(err)));
  }, []);

  const picked = useMemo(
    () =>
      (review?.rows ?? [])
        .map((r) => ({ row: r, tick: ticks[r.name] ?? {} }))
        .filter(({ tick }) => tick.name || tick.category),
    [review, ticks]
  );

  const run = async (onlyNew) => {
    setBusy('suggest');
    setError(null);
    setDone(null);
    try {
      load(await suggestPayees(onlyNew));
    } catch (err) {
      setError(aiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    setBusy('apply');
    setError(null);
    try {
      const res = await applyPayees(
        picked.map(({ row, tick }) => ({
          name: row.name,
          merchants: row.merchants,
          category: tick.category ? row.suggested_category : null,
          display_name: tick.name ? row.suggested_name : null,
        }))
      );
      setDone(`Renamed ${count(res.named)} ${res.named === 1 ? 'payee' : 'payees'}, moved ${count(res.updated)} ${res.updated === 1 ? 'payment' : 'payments'} to a new category.`);
      load(await getPayeeReview());
      refreshAll();
    } catch (err) {
      setError(aiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const keep = async (names) => {
    setBusy('dismiss');
    try {
      await dismissPayees(names);
      load(await getPayeeReview());
    } catch (err) {
      setError(aiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const toggleSent = async () => {
    if (!sent) setSent(await previewPayees(true).catch(() => null));
    setShowSent((v) => !v);
  };

  const setTick = (name, key, value) => setTicks((current) => ({ ...current, [name]: { ...current[name], [key]: value } }));
  const local = status?.provider === 'ollama';

  return (
    <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
      <DialogHeader>
        <DialogTitle className="text-ink">Review payees with AI</DialogTitle>
        <DialogDescription className="text-ink-muted">
          A category and a clean name for each business payee, in one pass. You choose what to accept; payments you
          changed one by one are never touched.
        </DialogDescription>
      </DialogHeader>

      {!review && !error && <p className="text-sm text-ink-muted">Loading…</p>}

      {review && (
        <div className="flex min-h-0 flex-col gap-4">
          {/* What's left to ask about, and where it goes */}
          {busy === 'suggest' ? (
            <p role="status" className="flex items-center gap-2 text-[13px] text-ink-muted">
              <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />
              Reviewing payees… {local ? 'a local model takes a few seconds per 60 payees.' : 'usually under a minute.'}
            </p>
          ) : (
            review.pending > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-2 px-4 py-3">
                <p className="max-w-lg text-[13px] text-ink-muted">
                  <span className="font-semibold text-ink">{count(review.pending)} payees not reviewed yet.</span>{' '}
                  {local
                    ? 'Runs on your computer with Ollama.'
                    : 'Sends their business names, current category, number of payments and average amount to your AI provider.'}{' '}
                  {review.skipped_personal.count > 0 &&
                    `${count(review.skipped_personal.count)} payments to people are left out.`}
                </p>
                <button type="button" onClick={() => run(true)} disabled={busy !== null} className={PRIMARY}>
                  <Sparkles className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  Review {count(review.pending)} payees
                </button>
              </div>
            )
          )}

          {error && (
            <p role="alert" className="text-[13px] text-bad">
              {error}
            </p>
          )}
          {done && (
            <p role="status" className="text-[13px] font-semibold text-good">
              {done}
            </p>
          )}

          {review.rows.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-muted">
                <span>
                  {count(review.rows.length)} {review.rows.length === 1 ? 'payee' : 'payees'} with suggested changes
                  {review.unchanged > 0 && ` · ${count(review.unchanged)} already look right`}
                </span>
                <span className="flex gap-4">
                  <button type="button" onClick={() => setTicks(defaultTicks(review.rows))} className={TEXT_BUTTON}>
                    Names + sure categories
                  </button>
                  <button type="button" onClick={() => setTicks({})} className={TEXT_BUTTON}>
                    Untick all
                  </button>
                </span>
              </div>
              <ul className="-mx-1 flex min-h-0 flex-col divide-y divide-line overflow-y-auto px-1">
                {review.rows.map((r) => {
                  const tick = ticks[r.name] ?? {};
                  return (
                    <li key={r.name} className="flex flex-col gap-2 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-semibold text-ink">{r.display_name || r.name}</span>
                        <span className="flex shrink-0 items-center gap-3 text-xs text-ink-faint">
                          {count(r.count)} {r.count === 1 ? 'payment' : 'payments'} · {formatINR(r.total)}
                          <button type="button" onClick={() => keep([r.name])} disabled={busy !== null} className={TEXT_BUTTON}>
                            Keep as is
                          </button>
                        </span>
                      </div>
                      {r.suggested_name && (
                        <Change checked={Boolean(tick.name)} onChange={(v) => setTick(r.name, 'name', v)} label="Name">
                          <span className="text-ink-muted">{r.display_name || r.name}</span>
                          <ArrowRight className="size-3.5 text-ink-faint" aria-hidden="true" />
                          <span className="font-semibold">{r.suggested_name}</span>
                        </Change>
                      )}
                      {r.suggested_category && (
                        <Change checked={Boolean(tick.category)} onChange={(v) => setTick(r.name, 'category', v)} label="Category">
                          <CategoryTag category={r.category} className="text-ink-muted" />
                          <ArrowRight className="size-3.5 text-ink-faint" aria-hidden="true" />
                          <CategoryTag category={r.suggested_category} />
                          <Pill tone={CONFIDENCE[r.confidence] ?? 'neutral'} className="ml-1">
                            {r.confidence}
                          </Pill>
                        </Change>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            review.pending === 0 &&
            busy !== 'suggest' && (
              <p className="text-sm text-ink-muted">
                All {count(review.payees)} business payees are reviewed and nothing is waiting.
              </p>
            )
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <span className="flex flex-wrap items-center gap-4">
              <button type="button" onClick={toggleSent} className={cn(TEXT_BUTTON, 'inline-flex items-center gap-1 text-xs')}>
                {showSent ? 'Hide' : 'Show'} exactly what gets sent
                <ChevronDown className={cn('size-3 transition-transform duration-fast', showSent && 'rotate-180')} aria-hidden="true" />
              </button>
              {review.pending === 0 && (
                <button type="button" onClick={() => run(false)} disabled={busy !== null} className={cn(TEXT_BUTTON, 'text-xs')}>
                  Review all {count(review.payees)} again
                </button>
              )}
            </span>
            <span className="flex items-center gap-3">
              <button type="button" onClick={onClose} className="rounded-control px-3.5 py-2 text-[13px] font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink">
                Close
              </button>
              {review.rows.length > 0 && (
                <button type="button" onClick={apply} disabled={busy !== null || picked.length === 0} className={PRIMARY}>
                  {busy === 'apply' ? 'Applying…' : `Apply ${count(picked.length)} ${picked.length === 1 ? 'payee' : 'payees'}`}
                </button>
              )}
            </span>
          </div>
          {showSent && (
            <pre className="max-h-60 overflow-auto rounded-control bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-ink-muted">
              {sent ? JSON.stringify(sent, null, 2) : 'Couldn’t load it.'}
            </pre>
          )}
        </div>
      )}
    </DialogContent>
  );
}
