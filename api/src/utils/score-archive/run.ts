import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { buildArchive } from './archive';
import { archiveKey, monthOf, parseScoreKey, ScoreObject, SCORES_PREFIX } from './keys';
import { ManifestEntry, readManifest, writeManifest } from './manifest';

export interface Config {
  scoresBucket: string;
  archiveBucket: string;
  /** `YYYY-MM` months to rebuild even though they are already in the manifest. */
  force: Set<string>;
  dryRun: boolean;
}

export interface Listing {
  byMonth: Map<string, ScoreObject[]>;
  unrecognized: number;
}

export async function listScoreObjects(s3: S3Client, bucket: string): Promise<Listing> {
  const byMonth = new Map<string, ScoreObject[]>();
  let unrecognized = 0;
  let continuationToken: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: SCORES_PREFIX, ContinuationToken: continuationToken }));
    for (const object of page.Contents ?? []) {
      if (!object.Key) continue;
      const parsed = parseScoreKey(object.Key, object.Size ?? 0);
      if (!parsed) {
        unrecognized++;
        continue;
      }
      let list = byMonth.get(parsed.month);
      if (!list) byMonth.set(parsed.month, (list = []));
      list.push(parsed);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return { byMonth, unrecognized };
}

/**
 * Every ended month that has objects and is not already in the manifest (plus forced).
 * Ordered by oldest first.
 */
export function planMonths(listed: Iterable<string>, built: ReadonlySet<string>, now: Date, force: ReadonlySet<string>): string[] {
  const current = monthOf(now);
  const known = new Set(listed);
  const missing = [...known].filter((month) => !built.has(month) && month < current);
  const forced = [...force].filter((month) => built.has(month) || known.has(month));
  return [...new Set([...missing, ...forced])].sort();
}

export function isComplete(entry: ManifestEntry): boolean {
  return monthOf(new Date(entry.generatedAt)) > entry.month;
}

export interface RunResult {
  planned: string[];
  built: string[];
  failed: string[];
}

export interface RunOptions {
  now?: () => Date;
  log?: (message: string) => void;
}

export async function run(s3: S3Client, config: Config, options: RunOptions = {}): Promise<RunResult> {
  const log = options.log ?? console.log;
  const now = options.now ?? (() => new Date());

  const startedAt = now();
  const generatedAt = startedAt.toISOString();
  const listStarted = Date.now();
  const listing = await listScoreObjects(s3, config.scoresBucket);
  log(`Listed s3://${config.scoresBucket}/${SCORES_PREFIX} in ${Date.now() - listStarted} ms: ${listing.unrecognized} unrecognized keys`);
  for (const month of [...listing.byMonth.keys()].sort()) {
    const objects = listing.byMonth.get(month)!;
    log(`  ${month}: ${objects.length} objects, ${objects.reduce((sum, o) => sum + o.size, 0)} bytes`);
  }

  const manifest = new Map((await readManifest(s3, config.archiveBucket)).map((entry) => [entry.month, entry]));
  const complete = new Set([...manifest.values()].filter(isComplete).map((entry) => entry.month));
  const planned = planMonths([...listing.byMonth.keys(), ...manifest.keys()], complete, startedAt, config.force);
  log(planned.length ? `Building: ${planned.join(', ')}` : 'Nothing to build');

  const result: RunResult = { planned, built: [], failed: [] };
  if (config.dryRun) {
    log('Dry run, not writing anything');
    return result;
  }

  for (const month of planned) {
    const destKey = archiveKey(month);
    try {
      const stats = await buildArchive({
        s3,
        sourceBucket: config.scoresBucket,
        destBucket: config.archiveBucket,
        destKey,
        objects: listing.byMonth.get(month) ?? [],
        log,
      });
      manifest.set(month, {
        month,
        path: `/${destKey}`,
        bytes: stats.archiveBytes,
        sha256: stats.sha256,
        objects: stats.objects,
        rawBytes: stats.rawBytes,
        generatedAt,
      });
      await writeManifest(s3, config.archiveBucket, manifest.values(), generatedAt);
      result.built.push(month);
      log(
        `Wrote s3://${config.archiveBucket}/${destKey}: ${stats.objects} objects, ${stats.rawBytes} raw bytes -> ${stats.archiveBytes} bytes in ${stats.durationMs} ms`,
      );
    } catch (err) {
      result.failed.push(month);
      log(`Failed to build ${destKey}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    }
  }

  return result;
}
