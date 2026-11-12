import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { Manifest, ManifestEntry } from '../../../src/utils/score-archive/manifest';
import { Config, listScoreObjects, planMonths, run } from '../../../src/utils/score-archive/run';
import { ARCHIVE, bodyToBuffer, fakeS3, readTarZst, scoreKey, SCORES } from './helpers';

const s3Mock = mockClient(S3Client);
const s3 = new S3Client({ region: 'us-east-2' });
const NOW = new Date(Date.UTC(2026, 10, 1, 1, 0, 0));
const MANIFEST = 'archive/manifest.json';
const archiveOf = (month: string) => `archive/scores-${month}.tar.zst`;

const t08 = Date.UTC(2026, 7, 10);
const t09 = Date.UTC(2026, 8, 10);
const t10 = Date.UTC(2026, 9, 10);
const t11 = Date.UTC(2026, 10, 1, 0, 30);

const entry = (month: string): ManifestEntry => ({
  month,
  path: `/${archiveOf(month)}`,
  bytes: 50,
  sha256: 'ab'.repeat(32),
  objects: 1,
  rawBytes: 40,
  generatedAt: '2026-11-01T00:00:00.000Z',
});

const manifestBody = (archives: ManifestEntry[]) => Buffer.from(JSON.stringify({ generatedAt: '2026-10-01T01:00:00.000Z', archives } satisfies Manifest));

beforeEach(() => s3Mock.reset());

describe('planMonths', () => {
  const none = new Set<string>();

  it('builds ended months that are not in the manifest, oldest first', () => {
    expect(planMonths(['2026-10', '2025-12', '2026-09'], new Set(['2026-09']), NOW, none)).toEqual(['2025-12', '2026-10']);
  });

  it('builds the month in progress only when forced', () => {
    expect(planMonths(['2026-10', '2026-11'], none, NOW, none)).toEqual(['2026-10']);
    expect(planMonths(['2026-10', '2026-11'], none, NOW, new Set(['2026-11']))).toEqual(['2026-10', '2026-11']);
  });

  it('picks up December on the first run of January', () => {
    expect(planMonths(['2026-12', '2027-01'], none, new Date(Date.UTC(2027, 0, 1, 1)), none)).toEqual(['2026-12']);
  });

  it('rebuilds forced months that are in the manifest, including ones whose objects are all gone', () => {
    const built = new Set(['2026-08', '2026-09', '2026-10']);
    expect(planMonths(['2026-09', '2026-10'], built, NOW, new Set(['2026-08', '2026-09']))).toEqual(['2026-08', '2026-09']);
  });

  it('ignores forced months that have neither objects nor an archive', () => {
    expect(planMonths(['2026-10'], new Set(['2026-10']), NOW, new Set(['2020-01']))).toEqual([]);
  });
});

describe('listScoreObjects', () => {
  it('follows pagination and groups by month, counting keys it does not understand', async () => {
    fakeS3(s3Mock, {
      [SCORES]: new Map([
        [scoreKey('a', 1, t09), Buffer.alloc(10)],
        [scoreKey('a', 2, t10), Buffer.alloc(20)],
        [scoreKey('b', 1, t10 + 1), Buffer.alloc(30)],
        ['scores/README', Buffer.alloc(1)],
        ['other/x.json', Buffer.alloc(1)],
      ]),
    });

    const listing = await listScoreObjects(s3, SCORES);

    expect([...listing.byMonth.keys()]).toEqual(['2026-09', '2026-10']);
    expect(listing.byMonth.get('2026-10')!.map((o) => o.size)).toEqual([20, 30]);
    expect(listing.unrecognized).toBe(1);
    expect(s3Mock.commandCalls(ListObjectsV2Command).length).toBeGreaterThan(1);
  });
});

describe('run', () => {
  const keys = [scoreKey('a', 1, t08), scoreKey('a', 1, t09), scoreKey('b', 2, t09 + 5), scoreKey('a', 1, t10), scoreKey('a', 1, t11)];
  const scores = new Map(keys.map((k) => [k, Buffer.from(JSON.stringify({ k, timingData: [[1, 0.01, 4]] }))]));
  const config: Config = { scoresBucket: SCORES, archiveBucket: ARCHIVE, force: new Set(), dryRun: false };
  const quiet = { now: () => NOW, log: () => {} };

  function setup(built: string[] = [], scoresBucket = scores) {
    const archive = new Map<string, Buffer>(built.length ? [[MANIFEST, manifestBody(built.map(entry))]] : []);
    const order: string[] = [];
    const failing = new Set<string>();
    fakeS3(s3Mock, { [SCORES]: scoresBucket, [ARCHIVE]: archive });
    s3Mock.on(PutObjectCommand).callsFake(async (input) => {
      if (failing.has(input.Key)) throw new Error('boom');
      archive.set(input.Key, await bodyToBuffer(input.Body));
      order.push(input.Key);
      return {};
    });
    const manifest = () => (JSON.parse(archive.get(MANIFEST)!.toString()) as Manifest).archives;
    return { archive, order, failing, manifest };
  }

  it('builds the months missing from the manifest and records each one as soon as it is done', async () => {
    const { archive, order, manifest } = setup(['2026-08']);

    const result = await run(s3, config, quiet);

    expect(result).toEqual({ planned: ['2026-09', '2026-10'], built: ['2026-09', '2026-10'], failed: [] });
    expect(order).toEqual([archiveOf('2026-09'), MANIFEST, archiveOf('2026-10'), MANIFEST]);
    expect((await readTarZst(archive.get(archiveOf('2026-09'))!)).map((e) => e.name)).toEqual([keys[1], keys[2]]);
    expect(manifest()).toEqual([
      entry('2026-08'),
      {
        month: '2026-09',
        path: '/archive/scores-2026-09.tar.zst',
        bytes: archive.get(archiveOf('2026-09'))!.length,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        objects: 2,
        rawBytes: scores.get(keys[1])!.length + scores.get(keys[2])!.length,
        generatedAt: NOW.toISOString(),
      },
      expect.objectContaining({ month: '2026-10', objects: 1 }),
    ]);
  });

  it('writes nothing in dry-run mode', async () => {
    const { order } = setup();
    const result = await run(s3, { ...config, dryRun: true }, quiet);

    expect(result.planned).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(order).toEqual([]);
  });

  it('keeps going after one month fails and leaves that month out of the manifest', async () => {
    const { manifest } = setup();
    s3Mock.on(GetObjectCommand, { Bucket: SCORES, Key: keys[1] }).rejects(new Error('boom'));

    const result = await run(s3, config, quiet);

    expect(result).toMatchObject({ built: ['2026-08', '2026-10'], failed: ['2026-09'] });
    expect(manifest().map((a) => a.month)).toEqual(['2026-08', '2026-10']);
  });

  it('rebuilds a forced month as an empty archive once its scores have been deleted', async () => {
    const { archive, manifest } = setup(['2026-08', '2026-09', '2026-10'], new Map([...scores].filter(([k]) => k !== keys[0])));

    const result = await run(s3, { ...config, force: new Set(['2026-08']) }, quiet);

    expect(result.built).toEqual(['2026-08']);
    expect(await readTarZst(archive.get(archiveOf('2026-08'))!)).toEqual([]);
    expect(manifest()[0]).toMatchObject({ month: '2026-08', objects: 0, generatedAt: NOW.toISOString() });
  });

  it('builds a forced month in progress and rebuilds it once the month has ended', async () => {
    const { manifest, archive } = setup(['2026-08', '2026-09', '2026-10']);

    const forced = await run(s3, { ...config, force: new Set(['2026-11']) }, quiet);

    expect(forced.built).toEqual(['2026-11']);
    expect(manifest()[3]).toMatchObject({ month: '2026-11', objects: 1 });

    const partial = archive.get(archiveOf('2026-11'));
    expect((await run(s3, config, quiet)).planned).toEqual([]);
    const ended = await run(s3, config, { ...quiet, now: () => new Date(Date.UTC(2026, 11, 1, 1)) });

    expect(ended.built).toEqual(['2026-11']);
    expect(archive.get(archiveOf('2026-11'))).not.toBe(partial);
    expect(manifest()[3]).toMatchObject({ month: '2026-11', generatedAt: '2026-12-01T01:00:00.000Z' });
  });

  it('dates a forced month from the start of the run, so a build that crosses the month end is rebuilt', async () => {
    const { manifest } = setup(['2026-08', '2026-09', '2026-10']);
    const ended = new Date(Date.UTC(2026, 11, 1, 0, 1));
    const times = [NOW, ended];

    await run(s3, { ...config, force: new Set(['2026-11']) }, { ...quiet, now: () => times.shift() ?? ended });

    expect(manifest()[3]).toMatchObject({ month: '2026-11', generatedAt: NOW.toISOString() });
    expect((await run(s3, config, { ...quiet, now: () => ended })).planned).toEqual(['2026-11']);
  });

  it('builds only what the previous run left unfinished', async () => {
    const { order, failing, manifest } = setup();
    failing.add(archiveOf('2026-09'));
    await run(s3, config, quiet);
    failing.clear();
    order.length = 0;

    const result = await run(s3, config, quiet);

    expect(result).toEqual({ planned: ['2026-09'], built: ['2026-09'], failed: [] });
    expect(order).toEqual([archiveOf('2026-09'), MANIFEST]);
    expect(manifest().map((a) => a.month)).toEqual(['2026-08', '2026-09', '2026-10']);
  });
});
