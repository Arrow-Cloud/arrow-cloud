#!/usr/bin/env tsx
/**
 * Local feasibility test for rendering the pack-leaderboard "results card" with satori + resvg
 * instead of headless Chromium (share-service). Entirely local - no AWS, no DB, mock data only.
 *
 * Renders a mock pack-leaderboard results card to a PNG and logs timing for the satori layout
 * pass and the resvg rasterization pass separately, so we can confirm rendering is comfortably
 * under the ~500ms target before investing in the real backend/rendering pipeline.
 *
 * Usage:
 *   npx tsx scripts/satori-poc.ts [--font <path>] [--font-bold <path>] [--logo <path>] [--out <path>] [--runs <n>]
 *
 * Examples:
 *   npx tsx scripts/satori-poc.ts
 *   npx tsx scripts/satori-poc.ts --font /path/to/Inter-Regular.ttf --font-bold /path/to/Inter-Bold.ttf
 *   npx tsx scripts/satori-poc.ts --runs 20   # average timings over multiple renders (post-warm-up)
 *
 * Notes:
 * - satori needs font data as an in-memory buffer up front - it cannot fetch @font-face URLs at
 *   render time (unlike share-service's Chromium templates, which pull fonts from Google Fonts
 *   live). This is the mechanism that removes that entire class of slowness.
 * - No brand font files exist in this repo yet (share-service pulls 'Miso'/'Azeret Mono' from
 *   Google Fonts CSS at render time). Defaults below point at system DejaVu Sans fonts just to
 *   get a real render + real timings; swap in the actual brand fonts (as local .ttf files) once
 *   sourced, via --font/--font-bold.
 * - Raster images work the same way: satori embeds whatever `src` an <img> is given directly into
 *   the output SVG, and resvg does NOT fetch remote URLs at render time - so, same as fonts, any
 *   image needs to be loaded locally and passed in as a data URI up front. scripts/assets/ac-logo.png
 *   is a one-time local copy of the same logo share-service's templates already reference remotely
 *   (https://assets.arrowcloud.dance/logos/20250725/ac%20logo.png) - swap via --logo if needed.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// Target aspect ratio 1:1.25 (taller than wide) - a fixed canvas size regardless of how many
// leaderboards a given player has configured; content doesn't need to fill it, but the client
// gets a consistent image size to lay out every time.
// Rendered at 2x the original 480x600 design so it stays sharp on high-DPI displays - every
// layout value below is scaled via s().
const SCALE = 2;
const s = (n: number) => n * SCALE;
const CARD_WIDTH = s(480);
const CARD_HEIGHT = s(600);

// Matches the leaderboard color convention already established across the frontend
// (frontend/src/types/leaderboards.ts, SessionPage.tsx, PackLeaderboardPanel.tsx).
const LEADERBOARD_COLORS: Record<string, string> = {
  HardEX: '#FF69B4',
  EX: '#21CCE8',
  ITG: '#FFFFFF',
  ITGRate: '#C9C9FF',
  EXRate: '#7BE0F0',
};

// Matches the existing green/red delta convention (SessionPage.tsx, PackLeaderboardPanel.tsx).
const DELTA_UP = '#36d399';
const DELTA_DOWN = '#f87272';

// Matches the existing difficulty label convention (PackLeaderboardPanel.tsx's DIFFICULTY_LABELS).
const DIFFICULTY_LABELS: Record<'medium' | 'hard' | 'challenge', string> = { medium: 'Medium', hard: 'Hard', challenge: 'Expert' };

// Title treatment gradient - reuses two of the leaderboard accent colors (EX cyan -> HardEX pink)
// so the "flashy" title ties back into the same color language as the leaderboard tiles below it.
const TITLE_GRADIENT: [string, string] = [LEADERBOARD_COLORS.EX, LEADERBOARD_COLORS.HardEX];

// Real chart-points curve (api/src/utils/pack-leaderboard.ts's scoreToCurvedPoints): 1000 max per
// chart, flat 200 for any score up to 80%, then 8 buckets of 100 points each from 80->100. This is
// a rough approximation of that curve for mock purposes only (no need to reproduce it exactly).
function approxChartPoints(score: number): number {
  if (score <= 80) return (score / 80) * 200;
  const buckets = [80, 85, 90, 92, 94, 96, 98, 99, 100];
  for (let i = 0; i < buckets.length - 1; i++) {
    const [lo, hi] = [buckets[i], buckets[i + 1]];
    if (score <= hi) return 200 + i * 100 + ((score - lo) / (hi - lo)) * 100;
  }
  return 1000;
}

interface MockResultsCardEntry {
  leaderboardKey: keyof typeof LEADERBOARD_COLORS;
  label: string;
  score: number; // 0-100, this play's score on the chart
  scoreDelta: number; // vs. previous best on this chart, percentage points
  chartPoints: number; // 0-1000 max, this chart's curved points at the new score
  chartPointsDelta: number; // vs. previous best on this chart, always within +/-1000
  packTotal: number; // sum of curved points across every chart in the pack (31 charts here, so 0-31000 max)
  packTotalDelta: number; // always equal to chartPointsDelta - a play only ever changes one chart's contribution
  rank: number;
  totalParticipants: number;
}

interface MockResultsCardData {
  playerAlias: string;
  chartTitle: string;
  chartArtist: string;
  packName: string;
  packChartCount: number;
  difficulty: 'medium' | 'hard' | 'challenge';
  meter: number;
  entries: MockResultsCardEntry[];
}

// A play only ever changes ONE chart's contribution to a pack total, so chartPointsDelta and
// packTotalDelta are always the same value - build entries from (score, previousScore, packTotal)
// rather than inventing the two deltas independently.
function buildEntry(
  leaderboardKey: keyof typeof LEADERBOARD_COLORS,
  label: string,
  score: number,
  previousScore: number,
  packTotalBefore: number,
  rank: number,
  totalParticipants: number,
): MockResultsCardEntry {
  // Mirrors computePackResultImages: chart points track your BEST-EVER score on the chart, so a
  // replay that didn't improve on it can't drag them down - scoreDelta is the only figure allowed
  // to go negative. Both are floored (never rounded to nearest) and the delta is derived from the
  // already-floored values, so after - before === delta exactly.
  const effectiveScore = Math.max(score, previousScore);
  const chartPoints = Math.floor(approxChartPoints(effectiveScore));
  const chartPointsBefore = Math.floor(approxChartPoints(previousScore));
  const chartPointsDelta = chartPoints - chartPointsBefore;
  return {
    leaderboardKey,
    label,
    score,
    scoreDelta: Math.round((score - previousScore) * 100) / 100,
    chartPoints,
    chartPointsDelta,
    packTotal: packTotalBefore + chartPointsDelta,
    packTotalDelta: chartPointsDelta,
    rank,
    totalParticipants,
  };
}

const MOCK_DATA: MockResultsCardData = {
  playerAlias: 'Wafles',
  chartTitle: 'Crystal Clearer',
  chartArtist: 'modus',
  packName: "Snap's Schmoovement Saga 2",
  packChartCount: 31,
  difficulty: 'challenge',
  meter: 12,
  entries: [
    buildEntry('HardEX', 'H.EX', 91.23, 92.1, 24350, 4, 66),
    buildEntry('EX', 'EX', 96.45, 95.25, 30180, 1, 66),
    buildEntry('ITG', 'ITG', 94.1, 94.1, 27100, 2, 66),
  ],
};

// --- POC-only: "song leaderboard page" images (images 2..n) -----------------------------------
// Experimental, not the intended long-term design - just enough to preview a multi-image response
// shape (one page per preferred leaderboard, each a ranked player list) so the game client dev can
// start building pagination support against something real.
//
// These rank players by their best score on the chart that was just played. The summary card
// (image 1) is the pack-scoped half of the pair - pack totals, pack rank - and these are the
// song-scoped half, which is why a player's rank here and on the card legitimately differ.
//
// Selection follows the same "top + rivals + nearby-you" convention already established elsewhere
// (api/src/controllers/leaderboard.ts's in-game/site leaderboard endpoint, and the streamer widget's
// buildNearbyPlayers in api/src/controllers/widget.ts) rather than a flat top-N: top 2, your own row,
// your immediate neighbors (rank ±1), your top-ranked rival, your nearest-by-rank rival, then filled
// out to a target size with whatever's closest to your rank. The rank number on each row already
// makes any gap in the sequence obvious, so no separate "gap" divider is needed.
interface MockLeaderboardRanking {
  rank: number;
  alias: string;
  score: number; // 0-100, this player's best on THIS chart (not a pack total)
  points: number; // 0-1000, that score's curved chart points - what it adds to their pack total
  // Set only on the viewer's own row, when this play didn't improve on their existing best - i.e.
  // the score in this row predates the play that triggered the image.
  isPreviousBest: boolean;
  isSelf: boolean;
  isRival: boolean;
}

interface MockLeaderboardPageData {
  leaderboardKey: keyof typeof LEADERBOARD_COLORS;
  label: string;
  packName: string;
  chartTitle: string;
  chartArtist: string;
  difficulty: 'medium' | 'hard' | 'challenge';
  meter: number;
  page: number;
  totalPages: number;
  totalParticipants: number;
  rankings: MockLeaderboardRanking[]; // full field, pre-selection - see selectNearbyRankings
}

const LEADERBOARD_PAGE_TOP_N = 2; // matches leaderboard.ts's top2Entries
const LEADERBOARD_PAGE_TARGET_SIZE = 7; // matches leaderboard.ts's default MIN_SIZE
const PAGE_POINTS_COL_WIDTH = s(72);
const PAGE_SCORE_COL_WIDTH = s(96);

// Right-aligned column header over one of the numeric columns, matching that column's width.
function columnHeader(label: string, width: number) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        width,
        justifyContent: 'flex-end',
        fontFamily: 'Miso',
        fontSize: s(14),
        fontWeight: 700,
        letterSpacing: s(1),
        color: 'rgba(255,255,255,0.6)',
        marginBottom: s(3),
      },
    },
    label,
  );
}

const RIVAL_COLOR = DELTA_DOWN; // reuse the existing red rather than invent a new accent

function selectNearbyRankings(rankings: MockLeaderboardRanking[]): MockLeaderboardRanking[] {
  const selfEntry = rankings.find((r) => r.isSelf);
  const top = rankings.filter((r) => r.rank <= LEADERBOARD_PAGE_TOP_N);
  const neighbors = selfEntry ? rankings.filter((r) => r.rank === selfEntry.rank - 1 || r.rank === selfEntry.rank + 1) : [];

  const rivalsByRank = rankings.filter((r) => r.isRival).sort((a, b) => a.rank - b.rank);
  const topRival = rivalsByRank[0];
  let nearestRival: MockLeaderboardRanking | undefined;
  if (selfEntry && rivalsByRank.length) {
    const byDistance = [...rivalsByRank].sort((a, b) => Math.abs(a.rank - selfEntry.rank) - Math.abs(b.rank - selfEntry.rank));
    nearestRival = byDistance[0] === topRival && byDistance.length > 1 ? byDistance[1] : byDistance[0];
  }

  const byAlias = new Map<string, MockLeaderboardRanking>();
  const add = (r?: MockLeaderboardRanking) => {
    if (r && !byAlias.has(r.alias)) byAlias.set(r.alias, r);
  };
  top.forEach(add);
  add(selfEntry);
  neighbors.forEach(add);
  add(topRival);
  add(nearestRival);

  if (byAlias.size < LEADERBOARD_PAGE_TARGET_SIZE && selfEntry) {
    const remaining = rankings.filter((r) => !byAlias.has(r.alias)).sort((a, b) => Math.abs(a.rank - selfEntry.rank) - Math.abs(b.rank - selfEntry.rank));
    for (const r of remaining) {
      if (byAlias.size >= LEADERBOARD_PAGE_TARGET_SIZE) break;
      byAlias.set(r.alias, r);
    }
  }

  return Array.from(byAlias.values()).sort((a, b) => a.rank - b.rank);
}

// A wide-enough pool to build a believable 66-participant field per leaderboard.
const MOCK_NAME_POOL = [
  'Nova',
  'Kirei',
  'Jynx',
  'Prism',
  'Solace',
  'Ducky',
  'Rune',
  'Echo',
  'Vex',
  'Halcyon',
  'Frostbyte',
  'Comet',
  'Nyx',
  'Zephyr',
  'Quill',
  'Orin',
  'Sable',
  'Lumen',
  'Marrow',
  'Kestrel',
  'Thistle',
  'Onyx',
  'Wisp',
  'Talon',
  'Ashen',
  'Brine',
  'Cypher',
  'Drift',
  'Ember',
  'Flux',
  'Grimm',
  'Hollow',
  'Iris',
  'Jolt',
  'Kite',
  'Lace',
  'Mote',
  'Null',
  'Opal',
  'Pyre',
  'Quartz',
  'Rift',
  'Static',
  'Torque',
  'Umbra',
  'Vane',
  'Wren',
  'Xeno',
  'Yara',
  'Zed',
  'Basalt',
  'Cinder',
  'Delta',
  'Eave',
  'Feral',
  'Glint',
  'Husk',
  'Ion',
  'Jade',
  'Karma',
  'Loom',
  'Mire',
  'Nix',
  'Ochre',
  'Petra',
  'Quill2',
];

function buildMockChartRankings(opts: {
  topScore: number;
  bottomScore: number;
  selfScore: number;
  // Whether self's row is a score they already had rather than the one they just danced - i.e. the
  // play that triggered these images missed (or tied) their existing PB.
  selfIsPreviousBest: boolean;
  rivalAliases: string[];
}): MockLeaderboardRanking[] {
  // One continuous score curve across the field, then self is inserted at the position its own
  // score actually earns - rather than at a rank picked by hand, which could contradict the score
  // the summary card shows for the same leaderboard.
  const field = MOCK_NAME_POOL.map((alias, i) => {
    const t = i / (MOCK_NAME_POOL.length - 1);
    return { alias, score: Math.round((opts.topScore - t * (opts.topScore - opts.bottomScore)) * 100) / 100 };
  });
  const selfIndex = field.findIndex((f) => f.score < opts.selfScore);
  field.splice(selfIndex === -1 ? field.length : selfIndex, 0, { alias: 'Wafles', score: opts.selfScore });
  return field.map((f, i) => ({
    rank: i + 1,
    alias: f.alias,
    score: f.score,
    points: Math.floor(approxChartPoints(f.score)),
    isSelf: f.alias === 'Wafles',
    isPreviousBest: f.alias === 'Wafles' && opts.selfIsPreviousBest,
    isRival: opts.rivalAliases.includes(f.alias),
  }));
}

// totalParticipants is derived from the field rather than hard-coded - on a song leaderboard it's
// "players with a score on this chart", which is exactly the length of the generated field.
function mockPage(
  leaderboardKey: keyof typeof LEADERBOARD_COLORS,
  label: string,
  page: number,
  opts: Parameters<typeof buildMockChartRankings>[0],
): MockLeaderboardPageData {
  const rankings = buildMockChartRankings(opts);
  return {
    leaderboardKey,
    label,
    packName: MOCK_DATA.packName,
    chartTitle: MOCK_DATA.chartTitle,
    chartArtist: MOCK_DATA.chartArtist,
    difficulty: MOCK_DATA.difficulty,
    meter: MOCK_DATA.meter,
    page,
    totalPages: 3,
    totalParticipants: rankings.length,
    rankings,
  };
}

// A leaderboard row is a player's BEST score on the chart, so self's score here is max(this play,
// previous best) - which is what the card's CHART PTS is computed from too, hence the two images
// always agreeing on points. H.EX is the interesting case: the 91.23% just danced was a miss on an
// existing 92.10%, so the board still shows 92.10% while the card shows the play (91.23%, -0.87%).
// The rank self lands at is this chart's rank, which is NOT the card's pack rank - that's the
// whole point of the pair.
const MOCK_LEADERBOARD_PAGES: MockLeaderboardPageData[] = [
  // Nova tops the chart as a rival; Kite sits well below Wafles as the nearest-by-rank rival.
  mockPage('HardEX', 'H.EX', 1, { topScore: 96.84, bottomScore: 71.2, selfScore: 92.1, selfIsPreviousBest: true, rivalAliases: ['Nova', 'Kite'] }),
  mockPage('EX', 'EX', 2, { topScore: 98.91, bottomScore: 80.4, selfScore: 96.45, selfIsPreviousBest: false, rivalAliases: ['Kirei', 'Solace'] }),
  // A tie counts as "didn't improve", so this one carries the tag too.
  mockPage('ITG', 'ITG', 3, { topScore: 99.42, bottomScore: 86.1, selfScore: 94.1, selfIsPreviousBest: true, rivalAliases: ['Jynx', 'Rift'] }),
];

function buildLeaderboardPage(data: MockLeaderboardPageData, logoDataUri: string) {
  const LOGO_SIZE = s(340);
  const color = LEADERBOARD_COLORS[data.leaderboardKey];
  return h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: '#141414',
        padding: s(20),
        fontFamily: 'Nunito',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
      },
    },
    h('img', {
      src: logoDataUri,
      width: LOGO_SIZE,
      height: LOGO_SIZE,
      style: { position: 'absolute', top: (CARD_HEIGHT - LOGO_SIZE) / 2, left: (CARD_WIDTH - LOGO_SIZE) / 2, opacity: 0.06 },
    }),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: s(16) } },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: s(10), marginBottom: s(8) } },
        h('div', {
          style: { display: 'flex', width: s(28), height: s(2), backgroundImage: `linear-gradient(90deg, transparent, ${TITLE_GRADIENT[1]})` },
        }),
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontFamily: 'Miso',
              fontSize: s(26),
              fontWeight: 800,
              letterSpacing: s(3),
              textTransform: 'uppercase',
              backgroundImage: `linear-gradient(90deg, ${TITLE_GRADIENT[0]}, ${TITLE_GRADIENT[1]})`,
              backgroundClip: 'text',
              color: 'transparent',
            },
          },
          'Song Leaderboard',
        ),
        h('div', {
          style: { display: 'flex', width: s(28), height: s(2), backgroundImage: `linear-gradient(270deg, transparent, ${TITLE_GRADIENT[0]})` },
        }),
      ),
      // Pack name as a demoted kicker rather than the headline (the summary card is the other way
      // round): the ranking below is chart-scoped, so the chart is the subject here. It still has
      // to appear, though - a chart can belong to more than one leaderboard-eligible pack, and
      // each of those packs produces its own set of images.
      truncatedLine(data.packName, CARD_WIDTH - s(40), {
        fontFamily: 'Miso',
        fontSize: s(16),
        fontWeight: 700,
        letterSpacing: s(2),
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.5)',
      }),
      // Song title and artist on their own lines, each independently truncated - either one alone
      // can be long enough to clip, and cramming both onto one line only made that worse.
      truncatedLine(data.chartTitle, CARD_WIDTH - s(40), { fontSize: s(19), fontWeight: 700, marginTop: s(2) }),
      truncatedLine(data.chartArtist, CARD_WIDTH - s(40), { fontSize: s(12), color: 'rgba(255,255,255,0.6)', marginTop: s(1) }),
      h(
        'div',
        { style: { display: 'flex', fontSize: s(12), color: 'rgba(255,255,255,0.5)', marginTop: s(3) } },
        `${DIFFICULTY_LABELS[data.difficulty]} ${data.meter}`,
      ),
    ),
    // Which leaderboard this page shows, and what the numbers down the right-hand side are. The
    // horizontal padding matches the ranking rows below so both columns line up with their header.
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'flex-end',
          padding: `0 ${s(8)}px`,
          marginBottom: s(10),
          paddingBottom: s(10),
          borderBottom: `${s(1)}px solid rgba(255,255,255,0.08)`,
        },
      },
      h('div', { style: { display: 'flex', flex: 1, fontFamily: 'Miso', fontSize: s(28), fontWeight: 700, color } }, data.label),
      columnHeader('PTS', PAGE_POINTS_COL_WIDTH),
      columnHeader('SCORE', PAGE_SCORE_COL_WIDTH),
    ),
    (() => {
      const selected = selectNearbyRankings(data.rankings);
      const rows: Node[] = [];
      selected.forEach((r, i) => {
        const nameColor = r.isSelf ? color : r.isRival ? RIVAL_COLOR : '#ffffff';
        rows.push(
          h(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                padding: `${s(10)}px ${s(8)}px`,
                backgroundColor: r.isSelf ? 'rgba(255,255,255,0.06)' : 'transparent',
                borderBottom: i < selected.length - 1 ? `${s(1)}px solid rgba(255,255,255,0.06)` : 'none',
              },
            },
            h(
              'div',
              { style: { display: 'flex', width: s(36), fontSize: s(18), fontWeight: 700, color: r.isSelf ? color : 'rgba(255,255,255,0.5)' } },
              `${r.rank}`,
            ),
            h(
              'div',
              {
                style: {
                  display: 'flex',
                  flex: 1,
                  minWidth: 0, // without this, a flex item won't shrink past its content's intrinsic width - overflow/ellipsis would never trigger
                  fontSize: s(18),
                  fontWeight: r.isSelf || r.isRival ? 700 : 400,
                  color: nameColor,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
              r.alias,
            ),
            // Only ever on the viewer's own row, and only when the play that produced this image
            // didn't beat what they already had. Without it the row looks wrong next to the summary
            // card, which reports the play itself - a leaderboard shows your best, so a missed PB
            // leaves the older, higher score sitting here.
            r.isPreviousBest &&
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexShrink: 0,
                    marginLeft: s(8),
                    padding: `${s(2)}px ${s(6)}px`,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    fontFamily: 'Miso',
                    fontSize: s(13),
                    fontWeight: 700,
                    letterSpacing: s(1),
                    color: 'rgba(255,255,255,0.55)',
                  },
                },
                'PREVIOUS PB',
              ),
            // Curved chart points next to the raw percentage: points are what this chart contributes to
            // the pack total on the summary card, the percentage is what was actually danced. Ranking by
            // either gives the same order (points are a monotonic function of score), so showing both
            // can't contradict the rank beside it.
            h(
              'div',
              {
                style: {
                  display: 'flex',
                  width: PAGE_POINTS_COL_WIDTH,
                  justifyContent: 'flex-end',
                  fontSize: s(16),
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.55)',
                },
              },
              fmtPoints(r.points),
            ),
            h(
              'div',
              { style: { display: 'flex', width: PAGE_SCORE_COL_WIDTH, justifyContent: 'flex-end', fontSize: s(18), fontWeight: 700 } },
              `${r.score.toFixed(2)}%`,
            ),
          ),
        );
      });
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        ...rows,
        h(
          'div',
          { style: { display: 'flex', justifyContent: 'center', marginTop: s(14), fontSize: s(12), color: 'rgba(255,255,255,0.4)' } },
          `${data.totalParticipants} players on this chart`,
        ),
      );
    })(),
  );
}

// --- Tiny hyperscript helper so we don't need JSX/tsconfig changes for a standalone script ---
type Node = { type: string; props: Record<string, unknown> };
type Child = Node | string | null | undefined | false;
function h(type: string, props: Record<string, unknown> = {}, ...children: (Child | Child[])[]): Node {
  const flatChildren = children.flat().filter((c): c is Node | string => c !== null && c !== undefined && c !== false);
  return { type, props: { ...props, children: flatChildren.length === 1 ? flatChildren[0] : flatChildren } };
}

// Pack names, chart titles, artist names, and player aliases are all unbounded-length user content -
// this card is a fixed width, so any of them can otherwise clip against the edge or overlap other
// text. satori does correctly support the standard CSS truncation combo, overflow:hidden +
// textOverflow:ellipsis + whiteSpace:nowrap (verified directly - it's not a given every satori
// feature works, e.g. border-based CSS triangles render as solid blocks instead)... but ONLY when
// the text is left-aligned. Pairing that combo with justifyContent:'center' on centered headings
// (which every one of these fields is) breaks satori's overflow calculation - text still gets an
// ellipsis, but also silently clips off the *left* edge with no indicator, which is worse than the
// plain clipping this is meant to fix. There's no reliable way to detect a satori text overflow
// after the fact, so this estimates the rendered width up front (average glyph width for this
// family) and only centers when that estimate comfortably fits - genuinely-too-long text instead
// falls back to left-aligned + ellipsis, which satori renders correctly. A short/normal name (the
// overwhelming majority) is unaffected either way.
const AVG_CHAR_WIDTH_RATIO = 0.56;
function truncatedLine(text: string, maxWidthPx: number, style: Record<string, unknown> = {}) {
  const fontSize = (style.fontSize as number | undefined) ?? s(16);
  const fits = text.length * fontSize * AVG_CHAR_WIDTH_RATIO <= maxWidthPx;
  return h(
    'div',
    {
      style: {
        display: 'flex',
        width: '100%',
        minWidth: 0,
        justifyContent: fits ? 'center' : 'flex-start',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...style,
      },
    },
    text,
  );
}

// Always floors, never rounds to nearest - a player should never see more points than earned.
function fmtPoints(n: number): string {
  const floored = Math.floor(n);
  if (floored >= 100000) return `${Math.floor(floored / 1000)}k`;
  if (floored >= 10000) return `${Math.floor(floored / 100) / 10}k`;
  return floored.toLocaleString();
}

function fmtPointsDelta(delta: number): { text: string; color: string } {
  if (delta > 0) return { text: `+${fmtPoints(delta)}`, color: DELTA_UP };
  if (delta < 0) return { text: `-${fmtPoints(Math.abs(delta))}`, color: DELTA_DOWN };
  return { text: '±0', color: 'rgba(255,255,255,0.5)' };
}

function fmtScoreDelta(delta: number): { text: string; color: string } {
  if (delta > 0) return { text: `+${delta.toFixed(2)}%`, color: DELTA_UP };
  if (delta < 0) return { text: `-${Math.abs(delta).toFixed(2)}%`, color: DELTA_DOWN };
  return { text: '±0.00%', color: 'rgba(255,255,255,0.5)' };
}

function buildCard(data: MockResultsCardData, logoDataUri: string) {
  const LOGO_SIZE = s(340);
  return h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: '#141414',
        padding: s(20),
        fontFamily: 'Nunito',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
      },
    },
    // Subtle background watermark - painted first so later (foreground) content sits on top of it.
    h('img', {
      src: logoDataUri,
      width: LOGO_SIZE,
      height: LOGO_SIZE,
      style: {
        position: 'absolute',
        top: (CARD_HEIGHT - LOGO_SIZE) / 2,
        left: (CARD_WIDTH - LOGO_SIZE) / 2,
        opacity: 0.06,
      },
    }),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: s(16) } },
      // Flashy eyebrow title: gradient-filled text flanked by matching gradient bars.
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: s(10), marginBottom: s(8) } },
        h('div', {
          style: { display: 'flex', width: s(28), height: s(2), backgroundImage: `linear-gradient(90deg, transparent, ${TITLE_GRADIENT[1]})` },
        }),
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontFamily: 'Miso',
              fontSize: s(26),
              fontWeight: 800,
              letterSpacing: s(3),
              textTransform: 'uppercase',
              backgroundImage: `linear-gradient(90deg, ${TITLE_GRADIENT[0]}, ${TITLE_GRADIENT[1]})`,
              backgroundClip: 'text',
              color: 'transparent',
            },
          },
          'Pack Leaderboard',
        ),
        h('div', {
          style: { display: 'flex', width: s(28), height: s(2), backgroundImage: `linear-gradient(270deg, transparent, ${TITLE_GRADIENT[0]})` },
        }),
      ),
      truncatedLine(data.packName, CARD_WIDTH - s(40), { fontSize: s(19), fontWeight: 700 }),
      // Song title and artist on their own lines, each independently truncated - either one alone
      // can be long enough to clip, and cramming both onto one line (as this used to) only made
      // that worse.
      truncatedLine(data.chartTitle, CARD_WIDTH - s(40), { fontSize: s(13), fontWeight: 700, marginTop: s(4) }),
      truncatedLine(data.chartArtist, CARD_WIDTH - s(40), { fontSize: s(12), color: 'rgba(255,255,255,0.6)', marginTop: s(1) }),
      h(
        'div',
        { style: { display: 'flex', fontSize: s(12), color: 'rgba(255,255,255,0.5)', marginTop: s(3) } },
        `${DIFFICULTY_LABELS[data.difficulty]} ${data.meter}`,
      ),
    ),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: s(10) } },
      ...data.entries.map((entry) => {
        const scoreDelta = fmtScoreDelta(entry.scoreDelta);
        const chartPointsDelta = fmtPointsDelta(entry.chartPointsDelta);
        const color = LEADERBOARD_COLORS[entry.leaderboardKey];

        // A stat with a small label above a big value (+ optional delta) - reused for all four quadrants.
        const stat = (label: string, value: string, delta?: { text: string; color: string }, align: 'left' | 'right' = 'left') =>
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', flex: 1, alignItems: align === 'right' ? 'flex-end' : 'flex-start' } },
            h(
              'div',
              { style: { display: 'flex', fontFamily: 'Miso', fontSize: s(13), fontWeight: 700, letterSpacing: s(1), color: 'rgba(255,255,255,0.6)' } },
              label,
            ),
            h(
              'div',
              // satori's 'baseline' alignment doesn't line up cleanly when both children are
              // themselves flex containers wrapping plain text (each one's own div wrapper), so
              // align on the bottom edge instead - the two font sizes share a bottom-heavy look.
              { style: { display: 'flex', alignItems: 'flex-end', gap: s(6) } },
              h('div', { style: { display: 'flex', fontSize: s(20), fontWeight: 700 } }, value),
              delta && h('div', { style: { display: 'flex', fontSize: s(12), fontWeight: 700, color: delta.color, marginBottom: s(3) } }, delta.text),
            ),
          );

        return h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: s(0),
              padding: s(12),
              gap: s(10),
            },
          },
          // Top row: scoring system name (+ rank tucked underneath) | score + delta
          h(
            'div',
            { style: { display: 'flex' } },
            h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', flex: 1 } },
              h('div', { style: { display: 'flex', fontFamily: 'Miso', fontSize: s(24), fontWeight: 700, color } }, entry.label),
              // Explicitly "Pack #" now that images 2..n show this player's rank on the song
              // itself - the two numbers are different things and sit one swipe apart.
              h('div', { style: { display: 'flex', fontSize: s(11), color: 'rgba(255,255,255,0.5)' } }, `Pack #${entry.rank} of ${entry.totalParticipants}`),
            ),
            stat('SCORE', `${entry.score.toFixed(2)}%`, scoreDelta, 'right'),
          ),
          // Bottom row: pack total | chart points + delta
          h(
            'div',
            { style: { display: 'flex', paddingTop: s(8), borderTop: `${s(1)}px solid rgba(255,255,255,0.08)` } },
            stat('PACK TOTAL', fmtPoints(entry.packTotal)),
            stat('CHART PTS', `${fmtPoints(entry.chartPoints)} / 1k`, chartPointsDelta, 'right'),
          ),
        );
      }),
    ),
  );
}

function parseArgs(argv: string[]) {
  const get = (flag: string, fallback: string) => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : fallback;
  };
  return {
    // Same two fonts the live site uses for its own "share-style" renders (see share-service's
    // image-template.ts and frontend/index.html) - Miso for flashy display/label text, Nunito for
    // body/numeric content. Both are variable fonts (one file covers the whole weight range).
    bodyFontPath: get('--font', path.resolve('scripts/assets/fonts/nunito-400.woff')),
    bodyFontBoldPath: get('--font-bold', path.resolve('scripts/assets/fonts/nunito-800.woff')),
    labelFontPath: get('--font-label', path.resolve('scripts/assets/fonts/miso-light.ttf')),
    logoPath: get('--logo', path.resolve('scripts/assets/ac-logo.png')),
    outPath: get('--out', path.resolve('scripts/output/pack-leaderboard-poc.png')),
    runs: parseInt(get('--runs', '1'), 10) || 1,
  };
}

async function main() {
  const { bodyFontPath, bodyFontBoldPath, labelFontPath, logoPath, outPath, runs } = parseArgs(process.argv.slice(2));

  console.log(`Loading fonts:\n  body (Nunito):       ${bodyFontPath}\n  body bold (Nunito):  ${bodyFontBoldPath}\n  label (Miso):        ${labelFontPath}`);
  const [bodyData, bodyBoldData, labelData] = [readFileSync(bodyFontPath), readFileSync(bodyFontBoldPath), readFileSync(labelFontPath)];

  const fonts = [
    { name: 'Nunito', data: bodyData, weight: 400 as const, style: 'normal' as const },
    { name: 'Nunito', data: bodyBoldData, weight: 700 as const, style: 'normal' as const },
    { name: 'Miso', data: labelData, weight: 700 as const, style: 'normal' as const },
    { name: 'Miso', data: labelData, weight: 800 as const, style: 'normal' as const },
  ];

  console.log(`Loading logo: ${logoPath}`);
  const logoDataUri = `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`;

  const tree = buildCard(MOCK_DATA, logoDataUri);

  const satoriTimes: number[] = [];
  const resvgTimes: number[] = [];
  let pngBuffer: Buffer = Buffer.alloc(0);

  for (let i = 0; i < runs; i++) {
    const satoriStart = performance.now();
    const svg = await satori(tree as never, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts });
    satoriTimes.push(performance.now() - satoriStart);

    const resvgStart = performance.now();
    const resvgInstance = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } });
    pngBuffer = Buffer.from(resvgInstance.render().asPng());
    resvgTimes.push(performance.now() - resvgStart);
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, pngBuffer);

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const fmt = (ms: number) => `${ms.toFixed(1)}ms`;

  console.log(`\nWrote ${outPath} (${pngBuffer.length} bytes)`);
  console.log(`\nRuns: ${runs}`);
  console.log(`satori (layout -> SVG):   avg ${fmt(avg(satoriTimes))}  first ${fmt(satoriTimes[0])}  last ${fmt(satoriTimes[satoriTimes.length - 1])}`);
  console.log(`resvg (SVG -> PNG):       avg ${fmt(avg(resvgTimes))}  first ${fmt(resvgTimes[0])}  last ${fmt(resvgTimes[resvgTimes.length - 1])}`);
  const totalAvg = avg(satoriTimes) + avg(resvgTimes);
  console.log(`total (avg):              ${fmt(totalAvg)}`);
  console.log(totalAvg < 500 ? '\n✅ well under the 500ms target' : '\n⚠️  at/over the 500ms target');

  // Multi-image POC: one "leaderboard page" per preferred leaderboard, previewing what a
  // paginated resultImages response could look like (images 2..n). See buildLeaderboardPage.
  console.log(`\nRendering ${MOCK_LEADERBOARD_PAGES.length} leaderboard pages...`);
  for (const pageData of MOCK_LEADERBOARD_PAGES) {
    const pageTree = buildLeaderboardPage(pageData, logoDataUri);
    const pageSvg = await satori(pageTree as never, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts });
    const pageResvg = new Resvg(pageSvg, { fitTo: { mode: 'width', value: CARD_WIDTH } });
    const pagePng = Buffer.from(pageResvg.render().asPng());
    const pageOutPath = path.resolve(`scripts/output/pack-leaderboard-page-${pageData.page}.png`);
    writeFileSync(pageOutPath, pagePng);
    console.log(`Wrote ${pageOutPath} (${pagePng.length} bytes)`);
  }
}

main().catch((err) => {
  console.error('satori-poc failed:', err);
  process.exit(1);
});
