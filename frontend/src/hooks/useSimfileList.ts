import { useState, useEffect, useCallback } from 'react';
import { listSimfiles, ListSimfilesParams } from '../services/api';
import { ListSimfilesResponse, SimfileListItem } from '../schemas/apiSchemas';

interface UseSimfileListState {
  simfiles: SimfileListItem[];
  meta: ListSimfilesResponse['meta'] | null;
  filters: ListSimfilesResponse['filters'] | null;
  loading: boolean;
  error: string | null;
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

export const useSimfileList = (options: UseSimfileListOptions = {}): UseSimfileListState & UseSimfileListActions => {
  const [state, setState] = useState<UseSimfileListState>({
    simfiles: [],
    meta: null,
    filters: null,
    loading: true,
    error: null,
  });

  const [params, setParams] = useState<ListSimfilesParams>({
    page: 1,
    limit: 25,
    search: '',
    packId: options.packId,
    orderBy: 'title',
    orderDirection: 'asc',
  });

  const fetchSimfiles = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await listSimfiles(params);
      setState((prev) => ({
        ...prev,
        simfiles: response.data,
        meta: response.meta,
        filters: response.filters,
        loading: false,
      }));
    } catch (error) {
      console.error('Failed to fetch simfiles:', error);
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to fetch simfiles',
        loading: false,
      }));
    }
  }, [params]);

  useEffect(() => {
    fetchSimfiles();
  }, [fetchSimfiles]);

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

  const refresh = useCallback(() => {
    fetchSimfiles();
  }, [fetchSimfiles]);

  return {
    ...state,
    setSearch,
    setOrderBy,
    setOrderDirection,
    setPage,
    refresh,
  };
};
