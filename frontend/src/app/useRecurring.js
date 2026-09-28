import { useEffect, useState } from 'react';
import { getRecurring } from '@/services/api';
import { useData } from './hooks';

// Recurring payments detected across all history (ignores the period). Refetches after uploads/edits.
export function useRecurring() {
  const { dataVersion } = useData();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getRecurring()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch(() => !cancelled && setError('Could not detect recurring payments'));
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  return { data, error };
}
