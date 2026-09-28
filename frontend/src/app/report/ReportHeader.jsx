import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { Upload } from 'lucide-react';
import PeriodBar from '@/app/PeriodBar';
import ThemeMenu from '@/app/ThemeMenu';
import { pressable, spring } from '@/theme/motion';
import { cn } from '@/lib/utils';
import { REPORT, SCREENS } from './sections';

// Fixed header. The brand (logo, name, tagline) spans both rows on the left. Row 1: the
// screens beside the brand, and on the right only actions (theme menu, settings, import).
// Row 2 (the report only): the period. Once the page scrolls, row 1 folds away and the full
// brand sits beside the period line.
// Its unfolded height is published as --header-h so the page and section anchors sit below it.
// `railSide`: which side the report's section rail is on (null elsewhere), so the edges match.
const SETTINGS = SCREENS.find((s) => s.to === '/settings');
const NAV = [REPORT, ...SCREENS.filter((s) => s !== SETTINGS)];

const navLink = ({ isActive }) =>
  cn(
    'flex items-center gap-2 rounded-control px-2.5 py-2 text-[13px] font-medium transition-colors duration-fast',
    isActive ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
  );

export default function ReportHeader({ onUpload, period = true, railSide = null }) {
  const [folded, setFolded] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onScroll = () => setFolded(period && window.scrollY > 48);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [period]);

  // Page padding follows the unfolded height, so folding never shifts the content
  useLayoutEffect(() => {
    const el = ref.current;
    const set = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(() => !folded && set());
    ro.observe(el);
    return () => ro.disconnect();
  }, [folded]);

  const home = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <header
      ref={ref}
      className={cn(
        'fixed inset-x-0 top-0 z-40 border-b border-line bg-surface/90 shadow-header backdrop-blur-md'
      )}
    >
      {/* Same side padding and width as the page content, so the edges line up with the cards */}
      <div className={cn('px-4 md:px-8', railSide === 'right' && 'lg:pr-24', railSide === 'left' && 'lg:pl-24')}>
        <div className="mx-auto grid max-w-[1440px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-6">
          <Link
            to="/"
            onClick={home}
            className={cn('flex shrink-0 items-center gap-3 self-center py-2', period && 'md:row-span-2')}
          >
            <img src="/logo.svg" alt="" className="size-9 shrink-0 md:size-10" />
            <span className="flex flex-col whitespace-nowrap">
              <span className="font-display text-xl font-bold leading-tight tracking-tight text-ink md:text-2xl">RupeeTrail</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">Local. Private. Yours.</span>
            </span>
            <span className="sr-only">, back to the report</span>
          </Link>

          <motion.div
            initial={false}
            animate={{ height: folded ? 0 : 'auto', opacity: folded ? 0 : 1 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="flex h-16 items-center gap-1">
              <nav aria-label="Screens" className="hidden items-center gap-1 border-l border-line pl-5 md:flex">
                {NAV.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} end className={navLink}>
                    <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
                    {label}
                  </NavLink>
                ))}
              </nav>

              <div className="ml-auto flex items-center gap-1">
                <div className="hidden sm:block">
                  <ThemeMenu />
                </div>
                <NavLink
                  to={SETTINGS.to}
                  title={SETTINGS.label}
                  className={({ isActive }) =>
                    cn(
                      'hidden size-9 items-center justify-center rounded-control transition-colors duration-fast md:flex',
                      isActive ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                    )
                  }
                >
                  <SETTINGS.icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
                  <span className="sr-only">{SETTINGS.label}</span>
                </NavLink>
                <motion.button
                  type="button"
                  onClick={onUpload}
                  {...pressable}
                  className="ml-2 flex shrink-0 items-center gap-2 rounded-control bg-cta px-3 py-2 text-[13px] font-semibold text-cta-fg transition-colors duration-fast hover:bg-cta-hover"
                >
                  <Upload className="size-4" strokeWidth={2} aria-hidden="true" />
                  <span className="hidden sm:inline">Import statement</span>
                  <span className="sr-only sm:hidden">Import statement</span>
                </motion.button>
              </div>
            </div>
          </motion.div>

          {period && (
            <div
              className={cn(
                'col-span-2 min-w-0 border-t py-2 transition-colors duration-base md:col-span-1 md:col-start-2',
                folded ? 'border-transparent md:py-3' : 'border-line/70'
              )}
            >
              <PeriodBar compact />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
