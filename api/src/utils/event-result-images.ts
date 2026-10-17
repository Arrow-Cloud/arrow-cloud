import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { Play } from '../../prisma/generated';
import type { PrismaClient } from '../../prisma/generated/client';
import type { PlaySubmission } from './scoring';
import { checkGolfEligibility } from './scoring/eligibility';
import { calculateGolfStrokes, type GolfScoreResult } from './scoring/golf';
import { S3_BUCKET_ASSETS, CLOUDFRONT_ASSETS_URL } from './s3';

// Explicitly NOT part of api/src/utils/events/base.ts's EventConfig/EventRegistry (that system is
// Postgres-coupled and synchronous-by-construction, used only by the dormant Blue Shift configs).
// resultImages is a capability the user grants manually per event, not something generic to the
// event system - this is a small, separate, hand-curated registry for exactly that. Each provider's
// general/async processing (scoring, persistence) lives entirely in that event's own isolated
// backend (see events/golf/backend/) - this file only ever reads a provider's own public read-api
// over a bounded HTTP call, never touches an event's DynamoDB/storage directly, and any provider
// failure here can never block or fail the core score-submission response.
/** What a provider is told about the play it is producing images for. */
export interface ResultImageRequest<TScore> {
  submission: PlaySubmission;
  ownScore: TScore;
  userId: string;
  userAlias: string;
  playId: number;
  playedAt: Date;
  /**
   * The player's rivals. Loaded on first call and then cached, so only a provider that actually shows
   * rivals pays for the query. Never throws: rivals only decorate a board, so a failed lookup is an
   * empty list rather than a lost image.
   */
  getRivalIds(): Promise<string[]>;
}

export interface EventResultImageProvider<TScore, TContext> {
  id: string;
  /**
   * Upper bound on how many images `renderImages` can return *for this play*. Used to reserve room in
   * the response before anything renders - see eventResultImageSlots - so it must be answerable from
   * what is known up front, with no I/O. It should be as tight as that allows: every slot reserved is
   * one a pack image can't use, so a provider that always claimed its maximum would starve packs on
   * plays where it is certain to produce less. It must not undercount, though; the cap still holds if
   * it does (limitResultImages), but then it is the pack images that get cut.
   */
  maxImages(play: Pick<Play, 'chartHash' | 'userId'>, submission: PlaySubmission): number;
  chartHashes: string[];
  /** Omit once fully rolled out - present means gated to only these userIds. */
  testUserIds?: Set<string>;
  /** Pure, zero-I/O - must never throw for valid input. */
  computeOwnScore(submission: PlaySubmission): TScore;
  /** Must own its own timeout and never throw past its own boundary - undefined on any failure. */
  fetchContext(request: ResultImageRequest<TScore>): Promise<TContext | undefined>;
  renderImages(request: ResultImageRequest<TScore>, context: TContext | undefined): Promise<Buffer[]>;
}

const GOLF_TEST_USER_IDS = new Set(['3ac37479-c87f-459c-b3aa-c17e95c1a0d8', '27cfc687-8d10-4132-bd29-da3b4ef54dfb', 'a5dd627d-c5c7-47a7-99b2-854dbb80bfe7']);

interface GolfChartConfig {
  hash: string;
  /** Display name for the pack this chart belongs to - shown on the result card (see
   * golf-result-image.ts) and, later, used to pick a per-course background image. Deliberately a
   * short display name, not the on-disk pack folder name (e.g. "In The Golf - Beta Pines vE2"). */
  courseName: string;
  /** Mirrors `hidden` for this chart's course in events/golf/config/courses.json. A hidden course's
   * boards are never served, so a play on one only ever gets its result card; knowing that here lets
   * the response reserve one slot for golf instead of three. Another hand-kept copy - if it drifts the
   * worst case is a wrong reservation, never a wrong image. */
  hidden?: boolean;
  /** Real assigned par (scripts/assign-golf-pars.ts / scripts/data/golf-*-pars.json) - undefined for
   * charts that don't have one yet, in which case the result card falls back to strokes alone. */
  par?: number;
}

// Pre-beta testing set (see docs/plans/golf-event-result-images.md) plus the two real beta packs,
// "In The Golf - Beta Hills" and "In The Golf - Beta Pines" - 18 charts (holes) each, hashed via
// scripts/get-pack-hashes.ts against each pack's local Songs folder. Currently the vF4 revision of
// both packs, which (unlike vE2) ships exactly one .ssc per song folder and no stale .sm leftovers,
// so the raw hash dump needed no .ssc-preference filtering - 18 simfiles, 18 charts each. vF4 is a
// pure folder rename of vF3 (re-hashed to confirm: all 36 beta hashes byte-identical), so a pack
// version bump alone doesn't imply any change here.
// Hash order here is the dump's own (filesystem/ASCII) order, which is why "get funky..." sorts last.
// Par values are copied from scripts/data/golf-beta-hills-pars-final.json /
// golf-beta-pines-pars-final.json (scripts/assign-golf-pars.ts's output, as finalized for the beta;
// these supersede the earlier non-"-final" files, which hold stale vE2-era pars). All 36 beta
// charts now have a par; only the 4 original pre-beta hashes don't. A chart with no par still
// renders a result card, just strokes-only with no vs-par term - see golf-result-image.ts.
// These pars must match what the packs' own Golf.ini ships, since that's what the in-game HUD
// reads (Themes/ArrowCloudTheme/Scripts/SL-GolfHelpers.lua) - regenerate the ini from the same
// -final.json files via scripts/generate-golf-ini.ts so the card and the HUD can't disagree.
// KEEP IN SYNC with events/golf/backend/config.json's chartHashes (same 40 hashes, same order):
// that array drives golf's SNS subscription filter, this one drives result images, and both are
// hand-maintained - a hash in only one of them silently half-works (see this file's header).
const GOLF_CHARTS: GolfChartConfig[] = [
  // Original pre-beta test hashes - no real course/pack these came from, so they get a placeholder
  // course name. Par is a flat 3 on all four: assign-golf-pars.ts was never run against them, and
  // they only exist to exercise the pipeline end to end (see the hidden "alpha-testing" course in
  // events/golf/config/courses.json), so there is no real hole to calibrate against.
  { hash: '7a520534f16d6455', courseName: 'Alpha Testing', par: 3, hidden: true },
  { hash: '065f74f741eb2f9d', courseName: 'Alpha Testing', par: 3, hidden: true },
  { hash: 'f3871997119d5052', courseName: 'Alpha Testing', par: 3, hidden: true },
  { hash: '50bcefd78fa82988', courseName: 'Alpha Testing', par: 3, hidden: true },
  // In The Golf - Alpha Test (hidden course "alpha-test"; pars from scripts/data/golf-alpha-test-pars-final2.json)
  { hash: 'b862c60449ca5ff9', courseName: 'Alpha Test', par: 14, hidden: true },
  { hash: '04fc25f6dedd4185', courseName: 'Alpha Test', par: 3, hidden: true },
  { hash: '3dd4c092e25ccde4', courseName: 'Alpha Test', par: 8, hidden: true },
  { hash: 'af8fed60698146ce', courseName: 'Alpha Test', par: 5, hidden: true },
  { hash: 'd11e451f74e74e98', courseName: 'Alpha Test', par: 10, hidden: true },
  { hash: '9cc32b8a9a788bb9', courseName: 'Alpha Test', par: 3, hidden: true },
  // In The Golf - Beta Hills
  { hash: '3e9031441b77fab9', courseName: 'Beta Hills', par: 7 },
  { hash: '4f949d8e05f32f50', courseName: 'Beta Hills', par: 5 },
  { hash: '5953a34fd2cd40f1', courseName: 'Beta Hills', par: 14 },
  { hash: 'fec7522480170c8a', courseName: 'Beta Hills', par: 6 },
  { hash: '6e9ad3a992102915', courseName: 'Beta Hills', par: 10 },
  { hash: '8964d941f1a7c81a', courseName: 'Beta Hills', par: 20 },
  { hash: '4b7c49173870b344', courseName: 'Beta Hills', par: 4 },
  { hash: 'dd23ced08c27b93f', courseName: 'Beta Hills', par: 6 },
  { hash: 'a4bc270ad709a9fd', courseName: 'Beta Hills', par: 8 },
  { hash: 'efd7909645aba29c', courseName: 'Beta Hills', par: 10 },
  { hash: '969dad24922317c1', courseName: 'Beta Hills', par: 7 },
  { hash: '57bb7e53e5b6090c', courseName: 'Beta Hills', par: 14 },
  { hash: '0bc514a3acbd332a', courseName: 'Beta Hills', par: 8 },
  { hash: 'c064c72efd651fe4', courseName: 'Beta Hills', par: 10 },
  { hash: '913a5c614722de0d', courseName: 'Beta Hills', par: 8 },
  { hash: '0b88e7b47f603a77', courseName: 'Beta Hills', par: 8 },
  { hash: '95b5fe504f42fa3f', courseName: 'Beta Hills', par: 8 },
  { hash: 'a087601d3d52726f', courseName: 'Beta Hills', par: 13 },
  // In The Golf - Beta Pines
  { hash: '88ea9f8af9490151', courseName: 'Beta Pines', par: 4 },
  { hash: 'e77af6b4d45028ff', courseName: 'Beta Pines', par: 4 },
  { hash: '9b4bc7e9928de39b', courseName: 'Beta Pines', par: 3 },
  { hash: 'b32c5908a47afc44', courseName: 'Beta Pines', par: 4 },
  { hash: 'fd8afbbf787e17c7', courseName: 'Beta Pines', par: 3 },
  { hash: 'c663d1fc786101b5', courseName: 'Beta Pines', par: 5 },
  { hash: '702d12f7153dfec5', courseName: 'Beta Pines', par: 4 },
  { hash: '9a5e366400f59236', courseName: 'Beta Pines', par: 3 },
  { hash: '20416aedbdd59653', courseName: 'Beta Pines', par: 3 },
  { hash: '2d8af9e16da4e23a', courseName: 'Beta Pines', par: 6 },
  { hash: 'ab70937938c39775', courseName: 'Beta Pines', par: 6 },
  { hash: 'f07b623a9324570d', courseName: 'Beta Pines', par: 4 },
  { hash: 'f96a28b54873a734', courseName: 'Beta Pines', par: 3 },
  { hash: '1dc29ef7904a58b1', courseName: 'Beta Pines', par: 5 },
  { hash: 'd0ee6c126ac9c710', courseName: 'Beta Pines', par: 8 },
  { hash: '4c99bd7995c84915', courseName: 'Beta Pines', par: 5 },
  { hash: 'ded54c81a7bd03dc', courseName: 'Beta Pines', par: 3 },
  { hash: 'ba6a606e74c8ee00', courseName: 'Beta Pines', par: 3 },
];
const GOLF_CHART_HASHES = GOLF_CHARTS.map((c) => c.hash);
const GOLF_CHART_BY_HASH = new Map(GOLF_CHARTS.map((c) => [c.hash, c]));
// 300ms -> 800ms -> 1500ms -> 3000ms. ApiStack's Lambda is VPC-attached (for RDS), so reaching
// golf's public read-api Function URL means NAT egress; on top of that, computePackResultImages'
// synchronous satori/resvg rendering runs concurrently in the same Promise.all and can occupy the
// event loop for multiple seconds (see its own timing log in chart.ts), delaying when this fetch's
// response actually gets processed even once it's arrived. 3000ms gives real margin for both, while
// still bounding how much a golf read can ever add to the synchronous submission response - see
// computeEventResultImages's isolation guarantees below.
const GOLF_READ_API_TIMEOUT_MS = 3000;

/**
 * One row of a ranking page, as golf's /rankings route returns it. Declared here, not imported from the
 * golf backend: core consumes golf over HTTP and shouldn't depend on its source. The route's response in
 * events/golf/backend/README.md is the contract - if a field changes there, change it here.
 */
interface GolfHoleRankingRow {
  rank: number;
  userId: string;
  alias: string;
  totalStrokes: number;
  isSelf: boolean;
  isRival: boolean;
  isPreviousBest: boolean;
}

interface GolfCourseRankingRow extends GolfHoleRankingRow {
  holesCompleted: number;
}

/** What golf's /rankings route returns (events/golf/backend/src/read-api.ts). `hole` and `course` are
 * absent when the response came from the /best fallback, null for a hidden or unknown chart. */
interface GolfContext {
  previousBestStrokes: number | null;
  hole?: {
    courseSlug: string;
    courseName: string;
    holeNumber: number;
    songName: string;
    artist: string;
    par: number | null;
    totalPlayers: number;
    selfRank: number;
    rows: GolfHoleRankingRow[];
  } | null;
  course?: {
    slug: string;
    name: string;
    totalPlayers: number;
    selfRank: number;
    holesTotal: number;
    selfHolesCompleted: number;
    selfComplete: boolean;
    rows: GolfCourseRankingRow[];
  } | null;
}

/** The read API's own ceiling on rivalIds (events/golf/backend/src/read-api.ts MAX_RIVAL_IDS). Sending
 * more is a 400, which would throw away the whole context - so a longer list is cut here instead. */
const GOLF_MAX_RIVAL_IDS = 50;

/**
 * One bounded GET against golf's read API. Returns undefined on timeout or network failure, and the
 * status plus parsed body otherwise - including for non-2xx, because the caller needs to tell a missing
 * route (404) from a real error. The body is read inside the timeout window.
 */
async function golfReadApiGet(baseUrl: string, route: string, query: URLSearchParams): Promise<{ status: number; ok: boolean; body: unknown } | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOLF_READ_API_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${baseUrl}${route}?${query}`, { signal: controller.signal });
    // Log status/ok explicitly, not just that fetch() resolved - a non-2xx response settles the
    // promise same as a 2xx does, and silently returning undefined on a 4xx/5xx with no log at all
    // is exactly what let the double-slash URL bug (see fetchContext) go unnoticed.
    console.log(`[golf] read-api ${route} responded in ${Date.now() - startedAt}ms: status=${res.status} ok=${res.ok}`);
    return { status: res.status, ok: res.ok, body: res.ok ? await res.json() : undefined };
  } catch (error) {
    console.warn(`[golf] read-api ${route} fetch failed after ${Date.now() - startedAt}ms (degrading gracefully):`, error);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether this play can be ranked at all: the same golf eligibility rule the score processor applies
 * (passed, unmodded rate, no autoplay outside the allow-list, not an affected DeadSync build). Shared by
 * the slot reservation and the context fetch so the two cannot disagree about it.
 */
function isGolfPlayRankable(userId: string, submission: PlaySubmission): boolean {
  return checkGolfEligibility(
    {
      bodyVersion: submission._arrowCloudBodyVersion,
      engineName: submission._engineName,
      musicRate: submission.musicRate,
      usedAutoplay: submission.usedAutoplay,
      passed: submission.passed,
    },
    userId,
  ).eligible;
}

const golfResultImageProvider: EventResultImageProvider<GolfScoreResult, GolfContext> = {
  id: 'golf',
  // The result card always; the hole and course rankings pages only for a play that counts, on a course
  // whose boards are public. Both are known before any request is made, so a play that can only ever
  // get its card reserves one slot rather than three - which matters on the Alpha charts, where a pack
  // leaderboard shares the response and should get the room golf can't use.
  maxImages(play, submission) {
    if (GOLF_CHART_BY_HASH.get(play.chartHash)?.hidden) return 1;
    return isGolfPlayRankable(play.userId, submission) ? 3 : 1;
  },
  chartHashes: GOLF_CHART_HASHES,
  testUserIds: GOLF_TEST_USER_IDS,
  computeOwnScore: calculateGolfStrokes,
  async fetchContext(request) {
    // GOLF_READ_API_URL (from events/golf/backend/config.json's readApiUrl, a Lambda Function URL)
    // comes with a trailing slash. Naively concatenating `${baseUrl}/best` produced a double slash
    // (".../on.aws//best"), which read-api.ts's route check never matches - every single request was
    // silently 404ing for as long as this provider has existed. Confirmed via direct log inspection
    // (status=404 ok=false) after the fetch-timeout/VPC-latency work made it possible to see the
    // response at all instead of timing out first.
    const baseUrl = process.env.GOLF_READ_API_URL?.replace(/\/+$/, '');
    if (!baseUrl) return undefined; // blank until GolfBackendStack's first deploy - see events/golf/backend/config.json
    const { submission, ownScore, userId } = request;

    // Only a play that counts can be ranked. One that doesn't - a failed stage, a rate-modded or
    // autoplay run - still gets its result card (and the previous-best delta on it), but must not be
    // shown a rank it didn't earn, so it never asks for the boards.
    const eligible = isGolfPlayRankable(userId, submission);

    if (eligible) {
      const rivalIds = (await request.getRivalIds()).slice(0, GOLF_MAX_RIVAL_IDS);
      const query = new URLSearchParams({
        userId,
        alias: request.userAlias,
        chartHash: submission.hash,
        playId: String(request.playId),
        strokes: String(ownScore.totalStrokes),
        playedAt: request.playedAt.toISOString(),
      });
      if (rivalIds.length > 0) query.set('rivalIds', rivalIds.join(','));

      const res = await golfReadApiGet(baseUrl, '/rankings', query);
      if (!res) return undefined; // timed out or unreachable - a second request would only wait again
      if (res.ok) return res.body as GolfContext;
      // Any real error from a route that exists means no context. A 404 is different: it means the
      // route isn't deployed yet (this API shipped before the golf backend), and giving up there would
      // also drop the previous-best delta the card has always shown. Fall through to /best instead, so
      // deploy order doesn't matter.
      if (res.status !== 404) return undefined;
    }

    const res = await golfReadApiGet(baseUrl, '/best', new URLSearchParams({ userId, chartHash: submission.hash }));
    return res?.ok ? (res.body as GolfContext) : undefined;
  },
  async renderImages(request, context) {
    const { submission, ownScore } = request;
    // Imported dynamically (not at module scope) so a load-time failure in the satori/resvg
    // native-module chain can only ever break this one call - same isolation reason
    // pack-result-image.ts's renderer is imported dynamically from pack-leaderboard.ts.
    const { renderGolfResultImage } = await import('./golf-result-image');
    // Every hash in this provider's chartHashes (which is exactly GOLF_CHARTS.map(c => c.hash)) has
    // a config entry by construction - the `!` reflects that invariant, not an assumption about
    // this specific submission.
    const chartConfig = GOLF_CHART_BY_HASH.get(submission.hash)!;

    // Image 1: the result card.
    const renders: Promise<Buffer>[] = [
      renderGolfResultImage({
        chartTitle: submission.songName,
        chartArtist: submission.artist,
        chartHash: submission.hash,
        courseName: chartConfig.courseName,
        par: chartConfig.par ?? null,
        totalStrokes: ownScore.totalStrokes,
        noteCount: ownScore.noteCount,
        previousBestStrokes: context?.previousBestStrokes ?? null,
        aceCount: ownScore.noteStrokes.filter((strokes) => strokes === 0).length,
        obCount: ownScore.noteStrokes.filter((strokes) => strokes === 200).length,
        noteStrokes: ownScore.noteStrokes,
      }),
    ];

    // Images 2 and 3: the hole and course rankings. Each is its own import and its own promise, so a
    // failure in one cannot take down the others. Title, artist and par come from the same sources the
    // card uses (the submission and GOLF_CHARTS), not from the read API's copy of the course config, so
    // a hole can't be named or scored differently from one image to the next.
    if (context?.hole) {
      const { hole } = context;
      renders.push(
        import('./golf-ranking-image').then((m) =>
          m.renderGolfHolePage({
            courseName: hole.courseName,
            holeNumber: hole.holeNumber,
            songTitle: submission.songName,
            songArtist: submission.artist,
            par: chartConfig.par ?? null,
            totalPlayers: hole.totalPlayers,
            rows: hole.rows,
          }),
        ),
      );
    }
    if (context?.course) {
      const { course } = context;
      renders.push(
        import('./golf-ranking-image').then((m) =>
          m.renderGolfCoursePage({ courseName: course.name, holesTotal: course.holesTotal, totalPlayers: course.totalPlayers, rows: course.rows }),
        ),
      );
    }

    // allSettled, in order: a page that fails to render is logged and left out, and the others still
    // go out - one bad image must not cost the player the whole set.
    const settled = await Promise.allSettled(renders);
    const buffers: Buffer[] = [];
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') buffers.push(result.value);
      else console.error(`[golf] result image ${i + 1} of ${settled.length} failed to render:`, result.reason);
    });
    return buffers;
  },
};

const EVENT_RESULT_IMAGE_PROVIDERS: EventResultImageProvider<any, any>[] = [golfResultImageProvider];

/**
 * The most result images one submission response may carry, across every source (custom events and
 * pack leaderboards together). The in-game results screen pages through them, so more than this is
 * not just heavier to render - it is more than anyone will flip through.
 *
 * Sources are prioritised newest first: event images, then pack images. When the sources want more
 * than this, the older source is the one cut - which today means a golf chart that also sits in a
 * pack leaderboard (the Arrow Cloud Testing pack contains the Alpha golf charts) keeps its golf
 * images and has its pack images truncated.
 */
export const MAX_RESULT_IMAGES = 4;

function providersFor(play: Pick<Play, 'chartHash' | 'userId'>): EventResultImageProvider<any, any>[] {
  return EVENT_RESULT_IMAGE_PROVIDERS.filter(
    (provider) => provider.chartHashes.includes(play.chartHash) && (!provider.testUserIds || provider.testUserIds.has(play.userId)),
  );
}

/**
 * How many image slots the event providers can claim for this play: the sum of each matching
 * provider's `maxImages`. Synchronous and free - one array lookup per provider - so the caller can
 * work out the pack images' budget *before* starting either side's rendering, which is what lets the
 * pack renderer skip images it would otherwise render and throw away.
 *
 * Each provider answers for this specific play, so what is knowable up front is already reflected: a
 * golf play that can only get its card reserves one slot. What isn't knowable up front is not - if a
 * provider that expected three images degrades (golf's read-api timing out leaves it with only its
 * card), the slots it didn't fill stay unused rather than going to the pack images. That is
 * deliberate: filling them would mean waiting for the event side to finish before starting the pack
 * side, serialising two multi-second renders on the submission path to win back an image or two.
 */
export function eventResultImageSlots(play: Pick<Play, 'chartHash' | 'userId'>, submission: PlaySubmission): number {
  return providersFor(play).reduce((total, provider) => total + provider.maxImages(play, submission), 0);
}

/** Merge the two sources in priority order and enforce the cap. The pack renderer is already
 * handed a budget, so this is the backstop - it keeps the cap true even if a source overshoots. */
export function limitResultImages(eventImages: string[], packImages: string[]): string[] {
  return [...eventImages, ...packImages].slice(0, MAX_RESULT_IMAGES);
}

/**
 * For any manually-curated event provider whose chartHashes/testUserIds match this submission:
 * compute this play's own score, fetch context from that event's own read-api (bounded, gracefully
 * degrading), render + upload the image(s). One provider's failure is logged and skipped - it can
 * never affect another provider's images or the caller's response.
 */
export async function computeEventResultImages(args: {
  submission: PlaySubmission;
  play: Play;
  userAlias: string;
  s3Client: S3Client;
  prisma: PrismaClient;
}): Promise<string[]> {
  const { submission, play, userAlias, s3Client, prisma } = args;
  const matches = providersFor(play);
  if (matches.length === 0) return [];

  // Shared across providers and loaded at most once, on first use: a play on a chart no provider shows
  // rivals for never runs the query. A failure is an empty list, never an error - see ResultImageRequest.
  let rivalIds: Promise<string[]> | undefined;
  const getRivalIds = () =>
    (rivalIds ??= prisma.userRival
      .findMany({ where: { userId: play.userId }, select: { rivalUserId: true } })
      .then((rows) => rows.map((r) => r.rivalUserId))
      .catch((error) => {
        console.warn('[event-result-images] rival lookup failed, continuing without rivals:', error);
        return [] as string[];
      }));

  const urls: string[] = [];
  for (const provider of matches) {
    try {
      const ownScore = provider.computeOwnScore(submission);
      const request: ResultImageRequest<unknown> = {
        submission,
        ownScore,
        userId: play.userId,
        userAlias,
        playId: play.id,
        playedAt: play.createdAt,
        getRivalIds,
      };
      const context = await provider.fetchContext(request);
      const buffers = await provider.renderImages(request, context);
      const uploaded = await Promise.all(
        buffers.map((body, i) => {
          const key = `result/play/${play.id}/${provider.id}-${i}.png`;
          return s3Client
            .send(new PutObjectCommand({ Bucket: S3_BUCKET_ASSETS, Key: key, Body: body, ContentType: 'image/png', CacheControl: 'max-age=31536000' }))
            .then(() => `${CLOUDFRONT_ASSETS_URL}/${key}`);
        }),
      );
      urls.push(...uploaded);
    } catch (error) {
      console.error(`[event-result-images] provider "${provider.id}" failed:`, error);
    }
  }
  return urls;
}
