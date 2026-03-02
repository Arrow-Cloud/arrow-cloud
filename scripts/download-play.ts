#!/usr/bin/env tsx
/**
 * Download raw play submission JSON from S3 using a play id.
 *
 * Usage:
 *   npx tsx scripts/download-play.ts <playId> [additionalPlayIds...] [--out ./downloads/plays] [--stdout] [--pretty]
 *
 * Examples:
 *   npx tsx scripts/download-play.ts 42
 *   npx tsx scripts/download-play.ts 42 43 44 --out ./tmp/plays
 *   npx tsx scripts/download-play.ts 42 --stdout --pretty | jq '.timingData[0:5]'
 *
 * Notes:
 * - Requires AWS credentials with s3:GetObject permission for the bucket in the play's rawTimingDataUrl.
 * - Output files default to: <outDir>/play-<playId>.json
 * - If --stdout is provided you must specify exactly one play id.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '../api/prisma/generated/client';
import * as fs from 'fs';
import * as path from 'path';

interface CliOptions {
  playIds: number[];
  outDir: string;
  stdout: boolean;
  pretty: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const playIds: number[] = [];
  let outDir = path.resolve('downloads/plays');
  let stdout = false;
  let pretty = false;
  for (const arg of argv) {
    if (arg === '--stdout') stdout = true;
    else if (arg === '--pretty') pretty = true;
    else if (arg === '--help' || arg === '-h') {
      printHelpAndExit();
    } else if (arg === '--out') {
      // next arg consumed later; handled in index-based loop version
    }
  }

  // Re-run with index-based for options that take values
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') {
      const next = argv[i + 1];
      if (!next) {
        console.error('Missing value after --out');
        process.exit(1);
      }
      outDir = path.resolve(next);
      i++;
      continue;
    }
    if (arg.startsWith('-')) continue;
    if (/^\d+$/.test(arg)) playIds.push(parseInt(arg, 10));
  }

  return { playIds, outDir, stdout, pretty };
}

function printHelpAndExit(): never {
  console.log(
    `Download raw play submission JSON from S3 using play id(s).\n\nUsage:\n  npx tsx scripts/download-play.ts <playId> [moreIds...] [--out ./downloads/plays] [--stdout] [--pretty]\n\nOptions:\n  --out <dir>    Output directory (default: downloads/plays)\n  --stdout       Print JSON to stdout (only when a single play id specified)\n  --pretty       Pretty-print JSON (indent 2)\n  -h, --help     Show this help message\n`,
  );
  process.exit(0);
}

async function main() {
  const argv = process.argv.slice(2);
  const { playIds, outDir, stdout, pretty } = parseArgs(argv);

  if (playIds.length === 0) {
    console.error('No play ids provided. Use --help for usage.');
    process.exit(1);
  }
  if (stdout && playIds.length !== 1) {
    console.error('--stdout requires exactly one play id.');
    process.exit(1);
  }

  if (!stdout) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const prisma = new PrismaClient();
  const s3 = new S3Client();
  let overallFailures = 0;

  for (const playId of playIds) {
    try {
      const play = await prisma.play.findUnique({
        where: { id: playId },
        select: {
          id: true,
          // rawTimingDataUrl may be null if play stored differently
          rawTimingDataUrl: true,
          createdAt: true,
          chartHash: true,
          userId: true,
        },
      });
      if (!play) {
        console.error(`Play ${playId} not found`);
        overallFailures++;
        continue;
      }
      if (!play.rawTimingDataUrl) {
        console.error(`Play ${playId} missing rawTimingDataUrl`);
        overallFailures++;
        continue;
      }

      const url = new URL(play.rawTimingDataUrl);
      const bucket = url.hostname;
      const key = url.pathname.slice(1);

      process.stderr.write(`Downloading play ${playId} from s3://${bucket}/${key}...\n`);
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!obj.Body) {
        console.error(`Empty S3 object for play ${playId}`);
        overallFailures++;
        continue;
      }
      const body = await obj.Body.transformToString();
      let parsed: any;
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        console.error(`Failed to parse JSON for play ${playId}: ${(e as Error).message}`);
        overallFailures++;
        continue;
      }

      const envelope = {
        meta: {
          playId: play.id,
          userId: play.userId,
          chartHash: play.chartHash,
          createdAt: play.createdAt.toISOString(),
          source: play.rawTimingDataUrl,
          downloadedAt: new Date().toISOString(),
        },
        submission: parsed,
      };

      if (stdout) {
        process.stdout.write(JSON.stringify(envelope, null, pretty ? 2 : 0));
      } else {
        const outFile = path.join(outDir, `play-${playId}.json`);
        fs.writeFileSync(outFile, JSON.stringify(envelope, null, pretty ? 2 : 0));
        process.stderr.write(`Saved -> ${outFile}\n`);
      }
    } catch (e) {
      console.error(`Unexpected error fetching play ${playId}:`, (e as Error).message);
      overallFailures++;
    }
  }

  await prisma.$disconnect();
  if (overallFailures > 0) {
    console.error(`Completed with ${overallFailures} failure(s).`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
