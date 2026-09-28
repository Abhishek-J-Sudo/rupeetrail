import animate from 'tailwindcss-animate';
import { CATEGORY_SLUGS } from './src/theme/categorySlugs.js';

// Every colour points at a CSS variable in src/theme/tokens.css, so themes switch
// without touching components. <alpha-value> keeps opacity modifiers working (bg-accent/15).
const token = (name) => `rgb(var(--rt-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: { DEFAULT: token('surface'), 2: token('surface-2') },
        track: token('track'),
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        ink: { DEFAULT: token('ink'), muted: token('ink-muted'), faint: token('ink-faint') },
        accent: { DEFAULT: token('accent'), hover: token('accent-hover'), soft: token('accent-soft'), fg: token('accent-fg') },
        cta: { DEFAULT: token('cta'), hover: token('cta-hover'), fg: token('cta-fg') },
        good: { DEFAULT: token('good'), soft: token('good-soft') },
        warn: { DEFAULT: token('warn'), soft: token('warn-soft') },
        bad: { DEFAULT: token('bad'), soft: token('bad-soft') },
        sidebar: {
          DEFAULT: token('sidebar'),
          ink: token('sidebar-ink'),
          muted: token('sidebar-muted'),
          active: token('sidebar-active'),
          'active-ink': token('sidebar-active-ink'),
          account: token('sidebar-account'),
          'account-line': token('sidebar-account-line'),
        },
        cat: Object.fromEntries(CATEGORY_SLUGS.map((slug) => [slug, token(`cat-${slug}`)])),

        // shadcn/ui's colour names, pointed at our tokens so components added with
        // `npx shadcn add` come out on-brand. Use these only inside src/components/ui;
        // everywhere else use the token names above.
        background: token('bg'),
        foreground: token('ink'),
        card: { DEFAULT: token('surface'), foreground: token('ink') },
        popover: { DEFAULT: token('surface'), foreground: token('ink') },
        primary: { DEFAULT: token('accent'), foreground: token('accent-fg') },
        secondary: { DEFAULT: token('surface-2'), foreground: token('ink') },
        muted: { DEFAULT: token('surface-2'), foreground: token('ink-muted') },
        destructive: { DEFAULT: token('bad'), foreground: token('accent-fg') },
        border: token('line'),
        input: token('line-strong'),
        ring: token('accent'),
      },
      borderColor: { DEFAULT: token('line') },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'Consolas', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: 'var(--rt-radius)',
        control: 'var(--rt-radius-sm)',
      },
      boxShadow: {
        card: 'var(--rt-shadow-card)',
        pop: 'var(--rt-shadow-pop)',
        header: 'var(--rt-shadow-header)',
        band: 'var(--rt-shadow-band)',
        lift: 'var(--rt-shadow-lift)',
      },
      transitionTimingFunction: {
        out: 'var(--rt-ease-out)',
        spring: 'var(--rt-ease-spring)',
      },
      transitionDuration: {
        fast: 'var(--rt-dur-fast)',
        base: 'var(--rt-dur-base)',
        slow: 'var(--rt-dur-slow)',
      },
    },
  },
  plugins: [animate],
};
