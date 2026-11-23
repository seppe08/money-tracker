import { useCallback, useEffect, useState } from 'react';

import {
  errorMessage,
  fetchRecurringTransactions,
  processRecurringRequest,
  type RecurringProcessResult,
  type RecurringTransaction,
} from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

export function useRecurringTransactions(isActive?: boolean) {
  const { authedRequest } = useAuth();
  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const result = await fetchRecurringTransactions(isActive, authedRequest);
      setItems(result);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [authedRequest, isActive]);

  useEffect(() => {
    let active = true;

    fetchRecurringTransactions(isActive, authedRequest)
      .then((result) => {
        if (!active) return;
        setItems(result);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(errorMessage(cause));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authedRequest, isActive, reloadKey]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
    await loadData();
  }, [loadData]);

  const processDue = useCallback(async (): Promise<RecurringProcessResult> => {
    const res = await processRecurringRequest(undefined, authedRequest);
    await reload();
    return res;
  }, [authedRequest, reload]);

  return { items, loading, error, reload, processDue };
}
