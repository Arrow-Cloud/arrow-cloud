import { useState, useCallback, useMemo } from 'react';
import { getChartRecentPlays, GetChartRecentPlaysParams, GetChartRecentPlaysResponse } from '../services/api';
import { PackRecentPlay } from '../schemas/apiSchemas';
import { usePaginatedResource, PaginatedLoadState } from './usePaginatedResource';

interface UseChartRecentPlaysState {
  recentPlays: PackRecentPlay[];
  meta: GetChartRecentPlaysResponse['meta'] | null;
  filters: GetChartRecentPlaysResponse['filters'] | null;
  /** True while any request is in flight. */
  loading: boolean;
  error: string | null;
  /** Loading state for skeletons, dimming, and the pager. */
  loadState: PaginatedLoadState;
}

interface UseChartRecentPlaysActions {
  setSearch: (search: string) => void;
  setPage: (page: number) => void;
  setUserIds: (userIds: string[] | undefined) => void;
  refresh: () => void;
}

interface UseChartRecentPlaysOptions {
  chartHash: string;
  /** Plays already loaded with the chart. Used for the default view (page 1, no filters) without a fetch. */
  initialRecentPlays?: PackRecentPlay[];
}

export const CHART_RECENT_PLAYS_PAGE_SIZE = 5;

type InitialResponse = Pick<GetChartRecentPlaysResponse, 'data'> & { meta: GetChartRecentPlaysResponse['meta'] | null; filters: null };

export const useChartRecentPlays = (options: UseChartRecentPlaysOptions): UseChartRecentPlaysState & UseChartRecentPlaysActions => {
  const { chartHash, initialRecentPlays } = options;
  const [params, setParams] = useState<GetChartRecentPlaysParams>({
    page: 1,
    limit: CHART_RECENT_PLAYS_PAGE_SIZE,
    search: '',
    userIds: undefined,
  });

  const initialData = useMemo<InitialResponse | null>(
    () => (initialRecentPlays ? { data: initialRecentPlays, meta: null, filters: null } : null),
    // Only the first value matters; the hook reads initial data once.
    [],
  );

  const resource = usePaginatedResource<GetChartRecentPlaysParams, GetChartRecentPlaysResponse | InitialResponse>({
    resetKey: chartHash,
    params,
    fetcher: (p) => getChartRecentPlays(chartHash, p),
    initialData,
    // Initial plays have no pagination metadata. Fetch page 1 in the background so the pager appears.
    refreshInitialData: true,
    errorMessage: 'Failed to fetch recent plays',
  });

  const setSearch = useCallback((search: string) => {
    setParams((prev) => (prev.search === search ? prev : { ...prev, search, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }));
  }, []);

  const setUserIds = useCallback((userIds: string[] | undefined) => {
    setParams((prev) => {
      // Compare arrays to avoid unnecessary updates
      const prevIds = prev.userIds;
      const isSame = prevIds === userIds || (prevIds && userIds && prevIds.length === userIds.length && prevIds.every((id, i) => id === userIds[i]));
      if (isSame) {
        return prev;
      }
      return { ...prev, userIds, page: 1 };
    });
  }, []);

  return {
    recentPlays: resource.data?.data ?? [],
    meta: resource.data?.meta ?? null,
    filters: resource.data?.filters ?? null,
    loading: resource.isFetching,
    error: resource.error,
    loadState: resource,
    setSearch,
    setPage,
    setUserIds,
    refresh: resource.retry,
  };
};
