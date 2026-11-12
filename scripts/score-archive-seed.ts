/**
 * Fills a local S3 server with synthetic score objects in the production key layout so the archiver
 * can be tested end to end without real AWS.
 */
import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes, randomInt } from 'crypto';
import { prefetch } from '../api/src/utils/score-archive/archive';
import { createS3Client } from '../api/src/score-archive';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const scoresBucket = arg('bucket', process.env.SCORES_BUCKET ?? 'arrow-cloud-scores');
const archiveBucket = arg('archive-bucket', process.env.ARCHIVE_BUCKET ?? 'arrow-cloud-score-archive');
const count = Number(arg('count', '1000'));
const years = arg('years', '2025,2026').split(',').map(Number);
const concurrency = Number(arg('concurrency', '32'));
const users = Number(arg('users', '200'));
const charts = Number(arg('charts', '500'));

/** The engine's 32-bit floats as the theme's Lua encoder prints them (`%.14g`). */
function engineFloat(value: number): number {
  return Number(Math.fround(value).toPrecision(14));
}

function syntheticScore(hash: string): string {
  const rows = randomInt(250, 900);
  const timingData = Array.from({ length: rows }, (_, i) => [
    engineFloat(i * 0.5 + Math.random() * 0.25),
    engineFloat((Math.random() - 0.5) * 0.18),
    randomInt(0, 6),
    false,
    false,
    false,
    0,
    false,
  ]);

  return JSON.stringify({
    songName: `Song ${hash.slice(0, 4)}`,
    artist: 'Synthetic',
    pack: 'Seed Pack',
    length: '2:00',
    hash,
    timingData,
    radar: { notes: rows, jumps: 0, holds: 0, mines: 0, hands: 0, rolls: 0 },
    difficulty: randomInt(8, 15),
    stepartist: 'seed',
    lifebarInfo: [],
    npsInfo: {},
    modifiers: {},
    musicRate: 1,
    usedAutoplay: false,
    passed: true,
    _arrowCloudBodyVersion: '1.0',
  });
}

async function ensureBucket(s3: ReturnType<typeof createS3Client>, bucket: string): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Created bucket ${bucket}`);
  }
}

(async () => {
  if (!process.env.AWS_ENDPOINT_URL) throw new Error('AWS_ENDPOINT_URL is not set; refusing to seed fake scores into real AWS');
  const s3 = createS3Client();
  await ensureBucket(s3, scoresBucket);
  await ensureBucket(s3, archiveBucket);

  const hashes = Array.from({ length: charts }, () => randomBytes(8).toString('hex'));
  const items = Array.from({ length: count }, (_, i) => {
    const year = years[i % years.length];
    const start = Date.UTC(year, 0, 1);
    const end = Math.min(Date.UTC(year + 1, 0, 1), Date.now());
    const ts = randomInt(start, Math.max(start + 1, end));
    const hash = hashes[randomInt(0, hashes.length)];
    return { key: `scores/${hash}/${randomInt(1, users + 1)}/${ts}.json`, body: syntheticScore(hash) };
  });

  const started = Date.now();
  let done = 0;
  let bytes = 0;
  for await (const size of prefetch(items, concurrency, async (item) => {
    await s3.send(new PutObjectCommand({ Bucket: scoresBucket, Key: item.key, Body: item.body, ContentType: 'application/json' }));
    return item.body.length;
  })) {
    done++;
    bytes += size;
    if (done % 1000 === 0) console.log(`${done}/${count} objects, ${bytes} bytes, ${Date.now() - started} ms`);
  }
  console.log(`Seeded ${done} objects (${bytes} bytes) into s3://${scoresBucket}/scores/ in ${Date.now() - started} ms`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
