import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataContext } from './hooks';
import { clearSample, getBudgets, getSample, getTransactions, saveBudgets, startSample } from '@/services/api';

const NO_BUDGETS = { limits: {}, savings_target: null };

// All non-excluded transactions and the budgets, loaded once and shared by every page, and
// whether they're the made-up sample (its own database on the backend).
export function DataProvider({ children }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [budgets, setBudgets] = useState(NO_BUDGETS);
  const [sample, setSample] = useState(false);
  // Bumps when data changes outside the transaction table, so the table refetches its own copy
  const [dataVersion, setDataVersion] = useState(0);

  const refresh = useCallback(async () => {
    setError(null);
    // Without budgets or the sample flag the pages still work: none set, own data
    getBudgets()
      .then(setBudgets)
      .catch(() => {});
    getSample()
      .then((s) => setSample(Boolean(s.active)))
      .catch(() => {});
    try {
      const data = await getTransactions({ limit: 50000, include_excluded: false });
      setTransactions(data);
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Replaces every budget; throws if the backend refuses, so the editor can say so
  const updateBudgets = useCallback(async (next) => {
    const saved = await saveBudgets(next);
    setBudgets(saved);
    return saved;
  }, []);

  const updateOne = useCallback((updated) => {
    setTransactions((prev) => prev.map((t) => (t.id === updated.id ? { ...updated } : t)));
  }, []);

  const refreshAll = useCallback(async () => {
    await refresh();
    setDataVersion((v) => v + 1);
  }, [refresh]);

  // Switching between the sample and the user's own data reloads everything
  const trySample = useCallback(async () => {
    await startSample();
    await refreshAll();
  }, [refreshAll]);
  const endSample = useCallback(async () => {
    await clearSample();
    await refreshAll();
  }, [refreshAll]);

  const value = useMemo(
    () => ({ transactions, loading, error, dataVersion, refresh, refreshAll, updateOne, budgets, updateBudgets, sample, trySample, endSample }),
    [transactions, loading, error, dataVersion, refresh, refreshAll, updateOne, budgets, updateBudgets, sample, trySample, endSample]
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

