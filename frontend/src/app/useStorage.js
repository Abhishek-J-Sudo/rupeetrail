import { useCallback, useEffect, useState } from 'react';
import { getStorageSettings, setKeepStatements } from '@/services/api';

// The data folder on this computer and the "keep statement files" setting, from the backend.
export function useStorage() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getStorageSettings()
      .then((result) => !cancelled && setInfo(result))
      .catch(() => !cancelled && setError('Could not read the storage settings'));
    return () => {
      cancelled = true;
    };
  }, []);

  const setKeep = useCallback(async (keep) => {
    setInfo((current) => current && { ...current, keep_statements: keep });
    try {
      setInfo(await setKeepStatements(keep));
      setError(null);
    } catch {
      setInfo((current) => current && { ...current, keep_statements: !keep });
      setError('Could not save the setting');
    }
  }, []);

  return { info, error, setKeep };
}
