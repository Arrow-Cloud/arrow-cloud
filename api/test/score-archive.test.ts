import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { configFrom, handler } from '../src/score-archive';
import { ARCHIVE, fakeS3, scoreKey, SCORES } from './utils/score-archive/helpers';

const s3Mock = mockClient(S3Client);
const baseEnv = { SCORES_BUCKET: SCORES, ARCHIVE_BUCKET: ARCHIVE };

describe('configFrom', () => {
  it('takes buckets from the environment, force and write from the event', () => {
    expect(configFrom(baseEnv, { force: ['2026-08', '2026-09'], write: true })).toEqual({
      scoresBucket: SCORES,
      archiveBucket: ARCHIVE,
      force: new Set(['2026-08', '2026-09']),
      dryRun: false,
    });
  });

  it('runs dry unless write is exactly true', () => {
    const scheduled = { source: 'aws.events', 'detail-type': 'Scheduled Event', detail: {} } as object;
    expect(configFrom(baseEnv, {})).toMatchObject({ force: new Set(), dryRun: true });
    expect(configFrom(baseEnv, scheduled)).toMatchObject({ dryRun: true });
    expect(configFrom(baseEnv, { write: 'true' })).toMatchObject({ dryRun: true });
    expect(configFrom(baseEnv, { write: false })).toMatchObject({ dryRun: true });
  });

  it('rejects missing buckets and malformed months', () => {
    expect(() => configFrom({ SCORES_BUCKET: SCORES }, {})).toThrow('ARCHIVE_BUCKET');
    expect(() => configFrom(baseEnv, { force: ['2026'] })).toThrow('YYYY-MM');
    expect(() => configFrom(baseEnv, { force: '2026-08' as unknown as string[] })).toThrow('YYYY-MM');
  });
});

describe('handler', () => {
  const env = process.env;
  const key = scoreKey('a', 1, Date.UTC(2020, 0, 15));

  beforeEach(() => {
    s3Mock.reset();
    process.env = { ...env, ...baseEnv, AWS_REGION: 'us-east-2' };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    fakeS3(s3Mock, { [SCORES]: new Map([[key, Buffer.from('{}')]]) });
    s3Mock.on(PutObjectCommand).resolves({});
  });
  afterEach(() => {
    process.env = env;
    jest.restoreAllMocks();
  });

  it('reports what it planned and built', async () => {
    expect(await handler({ write: true })).toEqual({ planned: ['2020-01'], built: ['2020-01'] });
    expect(s3Mock.commandCalls(PutObjectCommand).map((c) => c.args[0].input.Key)).toEqual(['archive/scores-2020-01.tar.zst', 'archive/manifest.json']);
  });

  it('throws when a month failed so the invocation is retried', async () => {
    s3Mock.on(GetObjectCommand, { Bucket: SCORES, Key: key }).rejects(new Error('boom'));
    await expect(handler({ write: true })).rejects.toThrow('Failed to build 2020-01');
  });

  it('writes nothing without a payload', async () => {
    expect(await handler()).toEqual({ planned: ['2020-01'], built: [] });
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });
});
