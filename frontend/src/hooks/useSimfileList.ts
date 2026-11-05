import { useState, useCallback } from 'react';
import { listSimfiles, ListSimfilesParams } from '../services/api';
import { ListSimfilesResponse, SimfileListItem } from '../schemas/apiSchemas';
import { usePaginatedResource, PaginatedLoadState } from './usePaginatedResource';

interface UseSimfileListState {
  simfiles: SimfileListItem[];
  meta: ListSimfilesResponse['meta'] | null;
  filters: ListSimfilesResponse['filters'] | null;
  /** True while any request is in flight. */
  loading: boolean;
  error: string | null;
  /** Loading state for skeletons, dimming, and the pager. */
  loadState: PaginatedLoadState;
}

interface UseSimfileListActions {
  setSearch: (search: string) => void;
  setOrderBy: (orderBy: string) => void;
  setOrderDirection: (direction: 'asc' | 'desc') => void;
  setPage: (page: number) => void;
  refresh: () => void;
}

interface UseSimfileListOptions {
  packId?: number;
}

export const SIMFILE_LIST_PAGE_SIZE = 25;

export const useSimfileList = (options: UseSimfileListOptions = {}): UseSimfileListState & UseSimfileListActions => {
  const [params, setParams] = useState<ListSimfilesParams>({
    page: 1,
    limit: SIMFILE_LIST_PAGE_SIZE,
    search: '',
    packId: options.packId,
    orderBy: 'title',
    orderDirection: 'asc',
  });

  const resource = usePaginatedResource({ resetKey: options.packId ?? null, params, fetcher: listSimfiles, errorMessage: 'Failed to fetch simfiles' });

  const setSearch = useCallback((search: string) => {
    setParams((prev) => ({ ...prev, search, page: 1 }));
  }, []);

  const setOrderBy = useCallback((orderBy: string) => {
    setParams((prev) => ({ ...prev, orderBy: orderBy as ListSimfilesParams['orderBy'], page: 1 }));
  }, []);

  const setOrderDirection = useCallback((direction: 'asc' | 'desc') => {
    setParams((prev) => ({ ...prev, orderDirection: direction, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }));
  }, []);

  return {
    simfiles: resource.data?.data ?? [],
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
