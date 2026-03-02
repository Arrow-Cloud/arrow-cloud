import { useState, useEffect, useCallback } from 'react';
import { listCharts, ListChartsParams } from '../services/api';
import { ListChartsResponse, ChartListItem } from '../schemas/apiSchemas';

interface UseChartListState {
  charts: ChartListItem[];
  meta: ListChartsResponse['meta'] | null;
  filters: ListChartsResponse['filters'] | null;
  loading: boolean;
  error: string | null;
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

export const useChartList = (): UseChartListState & UseChartListActions => {
  const [state, setState] = useState<UseChartListState>({
    charts: [],
    meta: null,
    filters: null,
    loading: true,
    error: null,
  });

  const [params, setParams] = useState<ListChartsParams>({
    page: 1,
    limit: 25,
    search: '',
    stepsType: '',
    difficulty: '',
    packId: undefined,
    orderBy: 'songName',
    orderDirection: 'asc',
  });

  const fetchCharts = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Remove empty string values to avoid sending them to API
      const cleanParams = Object.fromEntries(
        /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
        Object.entries(params).filter(([_, value]) => value !== '' && value !== undefined),
      ) as ListChartsParams;

      const response = await listCharts(cleanParams);
      setState((prev) => ({
        ...prev,
        charts: response.data,
        meta: response.meta,
        filters: response.filters,
        loading: false,
      }));
    } catch (error) {
      console.error('Failed to fetch charts:', error);
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to fetch charts',
        loading: false,
      }));
    }
  }, [params]);

  useEffect(() => {
    fetchCharts();
  }, [fetchCharts]);

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

  const refresh = useCallback(() => {
    fetchCharts();
  }, [fetchCharts]);

  return {
    ...state,
    setSearch,
    setStepsType,
    setDifficulty,
    setPackId,
    setOrderBy,
    setOrderDirection,
    setPage,
    refresh,
  };
};
