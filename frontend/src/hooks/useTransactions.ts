import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  errorMessage,
  fetchTransactions,
  type Transaction,
  type TransactionQuery,
} from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

export function useTransactions(query?: TransactionQuery) {
  const { authedRequest } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
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

  const memoizedQuery = useMemo<TransactionQuery>(
    () => ({
      limit: limit ?? 100,
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

  const loadData = useCallback(async () => {
    try {
      const data = await fetchTransactions(memoizedQuery, authedRequest);
      setTransactions(data.items);
      setTotal(data.total);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [authedRequest, memoizedQuery]);

  useEffect(() => {
    let active = true;

    fetchTransactions(memoizedQuery, authedRequest)
      .then((data) => {
        if (!active) return;
        setTransactions(data.items);
        setTotal(data.total);
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
    setReloadKey((k) => k + 1);
    await loadData();
  }, [loadData]);

  return { transactions, total, loading, error, reload };
}
