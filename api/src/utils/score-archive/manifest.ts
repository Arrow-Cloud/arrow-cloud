import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { CACHE_CONTROL, MANIFEST_KEY, MONTH } from './keys';

const manifestEntrySchema = z.object({
  /** UTC `YYYY-MM`. */
  month: z.string().regex(MONTH),
  /** CloudFront path, `/archive/scores-YYYY-MM.tar.zst`. */
  path: z.string(),
  bytes: z.number(),
  sha256: z.string(),
  objects: z.number(),
  rawBytes: z.number(),
  generatedAt: z.string(),
});

const manifestSchema = z.object({
  generatedAt: z.string(),
  archives: z.array(manifestEntrySchema),
});

export type ManifestEntry = z.infer<typeof manifestEntrySchema>;
export type Manifest = z.infer<typeof manifestSchema>;

export async function readManifest(s3: S3Client, bucket: string): Promise<ManifestEntry[]> {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: MANIFEST_KEY }));
    return manifestSchema.parse(JSON.parse(await response.Body!.transformToString())).archives;
  } catch (err) {
    if ((err as Error).name === 'NoSuchKey') return [];
    throw err;
  }
}

export async function writeManifest(s3: S3Client, bucket: string, entries: Iterable<ManifestEntry>, generatedAt: string): Promise<void> {
  const body: Manifest = { generatedAt, archives: [...entries].sort((a, b) => (a.month < b.month ? -1 : 1)) };
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: MANIFEST_KEY,
      Body: JSON.stringify(body, null, 2),
      ContentType: 'application/json',
      CacheControl: CACHE_CONTROL,
    }),
  );
}
