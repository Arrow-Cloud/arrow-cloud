import { useState, useEffect, useCallback } from 'react';
import { listUsers, ListUsersParams } from '../services/api';
import { ListUsersResponse, UserListItem } from '../schemas/apiSchemas';

interface UseUserListState {
  users: UserListItem[];
  meta: ListUsersResponse['meta'] | null;
  filters: ListUsersResponse['filters'] | null;
  loading: boolean;
  error: string | null;
}

interface UseUserListActions {
  setSearch: (search: string) => void;
  setCountryId: (countryId: number | undefined) => void;
  setOrderBy: (orderBy: string) => void;
  setOrderDirection: (direction: 'asc' | 'desc') => void;
  setPage: (page: number) => void;
  refresh: () => void;
}

export const useUserList = (): UseUserListState & UseUserListActions => {
  const [state, setState] = useState<UseUserListState>({
    users: [],
    meta: null,
    filters: null,
    loading: true,
    error: null,
  });

  const [params, setParams] = useState<ListUsersParams>({
    page: 1,
    limit: 25,
    search: '',
    orderBy: 'createdAt',
    orderDirection: 'desc',
  });

  const fetchUsers = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await listUsers(params);
      setState((prev) => ({
        ...prev,
        users: response.data,
        meta: response.meta,
        filters: response.filters,
        loading: false,
      }));
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to fetch users',
        loading: false,
      }));
    }
  }, [params]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const setSearch = useCallback((search: string) => {
    setParams((prev) => ({ ...prev, search, page: 1 }));
  }, []);

  const setCountryId = useCallback((countryId: number | undefined) => {
    setParams((prev) => ({ ...prev, countryId, page: 1 }));
  }, []);

  const setOrderBy = useCallback((orderBy: string) => {
    setParams((prev) => ({ ...prev, orderBy: orderBy as ListUsersParams['orderBy'], page: 1 }));
  }, []);

  const setOrderDirection = useCallback((direction: 'asc' | 'desc') => {
    setParams((prev) => ({ ...prev, orderDirection: direction, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }));
  }, []);

  const refresh = useCallback(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    ...state,
    setSearch,
    setCountryId,
    setOrderBy,
    setOrderDirection,
    setPage,
    refresh,
  };
};
