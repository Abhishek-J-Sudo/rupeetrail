import { useMemo, useState } from 'react';
import { PeriodContext, useData } from './hooks';
import { makeInPeriod, periodLabel, previousPeriod } from './period';

// The period chosen in the top bar (Month / 3 months / Year / All + a month), shared by all pages.
const KEY = 'rt-period-mode';

function readMode() {
  try {
    const stored = localStorage.getItem(KEY);
    return ['month', '3m', 'year', 'all'].includes(stored) ? stored : 'month';
  } catch {
    return 'month';
  }
}

export function PeriodProvider({ children }) {
  const { transactions } = useData();
  const [mode, setModeState] = useState(readMode);
  const [chosenAnchor, setAnchor] = useState(null);

  // Months that have data, newest first
  const months = useMemo(
    () => [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort().reverse(),
    [transactions]
  );

  // Default to the latest month with data; drop a choice that no longer has data
  const anchor = chosenAnchor && months.includes(chosenAnchor) ? chosenAnchor : months[0] || null;

  const setMode = (next) => {
    setModeState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the choice still applies for this session
    }
  };

  const value = useMemo(() => {
    const inPeriod = makeInPeriod(mode, anchor);
    const prev = previousPeriod(mode, anchor, months);
    return {
      mode,
      setMode,
      anchor,
      setAnchor,
      months,
      inPeriod,
      label: periodLabel(mode, anchor),
      periodTransactions: transactions.filter((t) => inPeriod(t.date)),
      // The period before this one ({ label, transactions }), or null for all time
      previous: prev && {
        label: prev.label,
        transactions: transactions.filter((t) => prev.inPeriod(t.date)),
      },
    };
  }, [mode, anchor, months, transactions]);

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

