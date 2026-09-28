// Light / dark / system switching. The choice lives in localStorage; "system" removes
// data-theme so tokens.css follows the OS. index.html runs the same logic inline
// before first paint to avoid a flash of the wrong theme.

const KEY = 'rt-theme';
const CHOICES = ['light', 'dark', 'system'];
// Follow the computer's light / dark setting until the user picks one
const DEFAULT_CHOICE = 'system';

export function getThemeChoice() {
  try {
    const stored = localStorage.getItem(KEY);
    return CHOICES.includes(stored) ? stored : DEFAULT_CHOICE;
  } catch {
    return DEFAULT_CHOICE;
  }
}

// Saves the choice; AppLayout applies it.
export function setThemeChoice(choice) {
  const value = CHOICES.includes(choice) ? choice : DEFAULT_CHOICE;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Private mode or blocked storage: the choice still applies for this session.
  }
  return value;
}

export function applyTheme(choice = getThemeChoice()) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

// Resolved theme right now, for code that needs concrete colours (e.g. chart libraries).
export function isDark() {
  const choice = getThemeChoice();
  if (choice !== 'system') return choice === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Reads a token as a CSS colour string, e.g. readToken('accent') -> "rgb(31 111 120)".
// Recharts and canvas need concrete values; re-read after the theme changes.
export function readToken(name) {
  const channels = getComputedStyle(document.documentElement).getPropertyValue(`--rt-${name}`).trim();
  return channels ? `rgb(${channels})` : undefined;
}
