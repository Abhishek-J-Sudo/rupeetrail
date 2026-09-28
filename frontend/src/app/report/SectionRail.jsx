import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { spring } from '@/theme/motion';
import { cn } from '@/lib/utils';
import { SECTIONS, goToSection } from './sections';

// Floating section list for wide screens: the brand trail running down the edge, one stop per
// section. The current section's stop fills teal; hovering a stop shows its name.
// Rendered into <body>: the page transition's transform would otherwise break `fixed`.
export default function SectionRail({ active, side = 'right' }) {
  const right = side === 'right';
  return createPortal(
    <nav
      aria-label="Sections"
      className={cn('fixed top-1/2 z-30 hidden -translate-y-1/2 lg:block', right ? 'right-5' : 'left-5')}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-5 left-1/2 -translate-x-1/2 border-l border-dashed border-accent/40"
      />
      <ul className="relative flex flex-col items-center gap-3.5">
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const current = id === active;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => goToSection(id)}
                aria-label={label}
                aria-current={current ? 'location' : undefined}
                className={cn(
                  'group relative flex size-10 items-center justify-center rounded-full bg-surface shadow-card ring-1 ring-line outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-accent',
                  current ? 'text-accent-fg' : 'text-ink-muted hover:text-accent'
                )}
              >
                {current && (
                  <motion.span layoutId="rail-stop" transition={spring} className="absolute inset-0 rounded-full bg-accent" />
                )}
                <Icon className="relative size-[18px]" strokeWidth={1.8} aria-hidden="true" />
                <span
                  className={cn(
                    'pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-control bg-sidebar px-2.5 py-1 text-xs font-semibold text-sidebar-ink opacity-0 shadow-pop transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100',
                    right ? 'right-full mr-3' : 'left-full ml-3'
                  )}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
        <li aria-hidden="true" className="pt-0.5">
          <span className="block size-2.5 rounded-full bg-cta" />
        </li>
      </ul>
    </nav>,
    document.body
  );
}
