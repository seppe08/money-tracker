import { useCallback, useEffect, useState } from 'react';

import { fetchHealth, type HealthResponse } from '@/api/client';

export type ApiStatus = 'checking' | 'online' | 'offline';

export function useApiHealth() {
  const [status, setStatus] = useState<ApiStatus>('checking');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    let active = true;

    fetchHealth()
      .then((result) => {
        if (!active) {
          return;
        }
        setHealth(result);
        setStatus('online');
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }
        setHealth(null);
        setStatus('offline');
        setError(cause instanceof Error ? cause.message : 'Unknown error');
      });

    return () => {
      active = false;
    };
  }, [requestId]);

  const refresh = useCallback(() => {
    setStatus('checking');
    setError(null);
    setRequestId((id) => id + 1);
  }, []);

  return { status, health, error, refresh };
}
