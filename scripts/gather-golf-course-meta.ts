#!/usr/bin/env tsx
/**
 * Gathers the per-course and per-hole facts that live in the simfile packs, not in the par files, and
 * writes them to scripts/data/golf-course-meta.json - the input scripts/build-golf-courses.ts merges into
 * events/golf/config/courses.json, which GET /courses and GET /courses/{slug} then serve.
 *
 * What comes from where:
 *   course banner  the pack's own image, named by `Banner=` in the pack's Pack.ini.
 *   hole banner    each hole's song folder: the `#BANNER:` tag of its .ssc, or - when the tag is empty,
 *                  as ITGmania itself does - the folder's banner-looking image (`banner.png`, `*-bn.png`).
 *                  A song with no usable image gets no banner (the API returns null for it).
 *   description    hand-written. Nothing in a pack holds one, so it is never overwritten: this script
 *                  keeps whatever the JSON already says and warns when a visible course has none.
 *
 * Images are optimised here, not served as authored (the originals are 0.3-3.6 MB PNGs): each is centre-cropped
 * to the site's banner shape (1024x400), shrunk to at most 1024px wide, and written as WebP. Files are written to
 * scripts/output/golf-assets/ (gitignored), laid out exactly as they should appear under
 * s3://arrow-cloud-assets/misc/golf/, so one `aws s3 sync` uploads everything:
 *
 *   courses/<slug>-<hash>.webp
 *   holes/<chartHash>-<hash>.webp
 *
 * The hash is of the source image plus the optimiser settings, so a changed image or setting gets a NEW file
 * name. That is what lets the files be cached for a year with no CloudFront invalidation: re-run this, upload,
 * rebuild courses.json, deploy GolfBackend. Old files are never overwritten, so a deploy never points at a
 * half-uploaded image. The output folder is emptied at the start of each run so it holds only current files.
 *
 * Which packs: every visible course in courses.json that names a `pack`, looked up as a folder under the
 * songs directory. Holes come from that course's `holes` (chartHash + songFolder).
 *
 * Writes only local files (the JSON, if its content changed, and the output folder) and never touches AWS.
 * Safe to re-run; --dry-run writes nothing.
 *
 * Usage:
 *   npx tsx scripts/gather-golf-course-meta.ts [--songs-dir <dir>] [--out-dir <dir>] [--dry-run]
 *
 * The songs directory defaults to $GOLF_SONGS_DIR, then /mnt/c/Games/ITGmania/Songs.
 *
 * Then: npx tsx scripts/build-golf-courses.ts
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import sharp from 'sharp';

const COURSES_JSON = 'events/golf/config/courses.json';
const META_JSON = 'scripts/data/golf-course-meta.json';
const DEFAULT_OUT_DIR = 'scripts/output/golf-assets';
const BUCKET_PREFIX = 's3://arrow-cloud-assets/misc/golf/';

/** The golf site lays banners out at 1024x400; every image is cropped to this shape and capped at this width. */
const BANNER_WIDTH = 1024;
const BANNER_HEIGHT = 400;
const BANNER_ASPECT = BANNER_WIDTH / BANNER_HEIGHT;
/** Bump when the optimiser settings below change, so existing files get new names. */
const OPTIMISER_VERSION = 'webp-q80-1024x400-v1';
const WEBP_QUALITY = 80;
/** Crops that throw away more than this fraction of the picture are called out. */
const CROP_WARN_FRACTION = 0.2;

interface HoleMeta {
  banner: string;
}

interface CourseMeta {
  description: string;
  /** Path under misc/golf/, e.g. courses/beta-hills-3fa9c1d2.webp. */
  banner: string | null;
  /** Keyed by chartHash. A hole with no usable image is absent. */
  holes: Record<string, HoleMeta>;
}

interface CourseHole {
  holeNumber: number;
  chartHash: string;
  displayName: string;
  songFolder: string;
}

/** Pack.ini is a flat `Key=Value` file under a `[Group]` header. */
function parsePackIni(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([^=;[\s][^=]*?)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;
/** ITGmania's own banner guess when #BANNER is empty: a filename containing "banner" or a standalone "bn". */
const LOOKS_LIKE_BANNER = /banner|(^|[^a-z0-9])bn([^a-z0-9]|$)/i;

/**
 * The banner image for a song folder, or null. The .ssc's `#BANNER:` tag wins when it names a file that exists
 * (it may point outside the folder, e.g. `../bn.png`). Otherwise the folder's banner-looking image, as the game does.
 */
function findHoleBanner(songDir: string): { path: string; how: string } | null {
  if (!existsSync(songDir)) return null;
  const files = readdirSync(songDir);
  for (const ssc of files.filter((f) => /\.ssc$/i.test(f))) {
    const tag = readFileSync(join(songDir, ssc), 'utf-8')
      .match(/^#BANNER:([^;]*);/m)?.[1]
      .trim();
    if (tag && IMAGE_EXT.test(tag) && existsSync(resolve(songDir, tag))) return { path: resolve(songDir, tag), how: `#BANNER ${tag}` };
  }
  const guess = files.filter((f) => IMAGE_EXT.test(f) && LOOKS_LIKE_BANNER.test(f) && !/bg|background|jacket/i.test(f)).sort()[0];
  return guess ? { path: join(songDir, guess), how: `found ${guess}` } : null;
}

interface Optimised {
  fileName: string;
  data: Buffer;
  from: { width: number; height: number; bytes: number };
  /** Fraction of the source picture removed by the crop to banner shape, 0-1. */
  cropped: number;
}

/**
 * Centre-crop to the banner shape, cap the width, encode as WebP. Never enlarges: a small image is cropped but
 * kept at its own size. The file name embeds a hash of the SOURCE bytes + settings (not the output), so it does
 * not change just because the encoder library was upgraded.
 */
async function optimise(sourcePath: string, baseName: string): Promise<Optimised> {
  const source = readFileSync(sourcePath);
  const { width = 0, height = 0 } = await sharp(source).metadata();
  if (!width || !height) throw new Error(`${sourcePath}: could not read image size`);

  // Largest centred box with the banner's aspect ratio.
  const cropW = Math.min(width, Math.round(height * BANNER_ASPECT));
  const cropH = Math.min(height, Math.round(width / BANNER_ASPECT));
  const left = Math.floor((width - cropW) / 2);
  const top = Math.floor((height - cropH) / 2);

  const data = await sharp(source)
    .extract({ left, top, width: cropW, height: cropH })
    .resize({ width: BANNER_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 6 })
    .toBuffer();

  const hash = createHash('sha256').update(source).update(OPTIMISER_VERSION).digest('hex').slice(0, 8);
  return {
    fileName: `${baseName}-${hash}.webp`,
    data,
    from: { width, height, bytes: source.length },
    cropped: 1 - (cropW * cropH) / (width * height),
  };
}

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const flag = (name: string) => (args.indexOf(name) > -1 ? args[args.indexOf(name) + 1] : undefined);
  const songsDir = flag('--songs-dir') || process.env.GOLF_SONGS_DIR || '/mnt/c/Games/ITGmania/Songs';
  const outDir = resolve(flag('--out-dir') || DEFAULT_OUT_DIR);

  const courses: { slug: string; name: string; hidden: boolean; pack: string | null; holes: CourseHole[] }[] = JSON.parse(
    readFileSync(COURSES_JSON, 'utf-8'),
  ).courses;
  const existing: Record<string, Partial<CourseMeta>> = existsSync(META_JSON) ? JSON.parse(readFileSync(META_JSON, 'utf-8')) : {};
  const next: Record<string, CourseMeta> = {};
  const problems: string[] = [];
  const notes: string[] = [];
  let sourceBytes = 0;
  let outputBytes = 0;
  let fileCount = 0;

  if (!dryRun) {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(join(outDir, 'courses'), { recursive: true });
    mkdirSync(join(outDir, 'holes'), { recursive: true });
  }

  const emit = async (sourcePath: string, folder: 'courses' | 'holes', baseName: string, label: string): Promise<string> => {
    const img = await optimise(sourcePath, baseName);
    const rel = `${folder}/${img.fileName}`;
    if (!dryRun) writeFileSync(join(outDir, rel), img.data);
    sourceBytes += img.from.bytes;
    outputBytes += img.data.length;
    fileCount++;
    const crop = img.cropped > CROP_WARN_FRACTION ? `, cropped ${Math.round(img.cropped * 100)}% to fit` : '';
    console.log(`  ${label}: ${img.from.width}x${img.from.height} ${kb(img.from.bytes)} -> ${kb(img.data.length)}${crop}`);
    if (img.cropped > CROP_WARN_FRACTION)
      notes.push(`${label}: ${Math.round(img.cropped * 100)}% of the picture was cropped away to fit the banner shape - check ${rel}`);
    return rel;
  };

  for (const course of courses.filter((c) => !c.hidden)) {
    const prior = existing[course.slug];
    const meta: CourseMeta = { description: prior?.description ?? '', banner: null, holes: {} };
    console.log(`\n${course.name} (${course.slug})`);

    if (!course.pack) {
      problems.push(`${course.slug}: courses.json names no pack`);
    } else {
      const packDir = join(songsDir, course.pack);
      const iniPath = join(packDir, 'Pack.ini');
      if (!existsSync(iniPath)) {
        problems.push(`${course.slug}: ${iniPath} not found - is --songs-dir right?`);
      } else {
        const ini = parsePackIni(readFileSync(iniPath, 'utf-8'));
        console.log(`  Pack.ini: "${ini.DisplayTitle ?? '?'}", ${ini.Series ?? '?'} ${ini.Year ?? ''}`.trimEnd());
        const banner = ini.Banner;
        if (!banner || !existsSync(join(packDir, banner))) {
          problems.push(`${course.slug}: Pack.ini Banner "${banner ?? ''}" is missing from ${packDir}`);
        } else {
          meta.banner = await emit(join(packDir, banner), 'courses', course.slug, `course banner (${banner})`);
        }

        for (const hole of course.holes) {
          const label = `hole ${hole.holeNumber} ${hole.displayName}`;
          const found = findHoleBanner(join(packDir, hole.songFolder));
          if (!found) {
            notes.push(`${label}: no banner image in "${hole.songFolder}" (its #BANNER is empty or points at a missing file) - the API will return null`);
            console.log(`  ${label}: no banner`);
            continue;
          }
          meta.holes[hole.chartHash] = { banner: await emit(found.path, 'holes', hole.chartHash, `${label} (${found.how})`) };
        }
      }
    }

    if (!meta.description.trim()) problems.push(`${course.slug}: no description - write one in ${META_JSON}`);
    else console.log(`  description: ${meta.description}`);
    next[course.slug] = meta;
  }

  const json = JSON.stringify(next, null, 2) + '\n';
  const changed = !existsSync(META_JSON) || readFileSync(META_JSON, 'utf-8') !== json;
  if (changed && !dryRun) writeFileSync(META_JSON, json);
  console.log(`\n${META_JSON}: ${changed ? (dryRun ? 'would be updated' : 'updated') : 'unchanged'}`);
  console.log(`${fileCount} images: ${kb(sourceBytes)} -> ${kb(outputBytes)}${dryRun ? ' (dry run, nothing written)' : ` in ${outDir}`}`);

  if (fileCount && !dryRun) {
    console.log('\nUpload (run this yourself; this script never touches AWS):');
    console.log(`  aws s3 sync "${outDir}" ${BUCKET_PREFIX} --content-type image/webp --cache-control "public, max-age=31536000, immutable"`);
    console.log('Then: npx tsx scripts/build-golf-courses.ts, and deploy GolfBackend. Upload BEFORE deploying.');
  }

  if (notes.length) {
    console.log('\nNotes:');
    for (const n of notes) console.log(`  - ${n}`);
  }
  if (problems.length) {
    console.log('\nNeeds attention:');
    for (const p of problems) console.log(`  - ${p}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
