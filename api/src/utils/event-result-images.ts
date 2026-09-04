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
const GOLF_READ_API_TIMEOUT_MS = 300;

interface GolfContext {
  previousBestStrokes: number | null;
}

const golfResultImageProvider: EventResultImageProvider<GolfScoreResult, GolfContext> = {
  id: 'golf',
  chartHashes: GOLF_CHART_HASHES,
  testUserIds: GOLF_TEST_USER_IDS,
  computeOwnScore: calculateGolfStrokes,
  async fetchContext(userId, chartHash) {
    const baseUrl = process.env.GOLF_READ_API_URL;
    if (!baseUrl) return undefined; // blank until GolfBackendStack's first deploy - see events/golf/backend/config.json
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GOLF_READ_API_TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}/best?userId=${encodeURIComponent(userId)}&chartHash=${encodeURIComponent(chartHash)}`, {
        signal: controller.signal,
      });
      if (!res.ok) return undefined;
      return (await res.json()) as GolfContext;
    } catch (error) {
      console.warn('[golf] read-api fetch failed (degrading gracefully):', error);
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
