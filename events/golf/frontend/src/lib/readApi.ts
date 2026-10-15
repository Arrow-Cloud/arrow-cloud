// Client for the golf backend's public read API (events/golf/backend/README.md). Public reads; fetchCourse also sends the login token.
//
// Always same-origin under /api: CloudFront routes it to the read-api Lambda in production, and
// the dev server proxies it to VITE_GOLF_READ_API_URL (vite.config.js). No base URL lives here.
import { getStoredToken } from '@shared/services/authStorage';

const READ_API_BASE = '/api';

// In dev without VITE_GOLF_READ_API_URL there's no proxy, so /api would get Vite's index.html
// back. Callers show placeholder rows instead. Always false in a production build.
export const showDevPlaceholders = import.meta.env.DEV && !import.meta.env.VITE_GOLF_READ_API_URL;

// One row of GET /activity: a player's most recent eligible play.
export interface ActivityRow {
  playId: number;
  userId: string;
  playerAlias: string;
  /** Image URL, or null for a player with no avatar. */
  profileImageUrl: string | null;
  /** ISO 8601 - when the play finished. */
  timestamp: string;
  courseSlug: string;
  courseName: string;
  holeNumber: number;
  chartHash: string;
  songName: string;
  artist: string;
  /** Null for charts with no par assigned (filtered out of this feed, but typed defensively). */
  par: number | null;
  /** Raw integer: divide by 1000 at render time to get the displayed strokes (3818 -> 3.82). */
  totalStrokes: number;
  noteCount: number;
  /** One 0-200 value per tap note, chronological. Null is defensive - render the row without a plot. */
  noteStrokes: number[] | null;
}

/**
 * `course` is a course slug; the API answers 400 for one it doesn't know. `userIds` restricts the feed to
 * those players: omit it for everyone, and pass `[]` to get an empty feed (not everyone's) - "rivals only"
 * for someone with no rivals must be empty.
 */
export async function fetchActivity(
  { limit, course, userIds }: { limit: number; course?: string; userIds?: string[] },
  signal?: AbortSignal,
): Promise<ActivityRow[]> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (course) qs.set('course', course);
  if (userIds) qs.set('userIds', userIds.join(','));
  const res = await fetch(`${READ_API_BASE}/activity?${qs}`, { signal });
  if (!res.ok) throw new Error(`GET /activity failed: ${res.status}`);
  const body = (await res.json()) as { data: ActivityRow[] };
  return body.data;
}

// One row of GET /courses/{slug}/leaderboard. A raw board: ranks are contiguous and rows are in order.
export interface CourseLeaderboardRow {
  rank: number;
  userId: string;
  alias: string;
  /** Image URL, or null for a player with no avatar. */
  profileImageUrl: string | null;
  /** Raw integer, summed over the holes played so far. Compare to par only when `complete`. */
  totalStrokes: number;
  holesCompleted: number;
  complete: boolean;
}

export interface CourseLeaderboard {
  course: { slug: string; name: string; holesTotal: number };
  /** The whole board, which can be more than `rows` holds. */
  totalPlayers: number;
  limit: number;
  offset: number;
  rows: CourseLeaderboardRow[];
}

// The API caps `limit` at 100. The home page pages through the rows client-side, so it takes the max in one request.
export async function fetchCourseLeaderboard(slug: string, signal?: AbortSignal): Promise<CourseLeaderboard> {
  const res = await fetch(`${READ_API_BASE}/courses/${encodeURIComponent(slug)}/leaderboard?limit=100`, { signal });
  if (!res.ok) throw new Error(`GET /courses/${slug}/leaderboard failed: ${res.status}`);
  return (await res.json()) as CourseLeaderboard;
}

// The session token the main site issued at login, as an Authorization header - or no headers when logged
// out. Send it on reads that personalise (GET /courses/{slug}); the API treats a missing, expired or invalid
// token as anonymous, never as an error, so it is always safe to attach.
function sessionHeaders(): HeadersInit {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// One hole of GET /courses/{slug}.
export interface CourseHole {
  holeNumber: number;
  chartHash: string;
  songName: string;
  artist: string;
  meter: number | null;
  par: number | null;
  /** Optimised 1024x400-shaped WebP, or null when the song has no image - render a fallback. */
  bannerUrl: string | null;
}

export interface Course {
  slug: string;
  name: string;
  order: number;
  description: string | null;
  bannerUrl: string | null;
  holesTotal: number;
  parTotal: number | null;
  holes: CourseHole[];
}

// The viewer's stored best on one hole.
export interface HoleBest {
  chartHash: string;
  /** Raw integer: divide by 1000 at render time. */
  totalStrokes: number;
  /** ISO 8601. */
  achievedAt: string;
}

/**
 * One course. When logged in, `bests` holds the viewer's best on each hole they have played (match to
 * `course.holes` by `chartHash`; unplayed holes are absent) - one request instead of one per hole. It is
 * undefined when logged out or the session is no longer valid.
 */
export async function fetchCourse(slug: string, signal?: AbortSignal): Promise<{ course: Course; bests?: HoleBest[] }> {
  const res = await fetch(`${READ_API_BASE}/courses/${encodeURIComponent(slug)}`, { headers: sessionHeaders(), signal });
  if (!res.ok) throw new Error(`GET /courses/${slug} failed: ${res.status}`);
  return (await res.json()) as { course: Course; bests?: HoleBest[] };
}
