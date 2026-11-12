export const SCORES_PREFIX = 'scores/';
export const ARCHIVE_PREFIX = 'archive/';
export const MANIFEST_KEY = `${ARCHIVE_PREFIX}manifest.json`;

export interface ScoreObject {
  key: string;
  size: number;
  /** Server receive time */
  timestampMs: number;
  /** UTC `YYYY-MM` of `timestampMs` */
  month: string;
}

const SCORE_KEY = /^scores\/[^/]+\/[^/]+\/(\d+)\.json$/;
export const MONTH = /^\d{4}-\d{2}$/;

export function monthOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function parseScoreKey(key: string, size: number): ScoreObject | null {
  const match = SCORE_KEY.exec(key);
  if (!match) return null;
  const timestampMs = Number(match[1]);
  const month = monthOf(new Date(timestampMs));
  if (!MONTH.test(month)) return null;
  return { key, size, timestampMs, month };
}

export function archiveKey(month: string): string {
  return `${ARCHIVE_PREFIX}scores-${month}.tar.zst`;
}

export const CACHE_CONTROL = 'no-cache';
