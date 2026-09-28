import { AlertTriangle, FileUp } from 'lucide-react';

export function LoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-4">
      <div className="h-9 w-56 animate-pulse rounded-control bg-track" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-card bg-track" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-card bg-track" />
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-card border border-bad/30 bg-bad-soft p-5 text-ink">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" strokeWidth={1.8} aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <p className="font-semibold">Couldn't load your transactions</p>
        <p className="text-sm text-ink-muted">
          {message}. Check that the backend is running (start.py starts both).
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="self-start rounded-control border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:border-line-strong"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
