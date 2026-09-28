import { useMemo, useState } from 'react';
import { getThemeChoice, setThemeChoice } from '@/theme/theme';
import { PrefsContext } from './hooks';

// Per-computer display preferences, saved in localStorage like the period mode.
// railSide: which edge the report's section rail sits on. (Key kept from the old sidebar setting.)
const SIDE_KEY = 'rt-sidebar-side';

function readSide() {
  try {
    return localStorage.getItem(SIDE_KEY) === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
}

export function PrefsProvider({ children }) {
  const [railSide, setSideState] = useState(readSide);
  const [theme, setThemeState] = useState(getThemeChoice);

  const value = useMemo(
    () => ({
      railSide,
      setRailSide: (next) => {
        setSideState(next);
        try {
          localStorage.setItem(SIDE_KEY, next);
        } catch {
          // Storage blocked: the choice still applies for this session
        }
      },
      theme,
      setTheme: (next) => setThemeState(setThemeChoice(next)),
    }),
    [railSide, theme]
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}
