import { useState, useEffect, useCallback } from 'react';
import { listPacks, ListPacksParams } from '../services/api';
import { ListPacksResponse, PackListItem } from '../schemas/apiSchemas';

interface UsePackListState {
  packs: PackListItem[];
  meta: ListPacksResponse['meta'] | null;
  filters: ListPacksResponse['filters'] | null;
  loading: boolean;
  error: string | null;
}

interface UsePackListActions {
  setSearch: (search: string) => void;
  setOrderBy: (orderBy: string) => void;
  setOrderDirection: (direction: 'asc' | 'desc') => void;
  setPage: (page: number) => void;
  refresh: () => void;
}

export const usePackList = (): UsePackListState & UsePackListActions => {
  const [state, setState] = useState<UsePackListState>({
    packs: [],
    meta: null,
    filters: null,
    loading: true,
    error: null,
  });

  const [params, setParams] = useState<ListPacksParams>({
    page: 1,
    limit: 25,
    search: '',
    orderBy: 'popularity',
    orderDirection: 'desc',
  });

  const fetchPacks = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await listPacks(params);
      setState((prev) => ({
        ...prev,
        packs: response.data,
        meta: response.meta,
        filters: response.filters,
        loading: false,
      }));
    } catch (error) {
      console.error('Failed to fetch packs:', error);
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to fetch packs',
        loading: false,
      }));
    }
  }, [params]);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

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

  const refresh = useCallback(() => {
    fetchPacks();
  }, [fetchPacks]);

  return {
    ...state,
    setSearch,
    setOrderBy,
    setOrderDirection,
    setPage,
    refresh,
  };
};
