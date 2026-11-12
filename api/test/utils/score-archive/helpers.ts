import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  CreateMultipartUploadCommandInput,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
  UploadPartCommand,
  UploadPartCommandInput,
} from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@smithy/util-stream';
import { AwsClientStub } from 'aws-sdk-client-mock';
import { Readable } from 'stream';
import * as tar from 'tar-stream';
import * as zlib from 'zlib';
import { monthOf, ScoreObject } from '../../../src/utils/score-archive/keys';

export const SCORES = 'arrow-cloud-scores';
export const ARCHIVE = 'arrow-cloud-score-archive';

export interface TarEntry {
  name: string;
  data: Buffer;
  mtime?: Date;
  mode?: number;
}

export async function readTarZst(archive: Buffer): Promise<TarEntry[]> {
  const extract = tar.extract();
  const entries: TarEntry[] = [];
  extract.on('entry', (header, stream, next) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk as Buffer));
    stream.on('end', () => {
      entries.push({ name: header.name, data: Buffer.concat(chunks), mtime: header.mtime, mode: header.mode });
      next();
    });
  });
  await new Promise<void>((resolve, reject) => {
    extract.on('finish', resolve);
    extract.on('error', reject);
    extract.end(zlib.zstdDecompressSync(archive));
  });
  return entries;
}

export function scoreKey(hash: string, userId: number, timestampMs: number): string {
  return `scores/${hash}/${userId}/${timestampMs}.json`;
}

export function scoreObjects(bodies: Buffer[], startMs: number): { objects: ScoreObject[]; contents: Map<string, Buffer> } {
  const objects = bodies.map((body, i) => ({
    key: scoreKey('h', i, startMs + i * 1000),
    size: body.length,
    timestampMs: startMs + i * 1000,
    month: monthOf(new Date(startMs)),
  }));
  return { objects, contents: new Map(objects.map((o, i) => [o.key, bodies[i]])) };
}

/** ListObjectsV2 and GetObject over in-memory buckets. */
export function fakeS3(s3Mock: AwsClientStub<S3Client>, buckets: Record<string, Map<string, Buffer>>, pageSize = 2): void {
  s3Mock.on(ListObjectsV2Command).callsFake(async (input: { Bucket: string; Prefix?: string; ContinuationToken?: string }) => {
    const all = [...(buckets[input.Bucket] ?? new Map<string, Buffer>())]
      .filter(([key]) => key.startsWith(input.Prefix ?? ''))
      .sort(([a], [b]) => (a < b ? -1 : 1));
    const start = input.ContinuationToken ? Number(input.ContinuationToken) : 0;
    const truncated = start + pageSize < all.length;
    return {
      Contents: all.slice(start, start + pageSize).map(([Key, body]) => ({ Key, Size: body.length })),
      IsTruncated: truncated,
      NextContinuationToken: truncated ? String(start + pageSize) : undefined,
    };
  });
  s3Mock.on(GetObjectCommand).callsFake(async (input: { Bucket: string; Key: string }) => {
    const body = buckets[input.Bucket]?.get(input.Key);
    if (!body) throw Object.assign(new Error(`NoSuchKey: ${input.Bucket}/${input.Key}`), { name: 'NoSuchKey' });
    return { Body: sdkStreamMixin(Readable.from([body])) };
  });
}

export async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }
  throw new Error(`Unexpected body type ${typeof body}`);
}

export interface CapturedPut {
  input: PutObjectCommandInput;
  body: Buffer;
}

export function capturePuts(s3Mock: AwsClientStub<S3Client>): CapturedPut[] {
  const puts: CapturedPut[] = [];
  s3Mock.on(PutObjectCommand).callsFake(async (input: PutObjectCommandInput) => {
    puts.push({ input, body: await bodyToBuffer(input.Body) });
    return {};
  });
  // A multipart upload is captured as one put once it completes
  const uploads = new Map<string, { input: CreateMultipartUploadCommandInput; parts: Map<number, Buffer> }>();
  s3Mock.on(CreateMultipartUploadCommand).callsFake(async (input: CreateMultipartUploadCommandInput) => {
    const UploadId = `upload-${uploads.size + 1}`;
    uploads.set(UploadId, { input, parts: new Map() });
    return { UploadId };
  });
  s3Mock.on(UploadPartCommand).callsFake(async (input: UploadPartCommandInput) => {
    uploads.get(input.UploadId!)!.parts.set(input.PartNumber!, await bodyToBuffer(input.Body));
    return { ETag: `"part-${input.PartNumber}"` };
  });
  s3Mock.on(CompleteMultipartUploadCommand).callsFake(async (input: { UploadId: string }) => {
    const { input: created, parts } = uploads.get(input.UploadId)!;
    const body = Buffer.concat([...parts].sort(([a], [b]) => a - b).map(([, part]) => part));
    puts.push({ input: created, body });
    return {};
  });
  return puts;
}
