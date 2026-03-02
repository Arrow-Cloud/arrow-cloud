import { useState, useEffect, useCallback, useRef } from 'react';
import { getChartRecentPlays, GetChartRecentPlaysParams, GetChartRecentPlaysResponse } from '../services/api';
import { PackRecentPlay } from '../schemas/apiSchemas';

interface UseChartRecentPlaysState {
  recentPlays: PackRecentPlay[];
  meta: GetChartRecentPlaysResponse['meta'] | null;
  filters: GetChartRecentPlaysResponse['filters'] | null;
  loading: boolean;
  error: string | null;
}

interface UseChartRecentPlaysActions {
  setSearch: (search: string) => void;
  setPage: (page: number) => void;
  setUserIds: (userIds: string[] | undefined) => void;
  refresh: () => void;
}

interface UseChartRecentPlaysOptions {
  chartHash: string;
  initialRecentPlays?: PackRecentPlay[];
}

export const useChartRecentPlays = (options: UseChartRecentPlaysOptions): UseChartRecentPlaysState & UseChartRecentPlaysActions => {
  const [state, setState] = useState<UseChartRecentPlaysState>({
    recentPlays: options.initialRecentPlays || [],
    meta: null,
    filters: null,
    loading: !options.initialRecentPlays,
    error: null,
  });

  const [params, setParams] = useState<GetChartRecentPlaysParams>({
    page: 1,
    limit: 5,
    search: '',
    userIds: undefined,
  });

  // Track if filters have ever been applied - once true, always fetch on changes
  const hasAppliedFilters = useRef(false);

  const fetchRecentPlays = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await getChartRecentPlays(options.chartHash, params);
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
  }, [options.chartHash, params]);

  useEffect(() => {
    // Track if any filter has been applied
    if (params.search || (params.userIds && params.userIds.length > 0) || params.page > 1) {
      hasAppliedFilters.current = true;
    }

    // Skip initial fetch only if we have initial data, are in default state, and haven't applied filters before
    const hasUserIds = params.userIds && params.userIds.length > 0;
    if (options.initialRecentPlays && params.page === 1 && !params.search && !hasUserIds && !hasAppliedFilters.current) {
      return;
    }
    fetchRecentPlays();
  }, [fetchRecentPlays, options.initialRecentPlays, params.page, params.search, params.userIds]);

  const setSearch = useCallback((search: string) => {
    setParams((prev) => ({ ...prev, search, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }));
  }, []);

  const setUserIds = useCallback((userIds: string[] | undefined) => {
    setParams((prev) => {
      // Compare arrays to avoid unnecessary updates
      const prevIds = prev.userIds;
      const isSame =
        prevIds === userIds ||
        (prevIds && userIds && prevIds.length === userIds.length && prevIds.every((id, i) => id === userIds[i]));
      if (isSame) {
        return prev;
      }
      return { ...prev, userIds, page: 1 };
    });
  }, []);

  const refresh = useCallback(() => {
    fetchRecentPlays();
  }, [fetchRecentPlays]);

  return {
    ...state,
    setSearch,
    setPage,
    setUserIds,
    refresh,
  };
};
