import { useState, useCallback } from 'react';
import { getPackRecentPlays, GetPackRecentPlaysParams, GetPackRecentPlaysResponse } from '../services/api';
import { PackRecentPlay } from '../schemas/apiSchemas';
import { usePaginatedResource, PaginatedLoadState } from './usePaginatedResource';

interface UsePackRecentPlaysState {
  recentPlays: PackRecentPlay[];
  meta: GetPackRecentPlaysResponse['meta'] | null;
  filters: GetPackRecentPlaysResponse['filters'] | null;
  /** True while any request is in flight. */
  loading: boolean;
  error: string | null;
  /** Loading state for skeletons, dimming, and the pager. */
  loadState: PaginatedLoadState;
}

interface UsePackRecentPlaysActions {
  setSearch: (search: string) => void;
  setPage: (page: number) => void;
  refresh: () => void;
}

interface UsePackRecentPlaysOptions {
  packId: number;
}

export const PACK_RECENT_PLAYS_PAGE_SIZE = 5;

export const usePackRecentPlays = (options: UsePackRecentPlaysOptions): UsePackRecentPlaysState & UsePackRecentPlaysActions => {
  const [params, setParams] = useState<GetPackRecentPlaysParams>({
    page: 1,
    limit: PACK_RECENT_PLAYS_PAGE_SIZE,
    search: '',
  });

  const resource = usePaginatedResource({
    resetKey: options.packId,
    params,
    fetcher: (p: typeof params) => getPackRecentPlays(options.packId, p),
    errorMessage: 'Failed to fetch recent plays',
  });

  const setSearch = useCallback((search: string) => {
    setParams((prev) => ({ ...prev, search, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }));
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
    refresh: resource.retry,
  };
};
