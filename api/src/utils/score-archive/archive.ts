import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream, ReadStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import * as tar from 'tar-stream';
import * as zlib from 'zlib';
import { CACHE_CONTROL, ScoreObject } from './keys';

export interface ArchiveStats {
  objects: number;
  rawBytes: number;
  archiveBytes: number;
  sha256: string;
  durationMs: number;
}

export interface BuildArchiveOptions {
  s3: S3Client;
  sourceBucket: string;
  destBucket: string;
  destKey: string;
  objects: ScoreObject[];
  concurrency?: number;
  log?: (message: string) => void;
}

const CONCURRENCY = 32;
const ZSTD_LEVEL = 12;
const PROGRESS_EVERY = 10_000;

/**
 * Runs `fn` over `items` keeping `limit` promises in flight.
 * Results are yielded in input order for reproducibility. */
export async function* prefetch<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): AsyncGenerator<R> {
  const inFlight: Promise<R>[] = [];
  let next = 0;
  const start = () => {
    const p = fn(items[next++]);
    p.catch(() => {});
    inFlight.push(p);
  };
  while (next < items.length && inFlight.length < limit) start();
  while (inFlight.length > 0) {
    const result = await inFlight.shift()!;
    if (next < items.length) start();
    yield result;
  }
}

async function fetchObject(s3: S3Client, bucket: string, obj: ScoreObject): Promise<Buffer> {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: obj.key }));
  if (!response.Body) throw new Error(`Empty body for s3://${bucket}/${obj.key}`);
  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Saves the archive to a temporary file and uploads it */
export async function buildArchive(options: BuildArchiveOptions): Promise<ArchiveStats> {
  const { s3, sourceBucket, destBucket, destKey, objects, concurrency = CONCURRENCY } = options;
  const log = options.log ?? (() => {});
  const startedAt = Date.now();

  const sorted = [...objects].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  let count = 0;
  let rawBytes = 0;

  const pack = tar.pack();
  const zstd = zlib.createZstdCompress({ params: { [zlib.constants.ZSTD_c_compressionLevel]: ZSTD_LEVEL } });
  const hash = createHash('sha256');
  let archiveBytes = 0;
  const measure = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      archiveBytes += chunk.length;
      callback(null, chunk);
    },
  });

  const feed = async () => {
    for await (const { obj, data } of prefetch(sorted, concurrency, async (obj) => ({ obj, data: await fetchObject(s3, sourceBucket, obj) }))) {
      await new Promise<void>((resolve, reject) => {
        const header = { name: obj.key, size: data.byteLength, mode: 0o644, mtime: new Date(obj.timestampMs), type: 'file' as const };
        // Destroying the pack fails the entry in progress through both the callback and an 'error' event.
        pack.entry(header, data, (err) => (err ? reject(err) : resolve())).on('error', reject);
      });
      rawBytes += data.byteLength;
      if (++count % PROGRESS_EVERY === 0) {
        log(`${destKey}: ${count}/${sorted.length} objects, ${rawBytes} raw bytes, ${Date.now() - startedAt} ms`);
      }
    }
    pack.finalize();
  };
  const dir = await mkdtemp(join(tmpdir(), 'score-archive-'));
  const file = join(dir, 'archive.tar.zst');
  let body: ReadStream | undefined;
  try {
    // A failed read ends the pipeline with the same error
    feed().catch((err) => pack.destroy(err instanceof Error ? err : new Error(String(err))));
    await pipeline(pack, zstd, measure, createWriteStream(file));
    body = createReadStream(file);
    await new Upload({
      client: s3,
      params: { Bucket: destBucket, Key: destKey, Body: body, ContentType: 'application/zstd', CacheControl: CACHE_CONTROL },
    }).done();
  } finally {
    body?.destroy();
    await rm(dir, { recursive: true, force: true });
  }

  return {
    objects: count,
    rawBytes,
    archiveBytes,
    sha256: hash.digest('hex'),
    durationMs: Date.now() - startedAt,
  };
}
