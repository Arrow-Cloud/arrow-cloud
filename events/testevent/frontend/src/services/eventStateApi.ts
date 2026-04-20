import { useState, useEffect, useCallback, useRef } from 'react';

const STATE_API_URL = (import.meta as any).env?.VITE_EVENT_STATE_API_URL || 'https://4ddpzsx5dsptbocd6xodmdftki0trqos.lambda-url.us-east-2.on.aws';

export interface PlayItem {
  playId: number;
  userId: string;
  playerAlias: string;
  chartHash: string;
  songName: string;
  artist: string;
  stepartist: string;
  difficulty: string;
  difficultyRating: number;
  score: number;
  grade: string;
  points: number;
  maxPoints: number;
  bannerUrl: string | null;
  mdBannerUrl: string | null;
  smBannerUrl: string | null;
  bannerVariants?: Record<string, unknown> | null;
  timestamp: string;
}

export interface UserSummary {
  pk: string;
  userId: string;
  playerAlias: string;
  totalScore: number;
  totalPoints: number;
  chartsPlayed: number;
  totalPlays: number;
  lastPlayAt: string;
}

export interface ChartMeta {
  chartHash: string;
  songName: string;
  artist: string;
  stepartist: string;
  stepsType: string | null;
  difficulty: string;
  difficultyRating: number;
  bannerUrl: string | null;
  mdBannerUrl: string | null;
  smBannerUrl: string | null;
  bannerVariants?: Record<string, unknown> | null;
  maxPoints: number;
}

interface PaginatedResponse<T> {
  data: T[];
  cursor?: string;
}

async function fetchState<T>(path: string): Promise<T> {
  const res = await fetch(`${STATE_API_URL}${path}`);
  if (!res.ok) throw new Error(`Event API error: ${res.status}`);
  return res.json();
}

// --- Fetch helpers ---

export async function fetchUserBests(userId: string): Promise<{ summary: UserSummary | null; bests: PlayItem[] }> {
  try {
    return await fetchState<{ summary: UserSummary; bests: PlayItem[] }>(`/user/${userId}`);
  } catch {
    return { summary: null, bests: [] };
  }
}

// --- Hooks ---

export function useLeaderboard(pageSize = 50) {
  const [data, setData] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchState<PaginatedResponse<UserSummary>>(`/leaderboard?limit=${pageSize}`)
      .then((res) => {
        if (!cancelled) {
          setData(res.data);
          cursorRef.current = res.cursor || null;
          setHasMore(!!res.cursor);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageSize]);

  const loadMore = useCallback(async () => {
    if (!cursorRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchState<PaginatedResponse<UserSummary>>(`/leaderboard?limit=${pageSize}&cursor=${encodeURIComponent(cursorRef.current)}`);
      setData((prev) => [...prev, ...res.data]);
      cursorRef.current = res.cursor || null;
      setHasMore(!!res.cursor);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, pageSize]);

  return { data, loading, loadingMore, error, hasMore, loadMore };
}

export function useActivity(limit = 50) {
  const [data, setData] = useState<PlayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchState<PaginatedResponse<PlayItem>>(`/activity?limit=${limit}`)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { data, loading, error };
}

export type ChartSort = 'score' | 'time';

export function useChartDetail(chartHash: string, sort: ChartSort = 'score', pageSize = 50) {
  const [chart, setChart] = useState<ChartMeta | null>(null);
  const [scores, setScores] = useState<PlayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setScores([]);
    cursorRef.current = null;
    setHasMore(false);
    fetchState<{ chart: ChartMeta | null; data: PlayItem[]; cursor?: string }>(`/chart/${chartHash}?limit=${pageSize}&sort=${sort}`)
      .then((res) => {
        if (!cancelled) {
          setChart(res.chart);
          setScores(res.data);
          cursorRef.current = res.cursor || null;
          setHasMore(!!res.cursor);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chartHash, sort, pageSize]);

  const loadMore = useCallback(async () => {
    if (!cursorRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchState<{ chart: ChartMeta | null; data: PlayItem[]; cursor?: string }>(
        `/chart/${chartHash}?limit=${pageSize}&sort=${sort}&cursor=${encodeURIComponent(cursorRef.current)}`,
      );
      setScores((prev) => [...prev, ...res.data]);
      cursorRef.current = res.cursor || null;
      setHasMore(!!res.cursor);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [chartHash, loadingMore, pageSize]);

  return { chart, scores, loading, loadingMore, error, hasMore, loadMore };
}

export function useUserDetail(userId: string) {
  const [summary, setSummary] = useState<UserSummary | null>(null);
  const [bests, setBests] = useState<PlayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchState<{ summary: UserSummary; bests: PlayItem[] }>(`/user/${userId}`)
      .then((res) => {
        if (!cancelled) {
          setSummary(res.summary);
          setBests(res.bests);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          // 404 means the user just hasn't submitted any event scores yet
          if (err.message?.includes('404')) {
            setSummary(null);
            setBests([]);
          } else {
            setError(err.message);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { summary, bests, loading, error };
}

export function useEventChartsMeta() {
  const [data, setData] = useState<ChartMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    fetchState<{ data: ChartMeta[] }>('/charts')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}
