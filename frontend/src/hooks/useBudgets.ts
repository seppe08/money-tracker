import { useCallback, useEffect, useState } from 'react';

import {
  type BudgetListResponse,
  errorMessage,
  fetchBudgets,
} from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

export function useBudgets(month?: string) {
  const { authedRequest } = useAuth();
  const [data, setData] = useState<BudgetListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const result = await fetchBudgets(month, authedRequest);
      setData(result);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [authedRequest, month]);

  useEffect(() => {
    let active = true;

    fetchBudgets(month, authedRequest)
      .then((result) => {
        if (!active) return;
        setData(result);
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
  }, [authedRequest, month, reloadKey]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReloadKey((key) => key + 1);
    await loadData();
  }, [loadData]);

  return { data, loading, error, reload };
}
