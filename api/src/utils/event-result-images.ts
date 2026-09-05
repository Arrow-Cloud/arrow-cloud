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
// Pre-beta testing set - see docs/plans/golf-event-result-images.md. More added later.
const GOLF_CHART_HASHES = ['7a520534f16d6455', '065f74f741eb2f9d', 'f3871997119d5052'];
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
    const png = await renderGolfResultImage({
      chartTitle: submission.songName,
      chartArtist: submission.artist,
      chartHash: submission.hash,
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
