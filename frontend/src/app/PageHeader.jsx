import { TrailMark } from '@/components/brand/Route';

// Title and subtitle for the screens outside the report (Recurring, AI insights, Settings).
// The report's period picker lives in the app header; these screens don't follow the period.
export default function PageHeader({ title, subtitle, children }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {subtitle && (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <TrailMark />
            {subtitle}
          </p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </header>
  );
}
