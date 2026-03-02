import sharp from 'sharp';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { S3_BUCKET_ASSETS } from '../api/src/utils/s3';
import type { ImageVariantEntry, ImageVariantSet } from '../api/src/utils/s3';

const client = new S3Client();

const FORMATS: Array<ImageVariantEntry['format']> = ['jpeg', 'webp', 'avif'];
const SIZES: Array<{ size: 'orig' | 'md' | 'sm'; width: number | null }> = [
  { size: 'orig', width: null },
  { size: 'md', width: 512 },
  { size: 'sm', width: 256 },
];

export async function generateAndUploadBannerVariantSet(imageBuffer: Buffer, baseKey: string): Promise<ImageVariantSet> {
  const quality = 80;
  const variantEntries: ImageVariantEntry[] = [];

  for (const { size, width } of SIZES) {
    for (const format of FORMATS) {
      let pipeline = sharp(imageBuffer);
      if (width) pipeline = pipeline.resize({ width });
      if (format === 'jpeg') pipeline = pipeline.jpeg({ quality, progressive: true });
      if (format === 'webp') pipeline = pipeline.webp({ quality });
      if (format === 'avif') pipeline = pipeline.avif({ quality });
      const outBuffer = await pipeline.toBuffer();
      const key = `${baseKey}_${size}.${format}`;
      await client.send(
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
