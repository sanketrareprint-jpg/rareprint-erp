/**
 * useApiData — fetch-on-mount hook for RarePrint ERP pages.
 *
 * Replaces the repeated pattern of:
 *   const [data, setData] = useState([]);
 *   const [loading, setLoading] = useState(true);
 *   const [error, setError] = useState('');
 *   useEffect(() => { fetchData(); }, []);
 *
 * Usage:
 *
 *   const { data: orders, loading, error, refetch } =
 *     useApiData<Order[]>('/accounts/orders', []);
 *
 *   if (loading) return <Spinner />;
 *   if (error)   return <p className="text-red-500">{error}</p>;
 *   return <OrderTable orders={orders} />;
 *
 * Options:
 *   deps   — extra dependency array items that trigger a re-fetch (default: [])
 *   skip   — set true to skip the initial fetch (e.g. while waiting for auth)
 *
 * Returns:
 *   data     — the fetched value, or `initialValue` while loading / on error
 *   loading  — true while the request is in-flight
 *   error    — human-readable error string, or '' on success
 *   refetch  — call manually to reload (e.g. after a mutation)
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

interface UseApiDataOptions {
  deps?: unknown[];
  skip?: boolean;
}

interface UseApiDataResult<T> {
  data: T;
  loading: boolean;
  error: string;
  refetch: () => void;
}

export function useApiData<T>(
  path: string,
  initialValue: T,
  options: UseApiDataOptions = {},
): UseApiDataResult<T> {
  const { deps = [], skip = false } = options;

  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (skip) return;
    setLoading(true);
    setError('');
    const result = await apiFetch<T>(path, {}, (msg) => setError(msg));
    if (result !== null) setData(result);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, skip, ...deps]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
