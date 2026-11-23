import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  type CategoryAnalyticsResponse,
  errorMessage,
  fetchCategoryAnalytics,
} from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

export function useCategoryAnalytics(query?: { from_date?: string; to_date?: string }) {
  const { authedRequest } = useAuth();
  const [data, setData] = useState<CategoryAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const from_date = query?.from_date;
  const to_date = query?.to_date;

  const memoizedQuery = useMemo(
    () => ({ from_date, to_date }),
    [from_date, to_date],
  );

  const loadData = useCallback(async () => {
    try {
      const result = await fetchCategoryAnalytics(memoizedQuery, authedRequest);
      setData(result);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [authedRequest, memoizedQuery]);

  useEffect(() => {
    let active = true;

    fetchCategoryAnalytics(memoizedQuery, authedRequest)
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
  }, [authedRequest, memoizedQuery, reloadKey]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReloadKey((key) => key + 1);
    await loadData();
  }, [loadData]);

  return { data, loading, error, reload };
}
