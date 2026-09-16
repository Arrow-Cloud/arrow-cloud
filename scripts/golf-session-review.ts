#!/usr/bin/env tsx
/**
 * Personal-use prototype: pull a real play session and review it through the golf scoring
 * system's lens - per-chart strokes (the actual `calculateGolfStrokes` formula, not a
 * reimplementation), a made-up par to compare against, and the judgment breakdown ITG already
 * computes for every play. Not intended for deployment - local analysis only.
 *
 * Talks only to the public, unauthenticated core API (GET /session/{id}, GET /play/{id}) - no
 * golf-backend/DynamoDB/personal-best-delta involvement, since none of that exists for arbitrary
 * historical sessions anyway.
 *
 * Usage:
 *   npx tsx scripts/golf-session-review.ts <sessionId> [--api <baseUrl>]
 *
 * Example:
 *   npx tsx scripts/golf-session-review.ts 12345
 *   npx tsx scripts/golf-session-review.ts 12345 --api http://localhost:3000
 */

import { calculateGolfStrokes, type GolfScoreResult } from '../api/src/utils/scoring/golf';
import type { Radar, TimingDatum } from '../api/src/utils/scoring/index';

const DEFAULT_API_BASE_URL = 'https://api.arrowcloud.dance';
const SESSION_PAGE_LIMIT = 100; // API max - fewer round-trips for a big session

// --- CLI args ---

function parseArgs(argv: string[]): { sessionId: number; apiBaseUrl: string } {
  let sessionId: number | undefined;
  let apiBaseUrl = DEFAULT_API_BASE_URL;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--api') {
      const next = argv[i + 1];
      if (!next) {
        console.error('Missing value after --api');
        process.exit(1);
      }
      apiBaseUrl = next.replace(/\/$/, '');
      i++;
    } else if (/^\d+$/.test(arg)) {
      sessionId = parseInt(arg, 10);
    }
  }
  if (sessionId == null) {
    console.error('Usage: npx tsx scripts/golf-session-review.ts <sessionId> [--api <baseUrl>]');
    process.exit(1);
  }
  return { sessionId, apiBaseUrl };
}

// --- API response shapes (only the fields this script actually reads) ---

interface SessionPlayChart {
  hash: string;
  title: string | null;
  artist: string | null;
  packName: string | null;
  difficulty: string | null;
  meter: number | null;
}

interface SessionPlay {
  id: number;
  chart: SessionPlayChart;
  leaderboards: { type: string; judgments: Record<string, number> }[];
}

interface SessionResponse {
  id: number;
  userAlias: string;
  startedAt: string;
  endedAt: string;
  playCount: number;
  plays: SessionPlay[];
  pagination: { page: number; limit: number; totalPlays: number; totalPages: number };
}

interface PlayRadarPayload {
  holdsHeld: number;
  holdsTotal: number;
  minesDodged: number;
  minesTotal: number;
  rollsHit: number;
  rollsTotal: number;
}

interface PlayDetailsResponse {
  id: number;
  timingData: TimingDatum[] | null;
  leaderboards: { data: { radar?: PlayRadarPayload | null } }[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchAllSessionPlays(apiBaseUrl: string, sessionId: number): Promise<{ session: SessionResponse; plays: SessionPlay[] }> {
  const first = await fetchJson<SessionResponse>(`${apiBaseUrl}/session/${sessionId}?limit=${SESSION_PAGE_LIMIT}&page=1`);
  const plays = [...first.plays];
  for (let page = 2; page <= first.pagination.totalPages; page++) {
    const next = await fetchJson<SessionResponse>(`${apiBaseUrl}/session/${sessionId}?limit=${SESSION_PAGE_LIMIT}&page=${page}`);
    plays.push(...next.plays);
  }
  return { session: first, plays };
}

function toGolfRadar(payload: PlayRadarPayload | null | undefined): Radar {
  // No hold/mine/roll data on this play (e.g. a chart with none in it) - zero contribution rather
  // than skipping the whole calc, same as calculateGolfStrokes already assumes for a [0, 0] tuple.
  if (!payload) return { Holds: [0, 0], Mines: [0, 0], Rolls: [0, 0] };
  return {
    Holds: [payload.holdsHeld, payload.holdsTotal],
    Mines: [payload.minesDodged, payload.minesTotal],
    Rolls: [payload.rollsHit, payload.rollsTotal],
  };
}

// --- Fabricated par ---
// No real "par" concept exists anywhere in this codebase - this is made up purely for this
// review's sake. About 1 in 4 charts (at least one, if there are any at all) comes in as a bogey
// (actual score a little worse than its par); the rest land a little better than par, so the
// overall round reads as a solid "slightly under par" showing rather than a mix that looks random.
interface ParResult {
  par: number;
  vsPar: number;
  isBogey: boolean;
}

function fabricatePar(scoreDisplay: number, isBogey: boolean): ParResult {
  // Whole numbers, like a real hole's par - derived from the rounded actual score with a
  // guaranteed +/-1+ integer offset (not "round(actual +/- small fraction)", which could collapse
  // to the same integer - or even flip which side of par it lands on - for small actual scores).
  const rounded = Math.round(scoreDisplay);
  const par = isBogey ? Math.max(0, rounded - 1) : rounded + 1 + Math.floor(Math.random() * 2);
  return { par, vsPar: scoreDisplay - par, isBogey };
}

function pickBogeyIndices(chartCount: number): Set<number> {
  const bogeyCount = chartCount === 0 ? 0 : Math.max(1, Math.round(chartCount * 0.2));
  const indices = Array.from({ length: chartCount }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return new Set(indices.slice(0, bogeyCount));
}

// --- Judgments ---

const JUDGMENT_ORDER = ['Fantastic', 'Fantastic (15ms)', 'Fantastic (23ms)', 'Excellent', 'Great', 'Decent', 'Way Off', 'Miss'];

function formatJudgments(judgments: Record<string, number>): string {
  const known = JUDGMENT_ORDER.filter((name) => name in judgments);
  const rest = Object.keys(judgments)
    .filter((name) => !JUDGMENT_ORDER.includes(name))
    .sort();
  return [...known, ...rest].map((name) => `${name} ${judgments[name]}`).join('  ');
}

// --- Formatting ---

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function fmtSigned(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
}

async function main() {
  const { sessionId, apiBaseUrl } = parseArgs(process.argv.slice(2));

  console.log(`Fetching session ${sessionId} from ${apiBaseUrl}...`);
  const { session, plays } = await fetchAllSessionPlays(apiBaseUrl, sessionId);

  console.log();
  console.log(bold(`Session #${session.id} - ${session.userAlias}`));
  console.log(dim(`${session.startedAt} -> ${session.endedAt}  |  ${plays.length} play${plays.length === 1 ? '' : 's'}`));
  console.log(dim('-'.repeat(72)));

  const bogeyIndices = pickBogeyIndices(plays.length);

  for (let i = 0; i < plays.length; i++) {
    const play = plays[i];
    const chart = play.chart;

    let strokes: GolfScoreResult | undefined;
    try {
      const details = await fetchJson<PlayDetailsResponse>(`${apiBaseUrl}/play/${play.id}`);
      if (details.timingData && details.timingData.length > 0) {
        const radarPayload = details.leaderboards.find((lb) => lb.data.radar)?.data.radar;
        strokes = calculateGolfStrokes({ timingData: details.timingData, radar: toGolfRadar(radarPayload) });
      }
    } catch (err) {
      console.error(dim(`  (couldn't fetch play ${play.id}: ${err instanceof Error ? err.message : err})`));
    }

    console.log();
    console.log(bold(`${chart.title ?? '(untitled)'}`) + dim(` — ${chart.artist ?? 'unknown artist'}`));
    console.log(dim(`${chart.packName ?? 'unknown pack'} · ${chart.difficulty ?? '?'} ${chart.meter ?? '?'}`));

    if (strokes) {
      const scoreDisplay = strokes.totalStrokes / 1000;
      const { par, vsPar, isBogey } = fabricatePar(scoreDisplay, bogeyIndices.has(i));
      const vsParLabel = isBogey ? red(`${fmtSigned(vsPar)} (bogey)`) : green(`${fmtSigned(vsPar)} under par`);
      console.log(`  Strokes: ${bold(scoreDisplay.toFixed(2))}   Par: ${par}   ${vsParLabel}`);
    } else {
      console.log(dim('  Strokes: unavailable (no timing data on this play)'));
    }

    if (play.leaderboards.length === 0) {
      console.log(dim('  Judgments: none'));
    } else {
      for (const lb of play.leaderboards) {
        console.log(`  Judgments (${lb.type}): ${formatJudgments(lb.judgments)}`);
      }
    }
  }

  console.log();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
