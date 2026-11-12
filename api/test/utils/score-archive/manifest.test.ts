import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { Manifest, ManifestEntry, readManifest, writeManifest } from '../../../src/utils/score-archive/manifest';
import { ARCHIVE, bodyToBuffer, fakeS3 } from './helpers';

const s3Mock = mockClient(S3Client);
const s3 = new S3Client({ region: 'us-east-2' });

const entry = (month: string): ManifestEntry => ({
  month,
  path: `/archive/scores-${month}.tar.zst`,
  bytes: 50,
  sha256: 'ab'.repeat(32),
  objects: 1,
  rawBytes: 40,
  generatedAt: '2026-09-01T01:00:00.000Z',
});

beforeEach(() => s3Mock.reset());

describe('readManifest', () => {
  it('returns the archives list', async () => {
    const manifest: Manifest = { generatedAt: '2026-10-01T01:00:00.000Z', archives: [entry('2026-08')] };
    fakeS3(s3Mock, { [ARCHIVE]: new Map([['archive/manifest.json', Buffer.from(JSON.stringify(manifest))]]) });

    expect(await readManifest(s3, ARCHIVE)).toEqual([entry('2026-08')]);
  });

  it('returns nothing when the manifest has not been written yet', async () => {
    fakeS3(s3Mock, {});

    expect(await readManifest(s3, ARCHIVE)).toEqual([]);
  });

  it('rejects a manifest that does not have the expected shape', async () => {
    const malformed = { generatedAt: '2026-10-01T01:00:00.000Z', archives: [{ ...entry('2026-08'), month: undefined }] };
    fakeS3(s3Mock, { [ARCHIVE]: new Map([['archive/manifest.json', Buffer.from(JSON.stringify(malformed))]]) });

    await expect(readManifest(s3, ARCHIVE)).rejects.toThrow('month');
  });

  it('surfaces other errors', async () => {
    s3Mock.on(GetObjectCommand).rejects(Object.assign(new Error('AccessDenied'), { name: 'AccessDenied' }));

    await expect(readManifest(s3, ARCHIVE)).rejects.toThrow('AccessDenied');
  });
});

describe('writeManifest', () => {
  it('writes the entries sorted by month', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await writeManifest(s3, ARCHIVE, [entry('2026-09'), entry('2026-08')], '2026-10-01T01:00:00.000Z');

    const input = s3Mock.commandCalls(PutObjectCommand)[0].args[0].input;
    expect(input).toMatchObject({ Bucket: ARCHIVE, Key: 'archive/manifest.json', ContentType: 'application/json' });
    expect(JSON.parse((await bodyToBuffer(input.Body)).toString())).toEqual({
      generatedAt: '2026-10-01T01:00:00.000Z',
      archives: [entry('2026-08'), entry('2026-09')],
    });
  });
});
