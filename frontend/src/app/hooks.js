import { createContext, useContext } from 'react';

// Context objects and their hooks live here, apart from the provider components,
// so React Fast Refresh keeps working in DataContext.jsx, PeriodContext.jsx and PrefsContext.jsx.
export const DataContext = createContext(null);
export const PeriodContext = createContext(null);
export const PrefsContext = createContext(null);
export const InsightContext = createContext(null);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error('usePeriod must be used inside PeriodProvider');
  return ctx;
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider');
  return ctx;
}

export function useInsight() {
  const ctx = useContext(InsightContext);
  if (!ctx) throw new Error('useInsight must be used inside InsightProvider');
  return ctx;
}
