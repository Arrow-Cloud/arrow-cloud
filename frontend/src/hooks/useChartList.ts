import { useState, useCallback } from 'react';
import { listCharts, ListChartsParams } from '../services/api';
import { ListChartsResponse, ChartListItem } from '../schemas/apiSchemas';
import { usePaginatedResource, PaginatedLoadState } from './usePaginatedResource';

interface UseChartListState {
  charts: ChartListItem[];
  meta: ListChartsResponse['meta'] | null;
  filters: ListChartsResponse['filters'] | null;
  /** True while any request is in flight. */
  loading: boolean;
  error: string | null;
  /** Loading state for skeletons, dimming, and the pager. */
  loadState: PaginatedLoadState;
}

interface UseChartListActions {
  setSearch: (search: string) => void;
  setStepsType: (stepsType: string) => void;
  setDifficulty: (difficulty: string) => void;
  setPackId: (packId: number | undefined) => void;
  setOrderBy: (orderBy: string) => void;
  setOrderDirection: (direction: 'asc' | 'desc') => void;
  setPage: (page: number) => void;
  refresh: () => void;
}

export const CHART_LIST_PAGE_SIZE = 25;

// Remove empty values so they are not sent to the API.
const fetchChartList = (params: ListChartsParams) =>
  listCharts(Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined)) as ListChartsParams);

export const useChartList = (): UseChartListState & UseChartListActions => {
  const [params, setParams] = useState<ListChartsParams>({
    page: 1,
    limit: CHART_LIST_PAGE_SIZE,
    search: '',
    stepsType: '',
    difficulty: '',
    packId: undefined,
    orderBy: 'songName',
    orderDirection: 'asc',
  });

  const resource = usePaginatedResource({ params, fetcher: fetchChartList, errorMessage: 'Failed to fetch charts' });

  const setSearch = useCallback((search: string) => {
    setParams((prev) => ({ ...prev, search, page: 1 }));
  }, []);

  const setStepsType = useCallback((stepsType: string) => {
    setParams((prev) => ({ ...prev, stepsType, page: 1 }));
  }, []);

  const setDifficulty = useCallback((difficulty: string) => {
    setParams((prev) => ({ ...prev, difficulty, page: 1 }));
  }, []);

  const setPackId = useCallback((packId: number | undefined) => {
    setParams((prev) => ({ ...prev, packId, page: 1 }));
  }, []);

  const setOrderBy = useCallback((orderBy: string) => {
    setParams((prev) => ({ ...prev, orderBy: orderBy as ListChartsParams['orderBy'], page: 1 }));
  }, []);

  const setOrderDirection = useCallback((direction: 'asc' | 'desc') => {
    setParams((prev) => ({ ...prev, orderDirection: direction, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }));
  }, []);

  return {
    charts: resource.data?.data ?? [],
    meta: resource.data?.meta ?? null,
    filters: resource.data?.filters ?? null,
    loading: resource.isFetching,
    error: resource.error,
    loadState: resource,
    setSearch,
    setStepsType,
    setDifficulty,
    setPackId,
    setOrderBy,
    setOrderDirection,
    setPage,
    refresh: resource.retry,
  };
};
