import { Suspense, lazy, useEffect, useRef } from 'react';
import { TrailMark } from '@/components/brand/Route';
import { LoadingState } from '@/app/StateViews';
import { usePeriod, usePrefs } from '@/app/hooks';
import SectionRail from '@/app/report/SectionRail';
import ReportMobileBar from '@/app/report/ReportMobileBar';
import { SECTIONS } from '@/app/report/sections';
import { useActiveSection } from '@/app/report/useActiveSection';

const OverviewSection = lazy(() => import('@/sections/OverviewSection'));
const CashFlowSection = lazy(() => import('@/sections/CashFlowSection'));
const SpendingSection = lazy(() => import('@/sections/SpendingSection'));
const BudgetsSection = lazy(() => import('@/sections/BudgetsSection'));
const TransactionsSection = lazy(() => import('@/sections/TransactionsSection'));

const IDS = SECTIONS.map((s) => s.id);

// Adds rt-shown the first time the element scrolls into view, so it rises into place once
// (rt-reveal in index.css; nothing hides or moves under reduced motion).
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.add('rt-shown');
        observer.disconnect();
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

// One section of the report
function Section({ id, title, subtitle, children }) {
  const ref = useReveal();
  return (
    <section
      ref={ref}
      id={id}
      aria-labelledby={`${id}-title`}
      className="rt-reveal flex scroll-mt-[calc(var(--header-h)+20px)] flex-col gap-4"
    >
      <div className="rt-live flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-title`} className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink">
            {title}
          </h2>
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <TrailMark />
            {subtitle}
          </p>
        </div>
      </div>
      <Suspense fallback={<LoadingState />}>{children}</Suspense>
    </section>
  );
}

// The home screen: every period-based view in one scroll. The period is picked once in the
// header; the rail (wide screens) and bottom bar (phones) jump between sections.
export default function ReportPage() {
  const { label, periodTransactions } = usePeriod();
  const { railSide } = usePrefs();
  const active = useActiveSection(IDS);
  const count = periodTransactions.length.toLocaleString('en-IN');

  // Arriving at /#spending (or from an old /spending link) lands on that section
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return undefined;
    const timer = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 350);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <div className="flex flex-col gap-16">
        <Section id="overview" title="Overview" subtitle={`${label} · ${count} transactions`}>
          <OverviewSection />
        </Section>
        <Section id="cash-flow" title="Cash flow" subtitle="Money in and out over the period, and the profit and loss">
          <CashFlowSection />
        </Section>
        <Section id="spending" title="Spending" subtitle="What changed, and one category up close">
          <SpendingSection />
        </Section>
        <Section id="budgets" title="Budgets" subtitle="Each category against its monthly limit, and the savings target">
          <BudgetsSection />
        </Section>
        <Section id="transactions" title="Transactions" subtitle="Every line from your statements, searchable">
          <TransactionsSection />
        </Section>
      </div>
      <SectionRail active={active} side={railSide} />
      <ReportMobileBar active={active} />
    </>
  );
}
