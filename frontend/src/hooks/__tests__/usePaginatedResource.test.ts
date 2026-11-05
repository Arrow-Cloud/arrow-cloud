import { act, renderHook } from '@testing-library/react';
import { usePaginatedResource, BUSY_DELAY_MS } from '../usePaginatedResource';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

interface Params {
  page: number;
}

/** A fetcher whose calls are resolved manually, in any order. */
const controllableFetcher = () => {
  const calls: { params: Params; d: Deferred<string> }[] = [];
  const fetcher = jest.fn((params: Params) => {
    const d = deferred<string>();
    calls.push({ params, d });
    return d.promise;
  });
  return { fetcher, calls };
};

type HookProps = { params: Params; resetKey?: string; initialData?: string | null; refreshInitialData?: boolean; enabled?: boolean };

const setup = (fetcher: (p: Params) => Promise<string>, initialProps: HookProps) =>
  renderHook((props: HookProps) => usePaginatedResource({ fetcher, ...props }), { initialProps });

// Let resolved promises run their callbacks inside act().
const flush = () => act(async () => {});

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('usePaginatedResource', () => {
  it('is in first-load state until the first response arrives', async () => {
    const { fetcher, calls } = controllableFetcher();
    const { result } = setup(fetcher, { params: { page: 1 } });

    expect(result.current.isInitialLoading).toBe(true);
    expect(result.current.hasData).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.isFetching).toBe(true);

    calls[0].d.resolve('page 1');
    await flush();

    expect(result.current.isInitialLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBe('page 1');
  });

  it('keeps previous data while refetching after a param change', async () => {
    const { fetcher, calls } = controllableFetcher();
    const { result, rerender } = setup(fetcher, { params: { page: 1 } });
    calls[0].d.resolve('page 1');
    await flush();

    rerender({ params: { page: 2 } });

    expect(result.current.isInitialLoading).toBe(false);
    expect(result.current.isRefetching).toBe(true);
    expect(result.current.isFetching).toBe(true);
    expect(result.current.data).toBe('page 1');

    calls[1].d.resolve('page 2');
    await flush();

    expect(result.current.isRefetching).toBe(false);
    expect(result.current.data).toBe('page 2');
  });

  it('does not refetch when params change identity but not value', async () => {
    const { fetcher, calls } = controllableFetcher();
    const { rerender } = setup(fetcher, { params: { page: 1 } });
    calls[0].d.resolve('page 1');
    await flush();

    rerender({ params: { page: 1 } });
    await flush();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('shows busy only after the refetch has lasted the busy delay', async () => {
    const { fetcher, calls } = controllableFetcher();
    const { result, rerender } = setup(fetcher, { params: { page: 1 } });
    calls[0].d.resolve('page 1');
    await flush();

    rerender({ params: { page: 2 } });
    act(() => {
      jest.advanceTimersByTime(BUSY_DELAY_MS - 1);
    });
    expect(result.current.showBusy).toBe(false);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.showBusy).toBe(true);

    calls[1].d.resolve('page 2');
    await flush();
    expect(result.current.showBusy).toBe(false);
  });

  it('never shows busy for a refetch that finishes before the delay', async () => {
    const { fetcher, calls } = controllableFetcher();
    const { result, rerender } = setup(fetcher, { params: { page: 1 } });
    calls[0].d.resolve('page 1');
    await flush();

    rerender({ params: { page: 2 } });
    act(() => {
      jest.advanceTimersByTime(BUSY_DELAY_MS / 2);
    });
    calls[1].d.resolve('page 2');
    await flush();
    act(() => {
      jest.advanceTimersByTime(BUSY_DELAY_MS * 2);
    });

    expect(result.current.showBusy).toBe(false);
    expect(result.current.data).toBe('page 2');
  });

  it('ignores a slow earlier response that arrives after a newer one', async () => {
    const { fetcher, calls } = controllableFetcher();
    const { result, rerender } = setup(fetcher, { params: { page: 1 } });
    calls[0].d.resolve('page 1');
    await flush();

    rerender({ params: { page: 2 } });
    rerender({ params: { page: 3 } });

    calls[2].d.resolve('page 3');
    await flush();
    calls[1].d.resolve('page 2');
    await flush();

    expect(result.current.data).toBe('page 3');
    expect(result.current.isRefetching).toBe(false);
  });

  it('returns to first-load state when the reset key changes', async () => {
    const { fetcher, calls } = controllableFetcher();
    const { result, rerender } = setup(fetcher, { params: { page: 1 }, resetKey: 'pack-1' });
    calls[0].d.resolve('pack 1 data');
    await flush();

    rerender({ params: { page: 1 }, resetKey: 'pack-2' });

    expect(result.current.isInitialLoading).toBe(true);
    expect(result.current.data).toBeNull();

    calls[1].d.resolve('pack 2 data');
    await flush();
    expect(result.current.data).toBe('pack 2 data');
  });

  it('keeps previous data and exposes the error when a refetch fails', async () => {
    const { fetcher, calls } = controllableFetcher();
    const { result, rerender } = setup(fetcher, { params: { page: 1 } });
    calls[0].d.resolve('page 1');
    await flush();

    rerender({ params: { page: 2 } });
    calls[1].d.reject(new Error('Network down'));
    await flush();

    expect(result.current.data).toBe('page 1');
    expect(result.current.hasData).toBe(true);
    expect(result.current.error).toBe('Network down');
    expect(result.current.isRefetching).toBe(false);
  });

  it('retry repeats the last request and clears the error on success', async () => {
    const { fetcher, calls } = controllableFetcher();
    const { result, rerender } = setup(fetcher, { params: { page: 1 } });
    calls[0].d.resolve('page 1');
    await flush();
    rerender({ params: { page: 2 } });
    calls[1].d.reject(new Error('Network down'));
    await flush();

    act(() => result.current.retry());

    expect(calls[2].params).toEqual({ page: 2 });
    calls[2].d.resolve('page 2');
    await flush();

    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('page 2');
  });

  it('shows the error without data when the first load fails, and the skeleton again on retry', async () => {
    const { fetcher, calls } = controllableFetcher();
    const { result } = setup(fetcher, { params: { page: 1 } });
    calls[0].d.reject(new Error('Boom'));
    await flush();

    expect(result.current.isInitialLoading).toBe(false);
    expect(result.current.hasData).toBe(false);
    expect(result.current.error).toBe('Boom');

    act(() => result.current.retry());
    expect(result.current.isInitialLoading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('skips the first fetch when initial data is supplied, and fetches on later changes', async () => {
    const { fetcher, calls } = controllableFetcher();
    const { result, rerender } = setup(fetcher, { params: { page: 1 }, initialData: 'server data' });
    await flush();

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.isInitialLoading).toBe(false);
    expect(result.current.data).toBe('server data');

    rerender({ params: { page: 2 }, initialData: 'server data' });
    expect(result.current.isRefetching).toBe(true);
    calls[0].d.resolve('page 2');
    await flush();
    expect(result.current.data).toBe('page 2');

    // Going back to the initial params fetches again instead of reusing stale initial data.
    rerender({ params: { page: 1 }, initialData: 'server data' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('shows initial data and still fetches it once when refreshInitialData is set', async () => {
    const { fetcher, calls } = controllableFetcher();
    const { result } = setup(fetcher, { params: { page: 1 }, initialData: 'partial', refreshInitialData: true });

    expect(result.current.isInitialLoading).toBe(false);
    expect(result.current.isRefetching).toBe(true);
    expect(result.current.data).toBe('partial');
    expect(calls[0].params).toEqual({ page: 1 });

    calls[0].d.resolve('complete');
    await flush();
    expect(result.current.data).toBe('complete');
  });

  it('does not fetch while disabled and stays in first-load state', async () => {
    const { fetcher, calls } = controllableFetcher();
    const { result, rerender } = setup(fetcher, { params: { page: 1 }, enabled: false });
    await flush();

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.isInitialLoading).toBe(true);

    rerender({ params: { page: 1 }, enabled: true });
    calls[0].d.resolve('page 1');
    await flush();
    expect(result.current.data).toBe('page 1');
  });
});
