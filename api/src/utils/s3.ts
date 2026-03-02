import { GetObjectCommand, PutObjectCommand, S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Play } from '../../prisma/generated';
import { PlaySubmission, validatePlaySubmission } from './scoring';

export const S3_BUCKET_ASSETS = process.env.S3_BUCKET_ASSETS || 'arrow-cloud-assets';
export const CLOUDFRONT_ASSETS_URL = process.env.CLOUDFRONT_ASSETS_URL || 'https://assets.arrowcloud.dance';

export async function loadTimingDataFromPlay(play: Play, s3Client: S3Client): Promise<PlaySubmission> {
  // Parse S3 URL: s3://bucket-name/key
  const url = new URL(play.rawTimingDataUrl);
  const bucket = url.hostname;
  const key = url.pathname.substring(1); // Remove leading slash

  console.log(`Fetching timing data from S3 bucket ${bucket}: ${key}`);

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error('No data found in S3 object');
  }

  const bodyString = await response.Body.transformToString();
  const parsedData = JSON.parse(bodyString);
  return validatePlaySubmission(parsedData);
}

export async function uploadImageToS3(imageBuffer: Buffer, key: string, mimeType: string, s3Client?: S3Client): Promise<string> {
  const client = s3Client || new S3Client();

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_ASSETS,
    Key: key,
    Body: imageBuffer,
    ContentType: mimeType,
    CacheControl: 'max-age=31536000', // Cache for 1 year
  });

  await client.send(command);
  return `s3://${S3_BUCKET_ASSETS}/${key}`;
}

export async function deleteS3Object(key: string, s3Client?: S3Client): Promise<void> {
  const client = s3Client || new S3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: S3_BUCKET_ASSETS,
      Key: key,
    }),
  );
}

// Image variant metadata interfaces
export interface ImageVariantEntry {
  format: 'jpeg' | 'webp' | 'avif';
  size: 'orig' | 'md' | 'sm';
  width: number | null;
  url: string;
  key: string;
  bytes?: number;
}
export interface ImageVariantSet {
  original: ImageVariantEntry[];
  md: ImageVariantEntry[];
  sm: ImageVariantEntry[];
  all: ImageVariantEntry[];
}

const FORMATS: Array<ImageVariantEntry['format']> = ['jpeg', 'webp', 'avif'];
const SIZES: Array<{ size: 'orig' | 'md' | 'sm'; width: number | null }> = [
  { size: 'orig', width: null },
  { size: 'md', width: 512 },
  { size: 'sm', width: 256 },
];

/**
 * Generate and upload image variants (AVIF, WebP, JPEG) in multiple sizes (original, md, sm)
 * NOTE: This function requires the sharp library - only available in pack-processor Lambda via layer
 */
export async function generateAndUploadBannerVariantSet(imageBuffer: Buffer, baseKey: string): Promise<ImageVariantSet> {
  // Import sharp (available via Lambda layer in pack-processor)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp');
  
  const quality = 80;
  const variantEntries: ImageVariantEntry[] = [];
  const s3Client = new S3Client();

  for (const { size, width } of SIZES) {
    for (const format of FORMATS) {
      let pipeline = sharp(imageBuffer);
      if (width) pipeline = pipeline.resize({ width });
      if (format === 'jpeg') pipeline = pipeline.jpeg({ quality, progressive: true });
      if (format === 'webp') pipeline = pipeline.webp({ quality });
      if (format === 'avif') pipeline = pipeline.avif({ quality });
      const outBuffer = await pipeline.toBuffer();
      const key = `${baseKey}_${size}.${format}`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET_ASSETS,
          Key: key,
          Body: outBuffer,
          ContentType: `image/${format === 'jpeg' ? 'jpeg' : format}`,
          CacheControl: 'max-age=31536000',
        }),
      );
      variantEntries.push({
        format,
        size,
        width,
        url: `s3://${S3_BUCKET_ASSETS}/${key}`,
        key,
        bytes: outBuffer.length,
      });
    }
  }

  return {
    original: variantEntries.filter((v) => v.size === 'orig'),
    md: variantEntries.filter((v) => v.size === 'md'),
    sm: variantEntries.filter((v) => v.size === 'sm'),
    all: variantEntries,
  };
}

export async function deleteVariantSet(variantSet: ImageVariantSet | null | undefined): Promise<void> {
  if (!variantSet) return;
  await Promise.all(
    variantSet.all.map(async (entry) => {
      try {
        await deleteS3Object(entry.key);
        /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
      } catch (e) {
        // swallow
      }
    }),
  );
}

export function assetS3UrlToCloudFrontUrl(assetUrl: string | null): string | null {
  return assetUrl ? assetUrl.replace(`s3://${S3_BUCKET_ASSETS}`, CLOUDFRONT_ASSETS_URL) : null;
}

/**
 * Helper function to convert image variant set URLs to CloudFront URLs
 * todo: improve typing
 */
export function toCfVariantSet(variantSet: any | null | undefined) {
  if (!variantSet) return undefined;

  const convertEntry = (e: any) => ({ ...e, url: assetS3UrlToCloudFrontUrl(e.url) });
  return {
    original: (variantSet.original || []).map(convertEntry),
    md: (variantSet.md || []).map(convertEntry),
    sm: (variantSet.sm || []).map(convertEntry),
    all: (variantSet.all || []).map(convertEntry),
  };
}
