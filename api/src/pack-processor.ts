import type { S3Event, S3Handler } from 'aws-lambda';
import { PrismaClient } from '../prisma/generated/client';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import pLimit from 'p-limit';
import { extractAndProcessPack } from './utils/pack-processor';
import { Simfile } from './utils/simfile/calc-hash';
import { getDatabaseUrl } from './utils/secrets';
import { deleteS3Object, uploadImageToS3, generateAndUploadBannerVariantSet } from './utils/s3';
import { publishDiscordMessage } from './utils/discordNotify';

// Environment/config
const SIMFILE_CONCURRENCY_LIMIT = parseInt(process.env.SIMFILE_CONCURRENCY_LIMIT || '3', 10);

let prisma: PrismaClient | undefined;

async function getPrisma(): Promise<PrismaClient> {
  if (!prisma) {
    const databaseUrl = await getDatabaseUrl();
    prisma = new PrismaClient({
      datasources: {
        db: { url: databaseUrl },
      },
      // Limit connection pool to avoid overwhelming the database
      // Each Lambda instance will have its own pool
      log: ['warn', 'error'],
    });
  }
  return prisma;
}

// Utility helpers copied from the script (trimmed for Lambda usage)
function sanitizeS3Key(path: string): string {
  return (
    path
      .replace(/[#%]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/[&<>'"]/g, '-')
      .replace(/[()[\]{}]/g, '')
      /* eslint-disable-next-line no-useless-escape */
      .replace(/[^\w\-_.\/]/g, '')
      .replace(/_+/g, '_')
      .replace(/-+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      .toLowerCase()
  );
}

function extractS3Key(s3Url: string | null | undefined): string | null {
  if (!s3Url) return null;
  if (!s3Url.startsWith('s3://')) return null;
  const without = s3Url.slice(5);
  const firstSlash = without.indexOf('/');
  if (firstSlash === -1) return null;
  return without.slice(firstSlash + 1);
}

async function deleteExistingImageUrls(urls: Array<string | null | undefined>): Promise<void> {
  const keys = urls.map((u) => extractS3Key(u)).filter((k): k is string => !!k);
  if (keys.length === 0) return;
  await Promise.all(
    keys.map(async (key) => {
      try {
        await deleteS3Object(key);
      } catch (err) {
        console.warn(`Failed to delete ${key}: ${err}`);
      }
    }),
  );
}

async function downloadPackFromS3(bucket: string, key: string): Promise<Buffer> {
  const s3Client = new S3Client();
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  if (!response.Body) throw new Error('No data found in S3 file');
  const chunks: Uint8Array[] = [];
  const reader = response.Body.transformToWebStream().getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function processCharts(charts: any[], createdSimfile: any, simfileMetadata: any) {
  for (const chart of charts) {
    const chartHash = chart.calculateHash();

    // Upsert chart
    await (
      await getPrisma()
    ).chart.upsert({
      where: { hash: chartHash },
      update: {
        stepsType: chart.metadata.stepsType,
        difficulty: chart.metadata.difficulty,
        description: chart.metadata.description,
        meter: chart.metadata.meter,
        chartName: chart.metadata.chartName,
        credit: chart.metadata.credit,
        radarValues: chart.metadata.radarValues,
        chartBpms: chart.metadata.bpms,
        noteData: chart.noteData,
        songName: simfileMetadata.title,
        artist: simfileMetadata.artist,
        rating: chart.metadata.meter,
        stepartist: chart.metadata.credit,
      },
      create: {
        hash: chartHash,
        stepsType: chart.metadata.stepsType,
        difficulty: chart.metadata.difficulty,
        description: chart.metadata.description,
        meter: chart.metadata.meter,
        chartName: chart.metadata.chartName,
        credit: chart.metadata.credit,
        radarValues: chart.metadata.radarValues,
        chartBpms: chart.metadata.bpms,
        noteData: chart.noteData,
        songName: simfileMetadata.title,
        artist: simfileMetadata.artist,
        rating: chart.metadata.meter,
        length: '0:00',
        stepartist: chart.metadata.credit,
      },
    });

    // Upsert pivot
    await (
      await getPrisma()
    ).simfileChart.upsert({
      where: { simfileId_chartHash: { simfileId: createdSimfile.id, chartHash } },
      update: {
        chartName: chart.metadata.chartName,
        stepsType: chart.metadata.stepsType,
        description: chart.metadata.description,
        difficulty: chart.metadata.difficulty,
        meter: chart.metadata.meter,
        credit: chart.metadata.credit,
      },
      create: {
        simfileId: createdSimfile.id,
        chartHash,
        chartName: chart.metadata.chartName,
        stepsType: chart.metadata.stepsType,
        description: chart.metadata.description,
        difficulty: chart.metadata.difficulty,
        meter: chart.metadata.meter,
        credit: chart.metadata.credit,
      },
    });
  }
}

async function processSimfile(analysis: any, packId: number, uploadFileName: string) {
  const { folderName, simfile, simfileData } = analysis;

  const simfileHash = simfile.calculateHash();
  const existingSimfile = await (await getPrisma()).simfile.findFirst({ where: { hash: simfileHash } });
  if (existingSimfile) {
    await deleteExistingImageUrls([
      existingSimfile.bannerUrl,
      existingSimfile.mdBannerUrl,
      existingSimfile.smBannerUrl,
      existingSimfile.backgroundUrl,
      existingSimfile.jacketUrl,
    ]);
  }

  // Upload images and generate variants
  const sanitizedUploadFileName = sanitizeS3Key(uploadFileName);
  const sanitizedFolderName = sanitizeS3Key(folderName);

  let bannerUrl: string | null = null;
  let bannerVariants = null;
  let backgroundUrl: string | null = null;
  let jacketUrl: string | null = null;

  if (simfileData.bannerImage) {
    const baseKey = `simfiles/${sanitizedUploadFileName}/${sanitizedFolderName}/banner`;
    const key = `${baseKey}.${simfileData.bannerImage.extension}`;
    bannerUrl = await uploadImageToS3(simfileData.bannerImage.data, key, simfileData.bannerImage.mimeType);
    
    // Generate optimized variants (AVIF, WebP, JPEG in multiple sizes)
    try {
      bannerVariants = await generateAndUploadBannerVariantSet(simfileData.bannerImage.data, baseKey);
      console.log(`Generated ${bannerVariants.all.length} banner variants for ${simfile.metadata.title}`);
    } catch (error) {
      console.error(`Failed to generate banner variants for ${simfile.metadata.title}:`, error);
      // Continue without variants if generation fails
    }
  }
  if (simfileData.backgroundImage) {
    const key = `simfiles/${sanitizedUploadFileName}/${sanitizedFolderName}/background.${simfileData.backgroundImage.extension}`;
    backgroundUrl = await uploadImageToS3(simfileData.backgroundImage.data, key, simfileData.backgroundImage.mimeType);
  }
  if (simfileData.jacketImage) {
    const key = `simfiles/${sanitizedUploadFileName}/${sanitizedFolderName}/jacket.${simfileData.jacketImage.extension}`;
    jacketUrl = await uploadImageToS3(simfileData.jacketImage.data, key, simfileData.jacketImage.mimeType);
  }

  const data = {
    packId,
    title: simfile.metadata.title,
    subtitle: simfile.metadata.subtitle,
    artist: simfile.metadata.artist,
    genre: simfile.metadata.genre,
    credit: simfile.metadata.credit,
    music: simfile.metadata.music,
    banner: simfile.metadata.banner,
    background: simfile.metadata.background,
    offset: simfile.metadata.offset,
    bpms: simfile.metadata.bpms,
    stops: simfile.metadata.stops,
    version: simfile.metadata.version,
    bannerUrl,
    bannerVariants: bannerVariants as any, // Cast to any for Prisma JSON field compatibility
    backgroundUrl,
    jacketUrl,
  };

  let createdSimfile;
  if (existingSimfile) {
    createdSimfile = await (await getPrisma()).simfile.update({ where: { id: existingSimfile.id }, data });
  } else {
    createdSimfile = await (await getPrisma()).simfile.create({ data: { hash: simfileHash, ...data } });
  }

  await processCharts(simfile.charts, createdSimfile, simfile.metadata);
}

export const handler: S3Handler = async (event: S3Event) => {
  console.log(`Received ${event.Records.length} S3 record(s)`);

  try {
    const prismaClient = await getPrisma();
    const limit = pLimit(SIMFILE_CONCURRENCY_LIMIT);

    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

      if (!key.toLowerCase().endsWith('.zip')) {
        console.log(`Skipping non-zip object: s3://${bucket}/${key}`);
        continue;
      }

      console.log(`Processing uploaded pack: s3://${bucket}/${key}`);

      // 1) Download the uploaded zip
      const zipBuffer = await downloadPackFromS3(bucket, key);

      // 2) Analyze the contents
      const packData = await extractAndProcessPack(zipBuffer);
      const simfileAnalysis = packData.simfiles.map((simfileData: any) => {
        const simfile = new Simfile(simfileData.simfileContent);
        const chartAnalysisForSimfile = simfile.charts.map((chart: any) => ({
          hash: chart.calculateHash(),
          stepsType: chart.metadata.stepsType,
          difficulty: chart.metadata.difficulty,
          meter: chart.metadata.meter,
          credit: chart.metadata.credit || 'Unknown',
          hasBanner: !!simfileData.bannerImage,
          hasBackground: !!simfileData.backgroundImage,
          hasJacket: !!simfileData.jacketImage,
        }));

        return {
          folderName: simfileData.folderName,
          simfile,
          simfileData,
          charts: chartAnalysisForSimfile,
        };
      });

      // 3) Upsert pack, upload pack banner (original only in Lambda)
      const uploadFileName =
        key
          .split('/')
          .pop()
          ?.replace(/\.zip$/i, '') || 'upload';
      const sanitizedUploadFileName = sanitizeS3Key(uploadFileName);

      let packBannerUrl: string | null = null;
      const packMdBannerUrl: string | null = null;
      const packSmBannerUrl: string | null = null;

      const existingPack = await prismaClient.pack.findUnique({ where: { name: packData.name } });
      if (existingPack) {
        await deleteExistingImageUrls([existingPack.bannerUrl, existingPack.mdBannerUrl, existingPack.smBannerUrl]);
      }

      if (packData.bannerImage) {
        const keyOut = `packs/${sanitizedUploadFileName}/pack-banner.${packData.bannerImage.extension}`;
        packBannerUrl = await uploadImageToS3(packData.bannerImage.data, keyOut, packData.bannerImage.mimeType);
      }

      const pack = existingPack
        ? await prismaClient.pack.update({
            where: { id: existingPack.id },
            data: { bannerUrl: packBannerUrl, mdBannerUrl: packMdBannerUrl, smBannerUrl: packSmBannerUrl },
          })
        : await prismaClient.pack.create({
            data: { name: packData.name, bannerUrl: packBannerUrl, mdBannerUrl: packMdBannerUrl, smBannerUrl: packSmBannerUrl },
          });

      // 4) Process simfiles with concurrency limit
      const tasks = simfileAnalysis.map((analysis: any) => limit(() => processSimfile(analysis, pack.id, sanitizedUploadFileName)));
      await Promise.all(tasks);

      console.log(`Finished processing pack '${pack.name}' from s3://${bucket}/${key}`);

      // Notify Discord that a pack has been processed
      try {
        const baseUrl = process.env.FRONTEND_URL || 'https://arrowcloud.dance';
        const packUrl = `${baseUrl}/pack/${pack.id}`;
        await publishDiscordMessage({
          type: 'admin-event',
          embeds: [
            {
              title: 'Pack processed',
              description: `[${pack.name}](${packUrl}) is now available`,
              color: 0x57f287, // green
            },
          ],
        });
      } catch (e) {
        console.warn('Failed to publish Discord pack processed notification', e);
      }
    }
  } catch (error) {
    console.error('Pack processing Lambda failed:', error);
    throw error; // let Lambda retry per S3 event source retry/Dead letter config
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};
