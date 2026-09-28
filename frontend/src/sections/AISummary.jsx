import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, Lightbulb, Loader2, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { CurveCorner } from '@/components/brand/Route';
import { Card, CardHeader, CardLink } from '@/components/kit/Card';
import Pill from '@/components/kit/Pill';
import Select from '@/components/kit/Select';
import { useData, useInsight, usePeriod } from '@/app/hooks';
import { fromPeriodKey, periodLabel } from '@/app/period';
import { formatINR } from '@/lib/money';
import { aiErrorMessage, previewAIInsights } from '@/services/api';
import { categoryBg } from '@/theme/categories';
import { cn } from '@/lib/utils';

// The AI summary of the period (decided 28 Sep, session 6): a brief card on Overview (headline,
// summary, the top ways to save) and the full analysis on the AI insights page (going well /
// watch out, every way to save with one-click budgets, earlier versions, what gets sent). One
// saved summary per period (InsightContext); the AI only runs on "Write summary".

const NOTE_KEY = 'rt-ai-note-hidden';
const BRIEF = 3; // ways to save shown on Overview
const HEAD = 'font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint';
const OUTLINE =
  'inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-accent transition-colors duration-fast hover:border-accent hover:bg-accent-soft disabled:opacity-60';
const PRIMARY =
  'inline-flex items-center gap-1.5 rounded-control bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-fg transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60';
const TEXT_BUTTON = 'inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:text-accent-hover';

const isLocal = (status) => status?.provider === 'ollama';

// Where the data goes, said plainly next to the button that sends it
const sendsTo = (status) =>
  isLocal(status) ? 'It runs on your computer with Ollama.' : 'It sends this period’s totals and business names to your AI provider.';

// SQLite CURRENT_TIMESTAMP is UTC without a zone marker
const toDate = (ts) => new Date(`${ts.replace(' ', 'T')}Z`);
const writtenOn = (ts) => toDate(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const writtenAt = (ts) =>
  toDate(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const totalSaving = (advice) => advice.reduce((sum, a) => sum + (a.estimated_monthly_saving || 0), 0);

function readHidden() {
  try {
    return localStorage.getItem(NOTE_KEY) === '1';
  } catch {
    return false;
  }
}

// ---------- shared pieces ----------

// No provider set up: one quiet line on Overview, dismissible
function SetupNote() {
  const [hidden, setHidden] = useState(readHidden);
  if (hidden) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(NOTE_KEY, '1');
    } catch {
      // private window: it just comes back next time
    }
  };
  return (
    <div className="flex items-center gap-3 rounded-card border border-dashed border-line px-4 py-3 text-[13px] text-ink-muted">
      <Sparkles className="size-4 shrink-0 text-accent" strokeWidth={1.8} aria-hidden="true" />
      <p className="min-w-0 flex-1">
        Add your own AI key for a short written summary of each period, with ways to save.{' '}
        <Link to="/settings" className="font-semibold text-accent hover:text-accent-hover">
          Set up AI
        </Link>
      </p>
      <button
        type="button"
        onClick={hide}
        aria-label="Hide this note"
        className="rounded-control p-1 text-ink-faint transition-colors duration-fast hover:bg-surface-2 hover:text-ink"
      >
        <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
}

function Writing({ status }) {
  return (
    <p role="status" className="flex items-center gap-2 text-[13px] text-ink-muted">
      <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />
      Writing the summary… {isLocal(status) ? 'a local model can take a minute or two.' : 'this usually takes 10–30 seconds.'}
    </p>
  );
}

function ErrorLine() {
  const { error } = useInsight();
  if (!error) return null;
  return (
    <p role="alert" className="text-[13px] text-bad">
      {error}
    </p>
  );
}

// Update / Rewrite, with the "out of date" tag when the transactions changed since
function RewriteButton({ insight }) {
  const { status, generate } = useInsight();
  return (
    <span className="flex items-center gap-3">
      {insight.stale && (
        <Pill tone="warn" className="hidden sm:inline-flex">
          Out of date
        </Pill>
      )}
      <button type="button" onClick={generate} className={OUTLINE} title={sendsTo(status)}>
        <RefreshCw className="size-3.5" strokeWidth={2} aria-hidden="true" />
        {insight.stale ? 'Update' : 'Rewrite'}
      </button>
    </span>
  );
}

// Summaries are saved per period: say which other periods already have one, a click away
function OtherPeriods() {
  const { savedPeriods } = useInsight();
  const { months, setMode, setAnchor } = usePeriod();
  const targets = savedPeriods.map((key) => ({ key, to: fromPeriodKey(key, months) })).filter((p) => p.to);
  if (!targets.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
      Already written:
      {targets.map(({ key, to }) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            setMode(to.mode);
            setAnchor(to.anchor);
          }}
          className={TEXT_BUTTON}
        >
          {periodLabel(to.mode, to.anchor)}
        </button>
      ))}
    </p>
  );
}

// No summary for this period yet: what it is, where the data goes, the button
function WritePrompt() {
  const { status, generate } = useInsight();
  const { label } = usePeriod();
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="max-w-2xl text-sm text-ink-muted">
        A short written read of {label}: what went well, what to watch, and ways to save. {sendsTo(status)}
      </p>
      <button type="button" onClick={generate} className={PRIMARY}>
        <Sparkles className="size-3.5" strokeWidth={2} aria-hidden="true" />
        Write summary
      </button>
      <OtherPeriods />
    </div>
  );
}

function Headline({ result, large = false }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className={cn('font-display font-semibold leading-snug text-ink', large ? 'text-2xl' : 'text-xl')}>{result.headline}</h3>
      <p className="max-w-4xl text-sm leading-relaxed text-ink-muted">{result.summary}</p>
    </div>
  );
}

// ---------- Overview: the brief card ----------

export function AIBriefCard() {
  const { status, insight, writing } = useInsight();
  const { label } = usePeriod();

  if (!status) return null;
  if (!status.configured) return <SetupNote />;
  if (insight === undefined) return null; // still checking for a saved summary

  const result = writing ? null : insight?.result;
  const advice = result?.advice ?? [];
  const saving = totalSaving(advice);

  return (
    <Card aria-labelledby="ai-summary-title" className="relative overflow-hidden">
      <CurveCorner className="stroke-accent/35" />
      <CardHeader
        band
        id="ai-summary-title"
        title="AI summary"
        icon={Sparkles}
        subtitle={insight ? `${label} · ${insight.model} · written ${writtenOn(insight.created_at)}` : `${label} · not written yet`}
      >
        {insight && !writing && <RewriteButton insight={insight} />}
      </CardHeader>

      {writing && <Writing status={status} />}
      {!writing && !result && <WritePrompt />}
      <ErrorLine />

      {result && (
        <>
          <Headline result={result} />
          {advice.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-line pt-3.5">
              <p className={HEAD}>Ways to save{saving > 0 && ` · up to ${formatINR(saving)} a month`}</p>
              <ul className="flex flex-col">
                {advice.slice(0, BRIEF).map((item, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                    <span className="min-w-0 text-ink">{item.title}</span>
                    {item.estimated_monthly_saving > 0 && (
                      <span className="shrink-0 whitespace-nowrap text-[13px]">
                        <span className="font-semibold tabular-nums text-good">{formatINR(item.estimated_monthly_saving)}</span>
                        <span className="text-ink-faint"> a month</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="pt-1">
            <CardLink to="/ai">
              Read the full analysis{advice.length > BRIEF ? ` (${advice.length} ways to save)` : ''}
            </CardLink>
          </div>
        </>
      )}
    </Card>
  );
}

// ---------- AI insights page: the full analysis ----------

// Going well / watch out: short lists with a coloured stop per line
function Points({ title, tone, items }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className={HEAD}>{title}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink">
            <span className={cn('mt-[7px] size-1.5 shrink-0 rounded-full', tone)} aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SetBudget({ item }) {
  const { budgets, updateBudgets } = useData();
  const [state, setState] = useState(null); // 'saving' | 'error'
  const current = budgets.limits[item.category];
  const amount = item.suggested_monthly_budget;

  if (current === amount)
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-ink-muted">
        <Check className="size-3.5 text-good" strokeWidth={2} aria-hidden="true" />
        {item.category} budget is {formatINR(amount)} a month
      </span>
    );

  const set = async () => {
    setState('saving');
    try {
      await updateBudgets({ limits: { ...budgets.limits, [item.category]: amount }, savings_target: budgets.savings_target });
      setState(null);
    } catch {
      setState('error');
    }
  };

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={set} disabled={state === 'saving'} className={OUTLINE}>
        <span className={cn('size-2 shrink-0 rounded-full', categoryBg(item.category))} aria-hidden="true" />
        Set {item.category} budget to {formatINR(amount)}
      </button>
      <span className="text-xs text-ink-faint">
        {current ? `Now ${formatINR(current)}` : 'No budget yet'}
        {state === 'error' && <span className="text-bad"> · Couldn’t save</span>}
      </span>
    </span>
  );
}

function WaysToSaveCard({ advice }) {
  if (!advice.length) return null;
  const saving = totalSaving(advice);
  return (
    <Card aria-labelledby="ways-title" className="overflow-hidden">
      <CardHeader
        band
        id="ways-title"
        title="Ways to save"
        icon={Lightbulb}
        subtitle={`${advice.length} ${advice.length === 1 ? 'idea' : 'ideas'}${saving > 0 ? ` · up to ${formatINR(saving)} a month` : ''}`}
      />
      <ol className="-mt-1 flex flex-col divide-y divide-line/60">
        {advice.map((item, i) => (
          <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 py-3.5 sm:grid-cols-[1.5rem_minmax(0,1fr)_auto] sm:gap-x-4">
            <span className="pt-px font-mono text-[13px] text-ink-faint">{i + 1}</span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm font-semibold text-ink">{item.title}</p>
              <p className="text-[13px] leading-relaxed text-ink-muted">{item.detail}</p>
              {item.category && item.suggested_monthly_budget && (
                <div className="mt-1.5">
                  <SetBudget item={item} />
                </div>
              )}
            </div>
            {item.estimated_monthly_saving > 0 && (
              <p className="col-start-2 whitespace-nowrap text-[13px] sm:col-start-auto sm:text-right">
                <span className="font-semibold tabular-nums text-good">{formatINR(item.estimated_monthly_saving)}</span>
                <span className="text-ink-faint"> a month</span>
              </p>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

// Earlier versions, the disclaimer, and exactly what gets sent
function AboutCard({ insight, shown, onVersion, payload }) {
  const { status } = useInsight();
  const [open, setOpen] = useState(false);
  const versions = insight?.versions ?? [];

  return (
    <Card aria-labelledby="about-ai-title" className="overflow-hidden">
      <CardHeader band id="about-ai-title" title="About this analysis" icon={ShieldCheck} subtitle="What the AI saw, and how far to trust it" />
      <ul className="flex flex-col gap-2 text-[13px] text-ink-muted">
        <li>Written by AI from your totals: it can be wrong, so check the numbers before acting on them.</li>
        <li>
          {isLocal(status)
            ? 'Your AI runs on your computer with Ollama: nothing leaves it.'
            : 'Totals and business names go to your own account with your AI provider, so they can link them to you. Never account numbers, balances or the names of people you pay.'}{' '}
          <Link to="/settings" className="font-semibold text-accent hover:text-accent-hover">
            What they see
          </Link>
        </li>
      </ul>

      {versions.length > 1 && (
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-muted">
          <span>Version</span>
          <Select
            label="Version of this summary"
            value={String(shown.id)}
            onChange={(id) => onVersion(Number(id))}
            options={versions.map((v, i) => ({
              value: String(v.id),
              label: `${writtenAt(v.created_at)}${i === 0 ? ' (latest)' : ''}`,
            }))}
          />
          {!shown.is_latest && (
            <button type="button" onClick={() => onVersion(null)} className={TEXT_BUTTON}>
              Back to latest
            </button>
          )}
        </div>
      )}

      {payload && (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={cn(TEXT_BUTTON, 'self-start')}>
            {open ? 'Hide' : 'Show'} exactly what gets sent
            <ChevronDown className={cn('size-3.5 transition-transform duration-fast', open && 'rotate-180')} strokeWidth={2} aria-hidden="true" />
          </button>
          {open && (
            <pre className="max-h-96 overflow-auto rounded-control bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-ink-muted">
              {JSON.stringify(payload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </Card>
  );
}

// An earlier version of this period's summary, when one is picked
function useVersion(period) {
  const [chosen, setChosen] = useState(null); // { period, id }
  const [version, setVersion] = useState(null); // { id, cached } | { id, error }
  const id = chosen?.period === period ? chosen.id : null;

  useEffect(() => {
    if (id === null) return undefined;
    let cancelled = false;
    previewAIInsights(period, id)
      .then((res) => !cancelled && setVersion({ id, cached: res.cached }))
      .catch((err) => !cancelled && setVersion({ id, error: aiErrorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [period, id]);

  const current = id !== null && version?.id === id ? version : null;
  return { cached: current?.cached ?? null, error: current?.error ?? null, pick: (next) => setChosen(next === null ? null : { period, id: next }) };
}

export function AIAnalysis() {
  const { status, insight, payload, period, writing } = useInsight();
  const { label } = usePeriod();
  const version = useVersion(period);

  if (!status || (status.configured && insight === undefined)) return <p className="text-sm text-ink-muted">Loading…</p>;

  if (!status.configured)
    return (
      <Card aria-labelledby="ai-off-title" className="relative overflow-hidden">
        <CurveCorner className="stroke-accent/35" />
        <CardHeader band id="ai-off-title" title="AI is off" icon={Sparkles} subtitle="Everything else in RupeeTrail works without it" />
        <p className="max-w-2xl text-sm text-ink-muted">
          With your own key (DeepSeek, OpenAI or Anthropic), or Ollama running on your computer, the AI writes a short read of
          each period: what went well, what to watch, and ways to save, with one-click budgets.
        </p>
        <div>
          <Link to="/settings" className={PRIMARY}>
            <Sparkles className="size-3.5" strokeWidth={2} aria-hidden="true" />
            Set up AI
          </Link>
        </div>
      </Card>
    );

  const shown = version.cached ?? insight;
  const result = writing ? null : shown?.result;

  return (
    <div className="flex flex-col gap-4">
      <Card aria-labelledby="ai-summary-title" className="relative overflow-hidden">
        <CurveCorner className="stroke-accent/35" />
        <CardHeader
          band
          id="ai-summary-title"
          title={label}
          icon={Sparkles}
          subtitle={shown ? `${shown.model} · written ${writtenAt(shown.created_at)}` : 'Not written yet'}
        >
          {insight && !writing && <RewriteButton insight={insight} />}
        </CardHeader>
        {writing && <Writing status={status} />}
        {!writing && !result && <WritePrompt />}
        <ErrorLine />
        {version.error && (
          <p role="alert" className="text-[13px] text-bad">
            {version.error}
          </p>
        )}
        {result && (
          <>
            <Headline result={result} large />
            {(result.wins.length > 0 || result.concerns.length > 0) && (
              <div className="grid gap-x-8 gap-y-4 border-t border-line pt-4 sm:grid-cols-2">
                <Points title="Going well" tone="bg-good" items={result.wins} />
                <Points title="Watch out" tone="bg-warn" items={result.concerns} />
              </div>
            )}
            <OtherPeriods />
          </>
        )}
      </Card>

      {result && <WaysToSaveCard advice={result.advice} />}

      <AboutCard insight={insight} shown={shown} onVersion={version.pick} payload={payload} />
    </div>
  );
}
