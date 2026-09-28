import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { InsightContext, useData, usePeriod } from './hooks';
import { periodKey } from './period';
import { aiErrorMessage, generateAIInsights, getAIStatus, previewAIInsights } from '@/services/api';

// The AI summary of the chosen period, shared by Overview (the brief card) and the AI insights
// page (the full analysis). Nothing is sent to the AI until generate() is called; a saved
// summary is shown for free.
export function InsightProvider({ children }) {
  const { transactions } = useData();
  const { mode, anchor } = usePeriod();
  const period = periodKey(mode, anchor);
  const { pathname } = useLocation();
  const [status, setStatus] = useState(null); // { configured, provider, model }
  const [byPeriod, setByPeriod] = useState({}); // period -> saved insight or null
  const [payloads, setPayloads] = useState({}); // period -> exactly what would be sent
  const [savedPeriods, setSavedPeriods] = useState([]); // periods that have a summary
  const [busy, setBusy] = useState(null); // the period being written
  const [error, setError] = useState(null); // { period, text }

  // Re-read on every screen change, so a provider chosen in Settings shows up straight away
  useEffect(() => {
    getAIStatus()
      .then((next) =>
        setStatus((current) =>
          current && current.configured === next.configured && current.provider === next.provider && current.model === next.model
            ? current
            : next
        )
      )
      .catch(() => setStatus((current) => current ?? { configured: false }));
  }, [pathname]);

  // The saved summary for this period, re-checked when transactions change (it may be out of date)
  useEffect(() => {
    if (!status?.configured) return undefined;
    let cancelled = false;
    previewAIInsights(period)
      .then((res) => {
        if (cancelled) return;
        setByPeriod((current) => ({ ...current, [period]: res.cached }));
        setPayloads((current) => ({ ...current, [period]: res.payload }));
        setSavedPeriods(res.saved_periods ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, period, transactions]);

  const generate = useCallback(async () => {
    setBusy(period);
    setError(null);
    try {
      const res = await generateAIInsights(period);
      setByPeriod((current) => ({ ...current, [period]: res.cached }));
      setSavedPeriods((current) => [period, ...current.filter((p) => p !== period)]);
    } catch (err) {
      setError({ period, text: aiErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  }, [period]);

  const value = useMemo(
    () => ({
      status,
      period,
      insight: byPeriod[period], // undefined = still loading, null = none yet
      payload: payloads[period],
      savedPeriods: savedPeriods.filter((p) => p !== period),
      writing: busy === period,
      error: error?.period === period ? error.text : null,
      generate,
    }),
    [status, byPeriod, payloads, savedPeriods, period, busy, error, generate]
  );
  return <InsightContext.Provider value={value}>{children}</InsightContext.Provider>;
}
