import { useCallback, useEffect, useState } from 'react';

import { errorMessage, type Transaction } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

export function useTransactions() {
  const { authedRequest } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    authedRequest<Transaction[]>('/api/v1/transactions?limit=100')
      .then((data) => {
        if (!active) {
          return;
        }
        setTransactions(data);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }
        setError(errorMessage(cause));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authedRequest, reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadKey((key) => key + 1);
  }, []);

  return { transactions, loading, error, reload };
}
