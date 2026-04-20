import { useState, useEffect, useCallback } from 'react';
import type { BannerImageVariants } from '@shared/components/ui/BannerImage';

const BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'https://api.arrowcloud.dance';

export interface EventChart {
  id: number;
  eventId: number;
  chartHash: string;
  metadata: Record<string, any>;
  chart: {
    hash: string;
    songName: string | null;
    artist: string | null;
    rating: number | null;
    stepsType: string | null;
    difficulty: string | null;
    meter: number | null;
    stepartist: string | null;
    credit: string | null;
    bannerUrl: string | null;
    mdBannerUrl: string | null;
    smBannerUrl: string | null;
    bannerVariants?: BannerImageVariants | null;
  };
}

export interface EventInfo {
  id: number;
  name: string;
  slug: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export async function fetchEventInfo(eventId: number): Promise<EventInfo> {
  const res = await fetch(`${BASE_URL}/event/${eventId}`);
  if (!res.ok) throw new Error(`Failed to fetch event: ${res.status}`);
  const data = await res.json();
  return data.event;
}

export async function fetchEventCharts(eventId: number, page = 1, limit = 50): Promise<{ data: EventChart[]; meta: PaginationMeta }> {
  const res = await fetch(`${BASE_URL}/event/${eventId}/charts?page=${page}&limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch event charts: ${res.status}`);
  return res.json();
}

export function useEventCharts(eventId: number) {
  const [charts, setCharts] = useState<EventChart[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchEventCharts(eventId, page);
      setCharts(result.data);
      setMeta(result.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load charts');
    } finally {
      setLoading(false);
    }
  }, [eventId, page]);

  useEffect(() => {
    load();
  }, [load]);

  return { charts, meta, loading, error, page, setPage, refresh: load };
}
