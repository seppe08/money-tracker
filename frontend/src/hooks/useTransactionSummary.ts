import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  errorMessage,
  fetchTransactionSummary,
  type TransactionQuery,
  type TransactionSummary,
} from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

export function useTransactionSummary(query?: TransactionQuery) {
  const { authedRequest } = useAuth();
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const limit = query?.limit;
  const offset = query?.offset;
  const search = query?.search;
  const category = query?.category;
  const kind = query?.kind;
  const from_date = query?.from_date;
  const to_date = query?.to_date;
  const sort = query?.sort;

  const memoizedQuery = useMemo(
    () => ({
      limit,
      offset,
      search,
      category,
      kind,
      from_date,
      to_date,
      sort,
    }),
    [limit, offset, search, category, kind, from_date, to_date, sort],
  );

  const loadSummary = useCallback(async () => {
    try {
      const data = await fetchTransactionSummary(memoizedQuery, authedRequest);
      setSummary(data);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [authedRequest, memoizedQuery]);

  useEffect(() => {
    let active = true;

    fetchTransactionSummary(memoizedQuery, authedRequest)
      .then((data) => {
        if (!active) return;
        setSummary(data);
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
    await loadSummary();
  }, [loadSummary]);

  return { summary, loading, error, reload };
}
