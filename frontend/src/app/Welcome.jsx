import { useState } from 'react';
import { FileUp, FlaskConical, Loader2, Route as RouteIcon, X } from 'lucide-react';
import { DashedTrail } from '@/components/brand/Route';
import { Card, CardHeader } from '@/components/kit/Card';
import { TrailList, TrailStop } from '@/components/kit/Trail';
import { useData } from './hooks';
import { Dropzone } from './UploadDialog';
import { StorageFacts } from './StorageNote';
import { useStorage } from './useStorage';

const STEPS = [
  {
    title: 'Download your statement',
    text: 'In HDFC NetBanking, open your account statement, pick the months you want and download it as Excel or PDF. Or download your statement from the Google Pay app (PDF).',
  },
  {
    title: 'Import it here',
    text: 'Drop the file in. It’s read on your computer, and by default the file is deleted once its transactions are saved.',
  },
  {
    title: 'See where your money went',
    text: 'Every month in one report: money in and out, spending by category, budgets, and your regular payments.',
  },
];

const OUTLINE_BUTTON =
  'inline-flex items-center justify-center gap-2 self-start rounded-control border border-line bg-surface px-4 py-2.5 text-[13px] font-semibold text-accent transition-colors duration-fast hover:border-accent hover:bg-accent-soft disabled:opacity-60';

// First screen when there are no transactions: what RupeeTrail does, how to get a statement
// in, and a way to look around with made-up data first.
export default function Welcome({ onFile }) {
  const { trySample } = useData();
  const { info } = useStorage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sample = async () => {
    setBusy(true);
    setError(null);
    try {
      await trySample();
    } catch {
      setError('Couldn’t set up the sample data. Is the app still running?');
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* The one dark moment on this screen */}
      <section className="relative overflow-hidden rounded-card bg-sidebar px-6 py-9 text-sidebar-ink md:px-10 md:py-12">
        <DashedTrail className="rt-ambient hidden md:block" />
        <div className="relative flex max-w-2xl flex-col gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-sidebar-muted">Welcome to RupeeTrail</p>
          <h1 className="font-display text-[32px] font-semibold leading-[1.1] tracking-tight md:text-[42px]">
            See where your money went.
          </h1>
          <p className="text-[15px] leading-relaxed text-sidebar-muted">
            Import your HDFC bank statement or your Google Pay statement and get a clear report, month by month: what came
            in, where it went, what repeats, and how you’re doing against your budgets. It all runs on your computer. No bank login, no account, nothing
            uploaded.
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card aria-labelledby="welcome-import" className="overflow-hidden">
          <CardHeader band id="welcome-import" icon={FileUp} title="Import your first statement" subtitle="HDFC (PDF or Excel) · Google Pay (PDF)" />
          <Dropzone onFile={onFile} className="flex-1 justify-center py-14" />
          <StorageFacts info={info} />
        </Card>

        <div className="flex flex-col gap-4">
          <Card aria-labelledby="welcome-steps" className="overflow-hidden">
            <CardHeader band id="welcome-steps" icon={RouteIcon} title="How it works" subtitle="Three steps, a few minutes" />
            <TrailList>
              {STEPS.map((step, i) => (
                <TrailStop key={step.title} stop={i === STEPS.length - 1 ? 'filled' : 'open'}>
                  <p className="text-sm font-semibold text-ink">{step.title}</p>
                  <p className="text-[13px] leading-relaxed text-ink-muted">{step.text}</p>
                </TrailStop>
              ))}
            </TrailList>
          </Card>

          <Card aria-labelledby="welcome-sample" className="overflow-hidden">
            <CardHeader band id="welcome-sample" icon={FlaskConical} title="Not ready yet?" subtitle="Look around with made-up data first" />
            <p className="text-[13px] leading-relaxed text-ink-muted">
              Six months of a made-up person’s account, so you can see every part of the report. It’s kept apart from your own
              data and cleared with one click, or as soon as you import a statement.
            </p>
            <button type="button" onClick={sample} disabled={busy} className={OUTLINE_BUTTON}>
              {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {busy ? 'Setting up…' : 'Try with sample data'}
            </button>
            {error && (
              <p role="alert" className="text-[13px] text-bad">
                {error}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// Strip above every screen while the sample is showing
export function SampleBanner({ onImport }) {
  const { endSample } = useData();
  const [busy, setBusy] = useState(false);

  const clear = async () => {
    setBusy(true);
    try {
      await endSample();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-accent/30 bg-accent-soft px-4 py-3"
    >
      <FlaskConical className="size-4 shrink-0 text-accent" strokeWidth={1.8} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[13px] text-ink">
        <span className="font-semibold">You’re looking at sample data.</span>{' '}
        <span className="text-ink-muted">A made-up person’s six months, kept apart from your own data. Importing your statement clears it.</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onImport}
          className="rounded-control bg-cta px-3.5 py-2 text-[13px] font-semibold text-cta-fg transition-colors duration-fast hover:bg-cta-hover"
        >
          Import your statement
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-control px-3 py-2 text-[13px] font-semibold text-accent transition-colors duration-fast hover:bg-surface disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <X className="size-3.5" strokeWidth={2} aria-hidden="true" />}
          Clear sample data
        </button>
      </div>
    </div>
  );
}
