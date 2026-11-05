import { useState, useCallback } from 'react';
import { listUsers, ListUsersParams } from '../services/api';
import { ListUsersResponse, UserListItem } from '../schemas/apiSchemas';
import { usePaginatedResource, PaginatedLoadState } from './usePaginatedResource';

interface UseUserListState {
  users: UserListItem[];
  meta: ListUsersResponse['meta'] | null;
  filters: ListUsersResponse['filters'] | null;
  /** True while any request is in flight. */
  loading: boolean;
  error: string | null;
  /** Loading state for skeletons, dimming, and the pager. */
  loadState: PaginatedLoadState;
}

interface UseUserListActions {
  setSearch: (search: string) => void;
  setCountryId: (countryId: number | undefined) => void;
  setOrderBy: (orderBy: string) => void;
  setOrderDirection: (direction: 'asc' | 'desc') => void;
  setPage: (page: number) => void;
  refresh: () => void;
}

export const USER_LIST_PAGE_SIZE = 25;

export const useUserList = (): UseUserListState & UseUserListActions => {
  const [params, setParams] = useState<ListUsersParams>({
    page: 1,
    limit: USER_LIST_PAGE_SIZE,
    search: '',
    orderBy: 'createdAt',
    orderDirection: 'desc',
  });

  const resource = usePaginatedResource({ params, fetcher: listUsers, errorMessage: 'Failed to fetch users' });

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

  return {
    users: resource.data?.data ?? [],
    meta: resource.data?.meta ?? null,
    filters: resource.data?.filters ?? null,
    loading: resource.isFetching,
    error: resource.error,
    loadState: resource,
    setSearch,
    setCountryId,
    setOrderBy,
    setOrderDirection,
    setPage,
    refresh: resource.retry,
  };
};
