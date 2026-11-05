import { useState, useCallback } from 'react';
import { listPacks, ListPacksParams } from '../services/api';
import { ListPacksResponse, PackListItem } from '../schemas/apiSchemas';
import { usePaginatedResource, PaginatedLoadState } from './usePaginatedResource';

interface UsePackListState {
  packs: PackListItem[];
  meta: ListPacksResponse['meta'] | null;
  filters: ListPacksResponse['filters'] | null;
  /** True while any request is in flight. */
  loading: boolean;
  error: string | null;
  /** Loading state for skeletons, dimming, and the pager. */
  loadState: PaginatedLoadState;
}

interface UsePackListActions {
  setSearch: (search: string) => void;
  setOrderBy: (orderBy: string) => void;
  setOrderDirection: (direction: 'asc' | 'desc') => void;
  setPage: (page: number) => void;
  refresh: () => void;
}

export const PACK_LIST_PAGE_SIZE = 25;

export const usePackList = (): UsePackListState & UsePackListActions => {
  const [params, setParams] = useState<ListPacksParams>({
    page: 1,
    limit: PACK_LIST_PAGE_SIZE,
    search: '',
    orderBy: 'popularity',
    orderDirection: 'desc',
  });

  const resource = usePaginatedResource({ params, fetcher: listPacks, errorMessage: 'Failed to fetch packs' });

  const setSearch = useCallback((search: string) => {
    setParams((prev) => ({ ...prev, search, page: 1 }));
  }, []);

  const setOrderBy = useCallback((orderBy: string) => {
    setParams((prev) => ({ ...prev, orderBy: orderBy as ListPacksParams['orderBy'], page: 1 }));
  }, []);

  const setOrderDirection = useCallback((direction: 'asc' | 'desc') => {
    setParams((prev) => ({ ...prev, orderDirection: direction, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }));
  }, []);

  return {
    packs: resource.data?.data ?? [],
    meta: resource.data?.meta ?? null,
    filters: resource.data?.filters ?? null,
    loading: resource.isFetching,
    error: resource.error,
    loadState: resource,
    setSearch,
    setOrderBy,
    setOrderDirection,
    setPage,
    refresh: resource.retry,
  };
};
