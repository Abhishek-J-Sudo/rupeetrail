import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { LightTrail, TrailIcon } from '@/components/brand/Route';
import { cn } from '@/lib/utils';
import { goToSection } from '@/app/report/sections';

// The white panel every page is built from.
export function Card({ as: Tag = 'section', className, children, ...props }) {
  return (
    <Tag
      className={cn('flex min-w-0 flex-col gap-3.5 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5', className)}
      {...props}
    >
      {children}
    </Tag>
  );
}

// Card title (optionally with a trail icon and a one-line subtitle) on the left, a link or
// pill on the right. `band` puts it on a tinted strip across the top of the card with a light
// dashed trail (the card needs overflow-hidden so the strip follows its rounded corners).
export function CardHeader({ band = false, ...props }) {
  if (!band) return <HeaderRow {...props} />;
  return (
    <div className="relative -mx-4 -mt-4 overflow-hidden border-b border-line bg-surface-2 px-4 py-4 sm:-mx-5 sm:-mt-5 sm:px-5">
      <LightTrail className={props.children ? 'right-28' : 'right-0'} />
      <div className="relative">
        <HeaderRow {...props} band />
      </div>
    </div>
  );
}

function HeaderRow({ title, subtitle, icon, id, band = false, children }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <TrailIcon icon={icon} />}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={id} className="font-display text-lg font-semibold leading-tight text-ink">
            {title}
          </h2>
          {subtitle && <p className="truncate text-[13px] text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {/* On the band, the slot takes the band's colour so the trail tucks behind a long pill */}
      {children && (
        <div className={cn('flex shrink-0 items-center pt-0.5', band && 'rounded-control bg-surface-2 pl-3')}>{children}</div>
      )}
    </div>
  );
}

// "All budgets →" style link to the full detail: another screen (`to`) or a section of the
// report further down the page (`section`, scrolled to smoothly).
export function CardLink({ to, section, children }) {
  const className =
    'group inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-accent transition-colors duration-fast hover:text-accent-hover';
  const arrow = (
    <ArrowRight
      className="size-3.5 transition-transform duration-fast ease-out group-hover:translate-x-0.5"
      strokeWidth={2}
      aria-hidden="true"
    />
  );
  if (section)
    return (
      <button type="button" onClick={() => goToSection(section)} className={className}>
        {children}
        {arrow}
      </button>
    );
  return (
    <Link to={to} className={className}>
      {children}
      {arrow}
    </Link>
  );
}
