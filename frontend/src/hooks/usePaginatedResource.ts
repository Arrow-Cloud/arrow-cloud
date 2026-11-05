import { useCallback, useEffect, useRef, useState } from 'react';
import { useDelayedFlag } from './useDelayedFlag';

/** How long a refetch must run before the busy state (dim + spinner) shows. */
export const BUSY_DELAY_MS = 150;

/**
 * The loading state shared by every paginated area.
 * Pages use it to choose between skeleton, dimmed rows, and inline errors.
 */
export interface PaginatedLoadState {
  /** No data yet for the current reset key. Show the skeleton. */
  isInitialLoading: boolean;
  /** Data is on screen and a new request is in flight. Keep the rows. */
  isRefetching: boolean;
  /** Any request is in flight. Use to disable the pager immediately. */
  isFetching: boolean;
  /** `isRefetching` after it has lasted `BUSY_DELAY_MS`. Use to dim and show the spinner. */
  showBusy: boolean;
  /** True once data for the current reset key exists (it may be stale during a refetch). */
  hasData: boolean;
  /** The latest request's error message, or null. */
  error: string | null;
  /** Repeat the last request. */
  retry: () => void;
}

export interface UsePaginatedResourceOptions<TParams, TData> {
  /**
   * Identifies the entity being listed (pack ID, user ID, ...). When it changes,
   * data is cleared and the area returns to its first-load state.
   */
  resetKey?: string | number | null;
  /** Query parameters. A change (by value) triggers a refetch that keeps current data. */
  params: TParams;
  /** Loads one page. Called with the current params. */
  fetcher: (params: TParams) => Promise<TData>;
  /**
   * Data already available for the initial reset key and params (e.g. server-provided).
   * Skips the first fetch. Any later change of params fetches normally.
   */
  initialData?: TData | null;
  /**
   * Show `initialData` right away but still fetch it once, as a background refetch.
   * Use when the initial data is incomplete (for example, it has no pagination metadata).
   */
  refreshInitialData?: boolean;
  /** When false, nothing is fetched and the area stays in its first-load state. Defaults to true. */
  enabled?: boolean;
  /** Fallback error message when the fetcher throws a non-Error. */
  errorMessage?: string;
}

export interface UsePaginatedResourceResult<TData> extends PaginatedLoadState {
  /** Data for the current reset key, or null on first load. Kept during refetches and after refetch errors. */
  data: TData | null;
}

interface ResourceState<TData> {
  key: string;
  data: TData | null;
  error: string | null;
}

const toKey = (value: unknown): string => (value === undefined ? '' : JSON.stringify(value));

/**
 * Fetch state for one paginated area.
 *
 * - First load (no data for the reset key): `isInitialLoading`.
 * - Param change: previous data stays, `isRefetching` is set, `showBusy` follows after a delay.
 * - Only the latest request's response is applied.
 * - A failed refetch keeps the previous data and exposes `error`.
 * - A reset key change clears data immediately.
 */
export const usePaginatedResource = <TParams, TData>(options: UsePaginatedResourceOptions<TParams, TData>): UsePaginatedResourceResult<TData> => {
  const { params, fetcher, initialData, refreshInitialData = false, enabled = true, errorMessage = 'Failed to load data' } = options;
  const resetKey = toKey(options.resetKey ?? null);
  const paramsKey = toKey(params);

  const [state, setState] = useState<ResourceState<TData>>(() => ({
    key: resetKey,
    data: initialData ?? null,
    error: null,
  }));
  const [inFlight, setInFlight] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Latest values, read inside the effect without making it re-run.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const requestIdRef = useRef(0);

  // Skip fetching while still on the exact reset key + params that initialData was provided for.
  const initialSkipRef = useRef<{ resetKey: string; paramsKey: string } | null>(initialData != null && !refreshInitialData ? { resetKey, paramsKey } : null);

  useEffect(() => {
    const skip = initialSkipRef.current;
    if (skip) {
      if (skip.resetKey === resetKey && skip.paramsKey === paramsKey && retryCount === 0) {
        return;
      }
      initialSkipRef.current = null;
    }

    if (!enabled) {
      requestIdRef.current += 1;
      setInFlight(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setInFlight(true);
    // Retrying after a first-load failure goes back to the skeleton.
    setState((prev) => (prev.key === resetKey && prev.data === null && prev.error !== null ? { ...prev, error: null } : prev));

    fetcherRef.current(paramsRef.current).then(
      (data) => {
        if (requestId !== requestIdRef.current) return;
        setState({ key: resetKey, data, error: null });
        setInFlight(false);
      },
      (err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        console.error(err);
        const message = err instanceof Error ? err.message : errorMessage;
        setState((prev) => ({ key: resetKey, data: prev.key === resetKey ? prev.data : null, error: message }));
        setInFlight(false);
      },
    );
  }, [resetKey, paramsKey, retryCount, enabled]);

  // Ignore any in-flight response after unmount.
  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    [],
  );

  // Data and errors belong to a reset key. A different key means "nothing loaded yet".
  const isCurrent = state.key === resetKey;
  const data = isCurrent ? state.data : null;
  const error = isCurrent ? state.error : null;

  const isInitialLoading = data === null && error === null;
  const isRefetching = data !== null && inFlight;
  const showBusy = useDelayedFlag(isRefetching, BUSY_DELAY_MS);

  const retry = useCallback(() => setRetryCount((c) => c + 1), []);

  return {
    data,
    hasData: data !== null,
    error,
    isInitialLoading,
    isRefetching,
    isFetching: inFlight || isInitialLoading,
    showBusy,
    retry,
  };
};
