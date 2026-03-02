import { useState, useEffect, useCallback } from 'react';
import { getPackRecentPlays, GetPackRecentPlaysParams, GetPackRecentPlaysResponse } from '../services/api';
import { PackRecentPlay } from '../schemas/apiSchemas';

interface UsePackRecentPlaysState {
  recentPlays: PackRecentPlay[];
  meta: GetPackRecentPlaysResponse['meta'] | null;
  filters: GetPackRecentPlaysResponse['filters'] | null;
  loading: boolean;
  error: string | null;
}

interface UsePackRecentPlaysActions {
  setSearch: (search: string) => void;
  setPage: (page: number) => void;
  refresh: () => void;
}

interface UsePackRecentPlaysOptions {
  packId: number;
}

export const usePackRecentPlays = (options: UsePackRecentPlaysOptions): UsePackRecentPlaysState & UsePackRecentPlaysActions => {
  const [state, setState] = useState<UsePackRecentPlaysState>({
    recentPlays: [],
    meta: null,
    filters: null,
    loading: true,
    error: null,
  });

  const [params, setParams] = useState<GetPackRecentPlaysParams>({
    page: 1,
    limit: 5,
    search: '',
  });

  const fetchRecentPlays = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await getPackRecentPlays(options.packId, params);
      setState((prev) => ({
        ...prev,
        recentPlays: response.data,
        meta: response.meta,
        filters: response.filters,
        loading: false,
      }));
    } catch (error) {
      console.error('Failed to fetch recent plays:', error);
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to fetch recent plays',
        loading: false,
      }));
    }
  }, [options.packId, params]);

  useEffect(() => {
    fetchRecentPlays();
  }, [fetchRecentPlays]);

  const setSearch = useCallback((search: string) => {
    setParams((prev) => ({ ...prev, search, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }));
  }, []);

  const refresh = useCallback(() => {
    fetchRecentPlays();
  }, [fetchRecentPlays]);

  return {
    ...state,
    setSearch,
    setPage,
    refresh,
  };
};
