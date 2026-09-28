import { useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Ellipsis } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ThemeSwitch from '@/app/ThemeSwitch';
import { cn } from '@/lib/utils';
import { SCREENS, SECTIONS, goToSection } from './sections';

const tabClass = (on) =>
  cn(
    'flex min-w-14 flex-col items-center gap-1 py-1 text-[11px] font-semibold transition-colors duration-fast',
    on ? 'text-accent' : 'text-ink-faint'
  );

// Phone: the bottom bar jumps between report sections (from another screen it goes back to the
// report first); "More" has the rest. Rendered into <body> so page transitions can't move it.
export default function ReportMobileBar({ active }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const jump = (id) => (pathname === '/' ? goToSection(id) : navigate(`/#${id}`));
  const tabs = SECTIONS.filter((s) => s.mobile);
  const rest = SECTIONS.filter((s) => !s.mobile);

  return createPortal(
    <>
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line bg-surface/95 px-1.5 pb-3 pt-2.5 backdrop-blur-md lg:hidden"
      >
        {tabs.map(({ id, label, shortLabel, icon: Icon }) => (
          <button key={id} type="button" onClick={() => jump(id)} className={tabClass(active === id)}>
            <Icon className="size-[21px]" strokeWidth={1.8} aria-hidden="true" />
            {shortLabel || label}
          </button>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} className={tabClass(rest.some((s) => s.id === active))}>
          <Ellipsis className="size-[21px]" strokeWidth={1.8} aria-hidden="true" />
          More
        </button>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>More</DialogTitle>
            <DialogDescription className="sr-only">Other sections, screens and theme</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1">
            {rest.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    jump(id);
                  }}
                  className="flex w-full items-center gap-3 rounded-control px-3 py-3 text-sm font-medium text-ink hover:bg-surface-2"
                >
                  <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
                  {label}
                </button>
              </li>
            ))}
            {SCREENS.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-control px-3 py-3 text-sm font-medium text-ink hover:bg-surface-2">
                  <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-line px-3 pt-3">
            <span className="text-sm font-medium text-ink">Theme</span>
            <ThemeSwitch iconOnly />
          </div>
        </DialogContent>
      </Dialog>
    </>,
    document.body
  );
}
