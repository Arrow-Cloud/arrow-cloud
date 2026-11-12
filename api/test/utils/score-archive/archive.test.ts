import { PutObjectCommand, S3Client, UploadPartCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { createHash, randomBytes } from 'crypto';
import { mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildArchive, prefetch } from '../../../src/utils/score-archive/archive';
import { ScoreObject } from '../../../src/utils/score-archive/keys';
import { ARCHIVE, capturePuts, fakeS3, readTarZst, scoreObjects, SCORES } from './helpers';

const s3Mock = mockClient(S3Client);
const s3 = new S3Client({ region: 'us-east-2' });
const T = Date.UTC(2026, 2, 3, 4, 5, 6);

const build = (objects: ScoreObject[], overrides: { concurrency?: number } = {}) =>
  buildArchive({
    s3,
    sourceBucket: SCORES,
    destBucket: ARCHIVE,
    destKey: 'archive/scores-2026-03.tar.zst',
    objects,
    concurrency: 2,
    ...overrides,
  });

const bigBodies = (n: number) => Array.from({ length: n }, () => randomBytes(2 * 1024 * 1024));

beforeEach(() => s3Mock.reset());

describe('prefetch', () => {
  it('preserves input order and bounds concurrency', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    const results: number[] = [];
    for await (const r of prefetch(items, 4, async (i) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, (20 - i) % 5));
      inFlight--;
      return i * 2;
    })) {
      results.push(r);
    }

    expect(results).toEqual(items.map((i) => i * 2));
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('surfaces a rejection at its position', async () => {
    const seen: number[] = [];

    await expect(async () => {
      for await (const r of prefetch([1, 2, 3, 4], 3, async (i) => {
        if (i === 2) throw new Error('boom');
        return i;
      })) {
        seen.push(r);
      }
    }).rejects.toThrow('boom');
    expect(seen).toEqual([1]);
  });
});

describe('buildArchive', () => {
  it('packs objects under their keys, sorted, with receive time as mtime', async () => {
    const bodies = [0, 1, 2].map((i) => Buffer.from(JSON.stringify({ i, timingData: Array(50).fill([1.5, 0.01, 4]) })));
    const { objects, contents } = scoreObjects(bodies, T);
    fakeS3(s3Mock, { [SCORES]: contents });
    const puts = capturePuts(s3Mock);

    const stats = await build([...objects].reverse());

    expect(puts).toHaveLength(1);
    const { input, body: archive } = puts[0];
    expect(input).toMatchObject({
      Bucket: ARCHIVE,
      Key: 'archive/scores-2026-03.tar.zst',
      ContentType: 'application/zstd',
      CacheControl: 'no-cache',
    });

    expect(stats).toMatchObject({
      objects: 3,
      rawBytes: bodies.reduce((sum, b) => sum + b.length, 0),
      archiveBytes: archive.length,
      sha256: createHash('sha256').update(archive).digest('hex'),
    });

    const entries = await readTarZst(archive);
    expect(entries.map((e) => e.name)).toEqual(objects.map((o) => o.key));
    expect(entries.map((e) => e.data)).toEqual(bodies);
    expect(entries.map((e) => e.mtime?.getTime())).toEqual(objects.map((o) => o.timestampMs));
  });

  it('writes a valid empty archive for no objects', async () => {
    const puts = capturePuts(s3Mock);

    const stats = await build([]);

    expect(stats.objects).toBe(0);
    expect(await readTarZst(puts[0].body)).toEqual([]);
  });

  it('packs more data than the streams buffer and uploads it in parts', async () => {
    const bodies = bigBodies(4);
    const { objects, contents } = scoreObjects(bodies, T);
    fakeS3(s3Mock, { [SCORES]: contents });
    const puts = capturePuts(s3Mock);

    const stats = await build(objects, { concurrency: 8 });

    expect(s3Mock.commandCalls(UploadPartCommand).length).toBeGreaterThan(1);
    const archive = puts[0].body;
    expect(archive.length).toBe(stats.archiveBytes);
    expect(Buffer.concat((await readTarZst(archive)).map((e) => e.data)).equals(Buffer.concat(bodies))).toBe(true);
  });

  it('fails without uploading when an object cannot be read', async () => {
    const { objects, contents } = scoreObjects(Array(5).fill(Buffer.alloc(10, 'x')), T);
    contents.delete(objects[3].key);
    fakeS3(s3Mock, { [SCORES]: contents });
    s3Mock.on(PutObjectCommand).resolves({});

    await expect(build(objects)).rejects.toThrow('NoSuchKey');
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it('fails when the upload is rejected', async () => {
    const { objects, contents } = scoreObjects(Array(5).fill(Buffer.alloc(10, 'x')), T);
    fakeS3(s3Mock, { [SCORES]: contents });
    s3Mock.on(PutObjectCommand).rejects(new Error('AccessDenied'));

    await expect(build(objects)).rejects.toThrow('AccessDenied');
  });

  it('leaves no temporary files behind', async () => {
    const original = process.env.TMPDIR;
    const dir = mkdtempSync(join(tmpdir(), 'archive-test-'));
    process.env.TMPDIR = dir;
    try {
      const { objects, contents } = scoreObjects([Buffer.alloc(10, 'x')], T);
      fakeS3(s3Mock, { [SCORES]: contents });

      capturePuts(s3Mock);
      await build(objects);
      s3Mock.on(PutObjectCommand).rejects(new Error('AccessDenied'));
      await expect(build(objects)).rejects.toThrow('AccessDenied');

      expect(readdirSync(dir)).toEqual([]);
    } finally {
      if (original === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = original;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
