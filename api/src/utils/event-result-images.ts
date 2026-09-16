import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { Play } from '../../prisma/generated';
import type { PlaySubmission } from './scoring';
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
export interface EventResultImageProvider<TScore, TContext> {
  id: string;
  chartHashes: string[];
  /** Omit once fully rolled out - present means gated to only these userIds. */
  testUserIds?: Set<string>;
  /** Pure, zero-I/O - must never throw for valid input. */
  computeOwnScore(submission: PlaySubmission): TScore;
  /** Must own its own timeout and never throw past its own boundary - undefined on any failure. */
  fetchContext(userId: string, chartHash: string): Promise<TContext | undefined>;
  renderImages(submission: PlaySubmission, ownScore: TScore, context: TContext | undefined): Promise<Buffer[]>;
}

const GOLF_TEST_USER_IDS = new Set(['3ac37479-c87f-459c-b3aa-c17e95c1a0d8', '27cfc687-8d10-4132-bd29-da3b4ef54dfb']);

interface GolfChartConfig {
  hash: string;
  /** Display name for the pack this chart belongs to - shown on the result card (see
   * golf-result-image.ts) and, later, used to pick a per-course background image. Deliberately a
   * short display name, not the on-disk pack folder name (e.g. "In The Golf - Beta Pines vE2"). */
  courseName: string;
  /** Real assigned par (scripts/assign-golf-pars.ts / scripts/data/golf-*-pars.json) - undefined for
   * charts that don't have one yet, in which case the result card falls back to strokes alone. */
  par?: number;
}

// Pre-beta testing set (see docs/plans/golf-event-result-images.md) plus the two real beta packs,
// "In The Golf - Beta Hills" and "In The Golf - Beta Pines" - 18 charts (holes) each, hashed via
// scripts/get-pack-hashes.ts against each pack's local Songs folder. Several song folders in both
// packs ship both a .sm and a .ssc for the same song (the .ssc being the current/curated chart,
// the .sm a stale leftover with extra now-unused difficulties) - StepMania always prefers the .ssc
// when both exist, so only its chart(s) are included here; the .sm-only entries the raw hash dump
// also produced were dropped, which is what brought each pack down to exactly 18 as expected.
// Par values are copied from scripts/data/golf-beta-hills-pars.json / golf-beta-pines-pars.json
// (scripts/assign-golf-pars.ts's output) - the original pre-beta hashes have no assigned par yet.
const GOLF_CHARTS: GolfChartConfig[] = [
  // Original pre-beta test hashes - no real course/pack these came from, so they get a placeholder
  // course name and no par (assign-golf-pars.ts has never been run against them).
  { hash: '7a520534f16d6455', courseName: 'Alpha Testing' },
  { hash: '065f74f741eb2f9d', courseName: 'Alpha Testing' },
  { hash: 'f3871997119d5052', courseName: 'Alpha Testing' },
  { hash: '50bcefd78fa82988', courseName: 'Alpha Testing' },
  // In The Golf - Beta Hills
  { hash: '996bf355e5de44ad', courseName: 'Beta Hills', par: 15 },
  { hash: '3e9031441b77fab9', courseName: 'Beta Hills', par: 8 },
  { hash: '4f949d8e05f32f50', courseName: 'Beta Hills', par: 6 },
  { hash: '22f6263af9be0b6b', courseName: 'Beta Hills', par: 10 },
  { hash: '5953a34fd2cd40f1', courseName: 'Beta Hills', par: 12 },
  { hash: 'fec7522480170c8a', courseName: 'Beta Hills', par: 6 },
  { hash: '6e9ad3a992102915', courseName: 'Beta Hills', par: 14 },
  { hash: '4b7c49173870b344', courseName: 'Beta Hills', par: 6 },
  { hash: 'a4bc270ad709a9fd', courseName: 'Beta Hills', par: 8 },
  { hash: 'efd7909645aba29c', courseName: 'Beta Hills', par: 10 },
  { hash: '969dad24922317c1', courseName: 'Beta Hills', par: 6 },
  { hash: '4b42c43066bd717b', courseName: 'Beta Hills', par: 8 },
  { hash: '57bb7e53e5b6090c', courseName: 'Beta Hills', par: 14 },
  { hash: '6e6103ecf837152e', courseName: 'Beta Hills', par: 5 },
  { hash: 'c064c72efd651fe4', courseName: 'Beta Hills', par: 12 },
  { hash: '913a5c614722de0d', courseName: 'Beta Hills', par: 6 },
  { hash: '95b5fe504f42fa3f', courseName: 'Beta Hills', par: 8 },
  { hash: 'a087601d3d52726f', courseName: 'Beta Hills', par: 13 },
  // In The Golf - Beta Pines
  { hash: '20ba0b5a36805858', courseName: 'Beta Pines', par: 3 },
  { hash: '88ea9f8af9490151', courseName: 'Beta Pines', par: 4 },
  { hash: 'e77af6b4d45028ff', courseName: 'Beta Pines', par: 4 },
  { hash: '9b4bc7e9928de39b', courseName: 'Beta Pines', par: 3 },
  { hash: 'b32c5908a47afc44', courseName: 'Beta Pines', par: 3 },
  { hash: 'fd8afbbf787e17c7', courseName: 'Beta Pines', par: 3 },
  { hash: '702d12f7153dfec5', courseName: 'Beta Pines', par: 3 },
  { hash: '9a5e366400f59236', courseName: 'Beta Pines', par: 3 },
  { hash: '20416aedbdd59653', courseName: 'Beta Pines', par: 3 },
  { hash: '2d8af9e16da4e23a', courseName: 'Beta Pines', par: 6 },
  { hash: 'ab70937938c39775', courseName: 'Beta Pines', par: 5 },
  { hash: 'f07b623a9324570d', courseName: 'Beta Pines', par: 4 },
  { hash: 'f96a28b54873a734', courseName: 'Beta Pines', par: 4 },
  { hash: '1dc29ef7904a58b1', courseName: 'Beta Pines', par: 4 },
  { hash: 'd0ee6c126ac9c710', courseName: 'Beta Pines', par: 6 },
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

interface GolfContext {
  previousBestStrokes: number | null;
}

const golfResultImageProvider: EventResultImageProvider<GolfScoreResult, GolfContext> = {
  id: 'golf',
  chartHashes: GOLF_CHART_HASHES,
  testUserIds: GOLF_TEST_USER_IDS,
  computeOwnScore: calculateGolfStrokes,
  async fetchContext(userId, chartHash) {
    // GOLF_READ_API_URL (from events/golf/backend/config.json's readApiUrl, a Lambda Function URL)
    // comes with a trailing slash. Naively concatenating `${baseUrl}/best` produced a double slash
    // (".../on.aws//best"), which read-api.ts's `path === '/best'` route check never matches -
    // every single request was silently 404ing, straight into the `!res.ok` branch below, for as
    // long as this provider has existed. Confirmed via direct log inspection (status=404 ok=false)
    // after the fetch-timeout/VPC-latency work made it possible to see the response at all instead
    // of timing out first.
    const baseUrl = process.env.GOLF_READ_API_URL?.replace(/\/+$/, '');
    if (!baseUrl) return undefined; // blank until GolfBackendStack's first deploy - see events/golf/backend/config.json
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GOLF_READ_API_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const res = await fetch(`${baseUrl}/best?userId=${encodeURIComponent(userId)}&chartHash=${encodeURIComponent(chartHash)}`, {
        signal: controller.signal,
      });
      // Log status/ok explicitly, not just that fetch() resolved - a non-2xx response settles the
      // promise same as a 2xx does, and silently returning undefined below on a 4xx/5xx with no log
      // at all is exactly what let the double-slash URL bug above go unnoticed for as long as it did.
      console.log(`[golf] read-api responded in ${Date.now() - startedAt}ms: status=${res.status} ok=${res.ok}`);
      if (!res.ok) return undefined;
      return (await res.json()) as GolfContext;
    } catch (error) {
      console.warn(`[golf] read-api fetch failed after ${Date.now() - startedAt}ms (degrading gracefully):`, error);
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  },
  async renderImages(submission, ownScore, context) {
    // Imported dynamically (not at module scope) so a load-time failure in the satori/resvg
    // native-module chain can only ever break this one call - same isolation reason
    // pack-result-image.ts's renderer is imported dynamically from pack-leaderboard.ts.
    const { renderGolfResultImage } = await import('./golf-result-image');
    // Every hash in this provider's chartHashes (which is exactly GOLF_CHARTS.map(c => c.hash)) has
    // a config entry by construction - the `!` reflects that invariant, not an assumption about
    // this specific submission.
    const chartConfig = GOLF_CHART_BY_HASH.get(submission.hash)!;
    const png = await renderGolfResultImage({
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
    });
    return [png];
  },
};

const EVENT_RESULT_IMAGE_PROVIDERS: EventResultImageProvider<any, any>[] = [golfResultImageProvider];

/**
 * For any manually-curated event provider whose chartHashes/testUserIds match this submission:
 * compute this play's own score, fetch context from that event's own read-api (bounded, gracefully
 * degrading), render + upload the image(s). One provider's failure is logged and skipped - it can
 * never affect another provider's images or the caller's response.
 */
export async function computeEventResultImages(submission: PlaySubmission, play: Play, s3Client: S3Client): Promise<string[]> {
  const matches = EVENT_RESULT_IMAGE_PROVIDERS.filter(
    (provider) => provider.chartHashes.includes(play.chartHash) && (!provider.testUserIds || provider.testUserIds.has(play.userId)),
  );
  if (matches.length === 0) return [];

  const urls: string[] = [];
  for (const provider of matches) {
    try {
      const ownScore = provider.computeOwnScore(submission);
      const context = await provider.fetchContext(play.userId, play.chartHash);
      const buffers = await provider.renderImages(submission, ownScore, context);
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
