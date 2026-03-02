import { PrismaClient } from '../api/prisma/generated/client';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { extractAndProcessPack } from '../api/src/utils/pack-processor';
import { Simfile } from '../api/src/utils/simfile/calc-hash';
import pLimit from 'p-limit';

interface Args {
  bucket: string;
  prefix: string;
  write: boolean;
  concurrency: number;
  limit?: number;
  resumeFrom?: string;
  filter?: string;
  force: boolean;
}

interface Stats {
  packsTotal: number;
  packsProcessed: number;
  packsFailed: number;
  simfilesProcessed: number;
  simfilesFailed: number;
  chartsSeen: number;
  chartsUpdated: number;
  chartsSkipped: number;
  chartsMissing: number;
}

const prisma = new PrismaClient();
const s3Client = new S3Client();

function printUsage(): void {
  console.log(
    `Usage: npx tsx scripts/backfill-chart-note-data.ts [options]\n\nOptions:\n  --write                Persist note data updates (default: dry-run)\n  --dry-run              Do not write to the database (default)\n  --force                Update even when charts already have noteData\n  --bucket <name>        S3 bucket containing pack uploads (default: arrow-cloud-packs or $PACK_BUCKET)\n  --prefix <prefix>      Key prefix to search for pack zips (default: pack-uploads/)\n  --concurrency <n>      Number of packs to process in parallel (default: 2)\n  --limit <n>            Only process the first n packs after filtering\n  --resume-from <key>    Resume after the provided key (exclusive)\n  --filter <substr>      Only process keys containing the substring\n  --help                 Show this message\n`,
  );
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {
    bucket: process.env.PACK_BUCKET || 'arrow-cloud-packs',
    prefix: 'pack-uploads/',
    write: false,
    concurrency: parseInt(process.env.BACKFILL_PACK_CONCURRENCY || '2', 10),
    force: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--write':
        args.write = true;
        break;
      case '--dry-run':
        args.write = false;
        break;
      case '--force':
        args.force = true;
        break;
      case '--bucket':
        args.bucket = argv[++i];
        break;
      case '--prefix':
        args.prefix = argv[++i];
        break;
      case '--concurrency':
        args.concurrency = parseInt(argv[++i], 10);
        break;
      case '--limit':
        args.limit = parseInt(argv[++i], 10);
        break;
      case '--resume-from':
        args.resumeFrom = argv[++i];
        break;
      case '--filter':
        args.filter = argv[++i];
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printUsage();
        process.exit(1);
    }
  }

  return args;
}

async function listPackKeys(bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    const contents = response.Contents ?? [];
    for (const object of contents) {
      if (object.Key && object.Key.endsWith('.zip')) {
        keys.push(object.Key);
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys.sort();
}

async function downloadPack(bucket: string, key: string): Promise<Buffer> {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  const body = response.Body as unknown;

  if (!body) {
    throw new Error('Missing object body');
  }

  if (typeof (body as any).transformToByteArray === 'function') {
    const bytes = await (body as any).transformToByteArray();
    return Buffer.from(bytes);
  }

  const webStream = (body as any).transformToWebStream?.();
  if (webStream) {
    const reader = webStream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function updateChartNoteData(chartHash: string, noteData: string, args: Args, stats: Stats): Promise<void> {
  stats.chartsSeen += 1;

  const existing = await prisma.chart.findUnique({
    where: { hash: chartHash },
    select: { noteData: true },
  });

  if (!existing) {
    stats.chartsMissing += 1;
    console.warn(`   ⚠️ Chart not found for hash ${chartHash}`);
    return;
  }

  if (!args.force && existing.noteData) {
    stats.chartsSkipped += 1;
    return;
  }

  if (args.write) {
    await prisma.chart.update({
      where: { hash: chartHash },
      data: { noteData },
    });
  }

  stats.chartsUpdated += 1;
}

async function processPack(key: string, index: number, total: number, args: Args, stats: Stats): Promise<void> {
  console.log(`📦 [${index + 1}/${total}] ${key}`);

  let zipBuffer: Buffer;
  try {
    zipBuffer = await downloadPack(args.bucket, key);
  } catch (error) {
    stats.packsFailed += 1;
    console.error(`   ❌ Failed to download ${key}:`, error);
    return;
  }

  let packData;
  try {
    packData = await extractAndProcessPack(zipBuffer);
  } catch (error) {
    stats.packsFailed += 1;
    console.error(`   ❌ Failed to extract ${key}:`, error);
    return;
  }

  stats.packsProcessed += 1;

  const { simfiles } = packData;
  console.log(`   🎵 Simfiles: ${simfiles.length}`);

  for (const simfileData of simfiles) {
    try {
      const simfile = new Simfile(simfileData.simfileContent);
      stats.simfilesProcessed += 1;

      for (const chart of simfile.charts) {
        const chartHash = chart.calculateHash();
        await updateChartNoteData(chartHash, chart.noteData, args, stats);
      }
    } catch (error) {
      stats.simfilesFailed += 1;
      console.error(`   ❌ Failed to process simfile ${simfileData.folderName} in ${key}:`, error);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  const stats: Stats = {
    packsTotal: 0,
    packsProcessed: 0,
    packsFailed: 0,
    simfilesProcessed: 0,
    simfilesFailed: 0,
    chartsSeen: 0,
    chartsUpdated: 0,
    chartsSkipped: 0,
    chartsMissing: 0,
  };

  console.log('🚀 Backfilling chart noteData values');
  console.log(`🪣 Bucket: ${args.bucket}`);
  console.log(`🔑 Prefix: ${args.prefix}`);
  console.log(`✍️ Mode: ${args.write ? 'WRITE' : 'DRY-RUN'}`);
  console.log(`⚙️ Force updates: ${args.force ? 'Yes' : 'No'}`);
  console.log(`⚡ Concurrency: ${args.concurrency}`);

  const allKeys = await listPackKeys(args.bucket, args.prefix);
  let keys = allKeys;

  if (args.resumeFrom) {
    keys = keys.filter((k) => k > args.resumeFrom!);
    console.log(`⏩ Resuming after ${args.resumeFrom}, ${keys.length} keys remain`);
  }

  if (args.filter) {
    keys = keys.filter((k) => k.includes(args.filter!));
    console.log(`🔎 Filtered by "${args.filter}": ${keys.length} keys`);
  }

  if (args.limit !== undefined) {
    keys = keys.slice(0, args.limit);
    console.log(`📉 Limited to first ${keys.length} keys`);
  }

  if (keys.length === 0) {
    console.log('Nothing to process.');
    return;
  }

  stats.packsTotal = keys.length;
  console.log(`📦 Packs to process: ${stats.packsTotal}`);

  const limit = pLimit(args.concurrency);
  await Promise.all(keys.map((key, index) => limit(() => processPack(key, index, keys.length, args, stats))));

  console.log('\n✅ Backfill complete');
  console.log(`   Packs processed: ${stats.packsProcessed}/${stats.packsTotal}`);
  if (stats.packsFailed > 0) console.log(`   Packs failed: ${stats.packsFailed}`);
  console.log(`   Simfiles processed: ${stats.simfilesProcessed}`);
  if (stats.simfilesFailed > 0) console.log(`   Simfiles failed: ${stats.simfilesFailed}`);
  console.log(`   Charts seen: ${stats.chartsSeen}`);
  console.log(`   Charts updated: ${stats.chartsUpdated}${args.write ? '' : ' (dry-run)'}`);
  console.log(`   Charts skipped (already populated): ${stats.chartsSkipped}`);
  if (stats.chartsMissing > 0) console.log(`   Charts missing in DB: ${stats.chartsMissing}`);
}

main()
  .catch((error) => {
    console.error('Fatal error during backfill:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch((err) => console.error('Failed to disconnect prisma:', err));
  });
