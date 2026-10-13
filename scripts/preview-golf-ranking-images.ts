#!/usr/bin/env tsx
/**
 * Render the golf hole and course ranking pages to PNG. Every player name in every image is made up.
 *
 *   npx tsx scripts/preview-golf-ranking-images.ts             # REAL board data, fake names (the default)
 *   npx tsx scripts/preview-golf-ranking-images.ts --sample    # invented boards, offline, with edge cases
 *   options: --out <dir>   --api <readApiUrl>   (--api is for the default mode only)
 *
 * The default mode is meant for marketing and screenshots: real strokes, ranks, player counts and
 * holes-completed from the live boards, with the names swapped out so no one's handle appears. Output goes
 * to scripts/output/golf-ranking-previews/ (gitignored).
 *
 * --sample mode is for layout work. It needs no network and renders the states real data rarely produces:
 * a long alias, a "previous best" row, a chart with no par, a finished round beside unfinished ones. Output
 * goes to scripts/output/golf-ranking-previews-sample/. Its names are made up too.
 *
 * What is real in the default mode: the strokes, ranks, player counts, holes-completed, songs, artists, pars
 * and course names. What is not:
 *
 * - **Names.** Each distinct player (by user id) gets one fake name, stable across the images in a run. The
 *   real handles are never printed, never passed to a renderer, and the run aborts if a fake name happens to
 *   equal a real handle that appeared.
 * - **The viewer's row.** /rankings returns a window of rows around whoever is asking, so there has to be a
 *   viewer. On the hole pages it is a brand-new player whose score is searched for so they land mid-board:
 *   that one row's strokes are hypothetical. The "experienced" course page instead uses a real leading player
 *   as the viewer, on a hole they haven't played, so their standing is real bests plus that one hypothetical
 *   hole.
 * - **Rivals.** Two displayed rows per page are flagged as rivals, to show the icon. Nobody is anyone's rival.
 *
 * The default mode only reads, over the public read API: about 120 small GETs, nothing written anywhere.
 * Each run first deletes the images this script made last time (files named hole-*, course-* or sample-*) in
 * the output directory, so an older render can't end up mixed in with the new set.
 *
 * Both modes render the production modules (api/src/utils/golf-*-image.ts), not a copy. Those resolve their
 * fonts and logos relative to the webpack bundle, so GOLF_RESULT_IMAGE_ASSETS_DIR points them at api/assets
 * instead. That override exists for this script only.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const SAMPLE = args.includes('--sample');
const OUT_DIR = path.resolve(flag('--out') ?? (SAMPLE ? 'scripts/output/golf-ranking-previews-sample' : 'scripts/output/golf-ranking-previews'));

// --- Fake names ---

/**
 * Made-up handles in the mixed styles real ones come in - lowercase names, run-together phrases, digits, dots and
 * underscores, the odd all-caps - because a pool of "AdjectiveNoun" pairs reads as machine-made on sight. They are
 * hand-written rather than generated for the same reason: variety here is a matter of taste, not arithmetic.
 *
 * Plain ASCII only (the fonts are subset), 3 to 16 characters so none needs truncating. None is meant to be a
 * real person's handle; the run checks each name it uses against the real handles it actually saw and aborts on
 * a match, but that only covers the players on the boards it read, so give the images a glance before
 * publishing. Add to the end of the list rather than reordering - the seeded shuffle below depends on its length.
 */
const HANDLES = [
  // short names and words, lowercase
  'orrin',
  'tamsin',
  'bracken',
  'vesna',
  'ludo',
  'fenn',
  'kippa',
  'marlo',
  'odile',
  'pim',
  'raff',
  'tove',
  'wick',
  'yara',
  'nilo',
  'sable',
  'cobb',
  'edda',
  'lark',
  'juno_',
  'hollis',
  'brisk_',
  'tansy',
  'quill',
  'moss',
  'ferris',
  'dov',
  'inka',
  'wren',
  // with digits, dots and underscores
  'kell.204',
  'moth_88',
  'pax2k',
  'rue.14',
  'ivo1999',
  'dune_7',
  'tess.m',
  'cal_0412',
  'nox91',
  'fig_12',
  'hale4',
  'lux.77',
  'ezra_k',
  'bo.peep',
  'mara.3',
  'tobe_',
  'sy_441',
  'jin.07',
  'oz_oz',
  'lena2003',
  'dax.9',
  'rhys_14',
  'pia.k',
  'otto6',
  // run-together phrases
  'softlanding',
  'crumbsonly',
  'tinyorchestra',
  'lateforsupper',
  'paperplanes_',
  'slowburnjen',
  'somebodyelse',
  'lostmysocks',
  'pocketfulofrye',
  'noodlehands',
  'cheapthrills',
  'wetpavement',
  'afterhoursjay',
  'borrowedtime',
  'hotsoup',
  'stairwell',
  'laundryday',
  'sundaydrive',
  'thirdfloorwalkup',
  'morningpages',
  'smallhours',
  'quietfeet',
  'oatmilkandrye',
  'justpassing',
  'lunchbreak',
  'rainydayclub',
  'tapewormjoe',
  'halfpastnine',
  'yesterdayish',
  'creakyfloor',
  'loosethread',
  // stylised, all-caps, abbreviations
  'KIRA',
  'DJ_ROMY',
  'TORU',
  'xX_V0ID_Xx',
  'MAX_P',
  'ZOE',
  'NIKO',
  'LEX',
  'SAMI_B',
  'RIA',
  'PJ_92',
  'TASH',
  'LOU_',
  'KEIKO',
  // mixed case and odd punctuation
  'aLiCe',
  'jOnAh',
  'Pogo',
  'tuuli!',
  'sol?',
  'eli!!',
  'Bexley',
  'MoonPie_',
  'dEv',
  'stomp.fm',
  'lolo!!',
  'Haru',
  'kat_kat',
] as const;

// Fail loudly at load time if the pool is ever edited into something unusable, rather than mid-run.
(() => {
  const lower = HANDLES.map((h) => h.toLowerCase());
  if (new Set(lower).size !== lower.length) throw new Error('HANDLES has duplicates (compared case-insensitively)');
  const bad = HANDLES.filter((h) => !/^[\x20-\x7e]+$/.test(h) || h.length < 3 || h.length > 16);
  if (bad.length) throw new Error(`HANDLES entries must be 3-16 plain ASCII characters: ${bad.join(', ')}`);
})();

/** The handles in a fixed pseudo-random order, so the same data renders with the same names on every run. */
function shuffledNamePool(): string[] {
  let state = 0x9e3779b9;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const pool = [...HANDLES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}
const NAME_POOL = shuffledNamePool();

const realAliases = new Set<string>(); // lower-cased; only ever used to check for collisions, never printed
const fakeByKey = new Map<string, string>();

/** One fake name per key (a user id in live mode, a role in sample mode), the same every time it is asked for. */
function fakeNameFor(key: string): string {
  const existing = fakeByKey.get(key);
  if (existing) return existing;
  const name = NAME_POOL[fakeByKey.size];
  if (!name) throw new Error('ran out of fake names');
  fakeByKey.set(key, name);
  return name;
}

// --- Output ---

const OWN_FILE = /^(hole|course|sample)-.*\.png$/;
const written: string[] = [];

function prepareOutput() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const file of readdirSync(OUT_DIR)) if (OWN_FILE.test(file)) rmSync(path.join(OUT_DIR, file));
}

function write(name: string, png: Buffer) {
  writeFileSync(path.join(OUT_DIR, name), png);
  written.push(name);
  console.log(`  ${path.relative(process.cwd(), path.join(OUT_DIR, name))}`);
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28);

// courses.json carries titles and artists as written in the simfile, escapes and all ("En\-vy", "GET \#HYPER").
// The game client sends them already unescaped, and that is what the real hole page shows, so strip the escapes
// here too or the images would show a defect the product doesn't have.
const unescapeSimfile = (text: string) => text.replace(/\\(.)/g, '$1');

type Renderers = {
  renderGolfHolePage: typeof import('../api/src/utils/golf-ranking-image').renderGolfHolePage;
  renderGolfCoursePage: typeof import('../api/src/utils/golf-ranking-image').renderGolfCoursePage;
};

// --- Default mode: real boards, fake names ---

interface CourseConfig {
  slug: string;
  name: string;
  hidden: boolean;
  holes: { holeNumber: number; chartHash: string; songName: string; artist: string; par: number | null }[];
}

interface Row {
  rank: number;
  userId: string;
  alias: string;
  totalStrokes: number;
  isSelf: boolean;
  isRival: boolean;
  isPreviousBest: boolean;
}
/** A course-board row always says how many holes the round covers; a hole-board row has no such field. */
interface CourseRow extends Row {
  holesCompleted: number;
}
interface Rankings {
  previousBestStrokes: number | null;
  hole: { courseName: string; holeNumber: number; totalPlayers: number; selfRank: number; rows: Row[] } | null;
  course: { name: string; holesTotal: number; totalPlayers: number; selfRank: number; rows: CourseRow[] } | null;
}

// A viewer nobody has ever been: a fixed id with no stored bests, so their standing is only what we give them.
const NEWCOMER = '00000000-0000-4000-8000-000000000001';
const FAR_WORSE = 9_999_999;

async function renderLive(r: Renderers) {
  const base = (flag('--api') ?? JSON.parse(readFileSync('events/golf/backend/config.json', 'utf-8')).readApiUrl).replace(/\/+$/, '');
  const courses = (JSON.parse(readFileSync('events/golf/config/courses.json', 'utf-8')) as { courses: CourseConfig[] }).courses.filter((c) => !c.hidden);

  async function rankings(viewer: string, chartHash: string, strokes: number, rivalIds: string[] = []): Promise<Rankings> {
    const query = new URLSearchParams({
      userId: viewer,
      alias: 'viewer',
      chartHash,
      playId: '1',
      strokes: String(strokes),
      playedAt: new Date().toISOString(),
    });
    if (rivalIds.length) query.set('rivalIds', rivalIds.join(','));
    const res = await fetch(`${base}/rankings?${query}`);
    if (!res.ok) throw new Error(`GET /rankings -> ${res.status}`);
    const body = (await res.json()) as Rankings;
    for (const row of [...(body.hole?.rows ?? []), ...(body.course?.rows ?? [])]) realAliases.add(row.alias.toLowerCase());
    return body;
  }

  /** Find a stroke total that lands the viewer at `targetRank` on this hole. Rank only gets worse as strokes
   * rise, so this is a plain bisection. Returns the closest it found if no exact total lands there. */
  async function strokesForRank(viewer: string, chartHash: string, targetRank: number): Promise<number> {
    let lo = 0;
    let hi = 3_000_000;
    let best = Math.floor((lo + hi) / 2);
    for (let i = 0; i < 26 && lo <= hi; i++) {
      const mid = Math.floor((lo + hi) / 2);
      const board = (await rankings(viewer, chartHash, mid)).hole;
      if (!board) break;
      best = mid;
      if (board.selfRank === targetRank) return mid;
      if (board.selfRank > targetRank) hi = mid - 1;
      else lo = mid + 1;
    }
    return best;
  }

  /** The best-ranked displayed row and the one nearest the viewer, to flag as rivals by re-asking with their ids. */
  function pickRivals(rows: Row[]): string[] {
    const others = rows.filter((row) => !row.isSelf);
    const self = rows.find((row) => row.isSelf);
    if (others.length < 2 || !self) return others.map((row) => row.userId).slice(0, 1);
    const nearest = [...others].sort((a, b) => Math.abs(a.rank - self.rank) - Math.abs(b.rank - self.rank))[0];
    return [...new Set([others[0].userId, nearest.userId])];
  }

  const anonymise = <T extends Row>(rows: T[]): T[] => {
    const named = rows.map((row) => ({ ...row, alias: fakeNameFor(row.userId) }));
    // The one invariant that matters here: nothing handed to a renderer may carry a real handle.
    if (named.some((row) => realAliases.has(row.alias.toLowerCase()))) throw new Error('a real alias reached the render input');
    return named;
  };

  console.log('Reading real boards from the read API...');
  for (const course of courses) {
    // The busiest holes make the fullest boards, so those are the ones worth showing.
    const sized = await Promise.all(
      course.holes.map(async (hole) => ({ hole, players: (await rankings(NEWCOMER, hole.chartHash, FAR_WORSE)).hole?.totalPlayers ?? 0 })),
    );
    const busiest = [...sized].sort((a, b) => b.players - a.players).slice(0, 2);
    console.log(`${course.name}: busiest holes have ${busiest.map((b) => b.players - 1).join(' and ')} real players`);

    // Hole pages: a newcomer scoring mid-board.
    for (const { hole, players } of busiest) {
      const strokes = await strokesForRank(NEWCOMER, hole.chartHash, Math.ceil(players / 2));
      const first = (await rankings(NEWCOMER, hole.chartHash, strokes)).hole!;
      const final = (await rankings(NEWCOMER, hole.chartHash, strokes, pickRivals(first.rows))).hole!;
      write(
        `hole-${course.slug}-${hole.holeNumber}-${slug(unescapeSimfile(hole.songName))}.png`,
        await r.renderGolfHolePage({
          courseName: course.name,
          holeNumber: hole.holeNumber,
          songTitle: unescapeSimfile(hole.songName),
          songArtist: unescapeSimfile(hole.artist),
          par: hole.par,
          totalPlayers: final.totalPlayers,
          rows: anonymise(final.rows),
        }),
      );
    }

    // Course page, newcomer: a one-hole round among the field.
    const probe = busiest[0];
    const probeStrokes = await strokesForRank(NEWCOMER, probe.hole.chartHash, Math.ceil(probe.players / 2));
    const newcomerFirst = (await rankings(NEWCOMER, probe.hole.chartHash, probeStrokes)).course!;
    const newcomer = (await rankings(NEWCOMER, probe.hole.chartHash, probeStrokes, pickRivals(newcomerFirst.rows))).course!;
    write(
      `course-${course.slug}-newcomer.png`,
      await r.renderGolfCoursePage({
        courseName: course.name,
        holesTotal: newcomer.holesTotal,
        totalPlayers: newcomer.totalPlayers,
        rows: anonymise(newcomer.rows),
      }),
    );

    // Course page, experienced: a real leading player, on a hole they haven't played.
    const leader = newcomerFirst.rows.find((row) => !row.isSelf && row.holesCompleted > 0);
    if (!leader) continue;
    let unplayed: (typeof course.holes)[number] | undefined;
    for (const hole of course.holes) {
      if ((await rankings(leader.userId, hole.chartHash, FAR_WORSE)).previousBestStrokes === null) {
        unplayed = hole;
        break;
      }
    }
    if (!unplayed) {
      console.log(`  (the leading ${course.name} player has played every hole, so no experienced page for it)`);
      continue;
    }
    const sizeHere = sized.find((s) => s.hole.chartHash === unplayed!.chartHash)!.players;
    const strokes = await strokesForRank(leader.userId, unplayed.chartHash, Math.max(1, Math.ceil(sizeHere / 2)));
    const expFirst = (await rankings(leader.userId, unplayed.chartHash, strokes)).course!;
    const exp = (await rankings(leader.userId, unplayed.chartHash, strokes, pickRivals(expFirst.rows))).course!;
    write(
      `course-${course.slug}-experienced.png`,
      await r.renderGolfCoursePage({ courseName: course.name, holesTotal: exp.holesTotal, totalPlayers: exp.totalPlayers, rows: anonymise(exp.rows) }),
    );
  }

  // Final guard over everything that was named: no fake name may equal a real handle that appeared.
  const clash = [...fakeByKey.values()].filter((n) => realAliases.has(n.toLowerCase()));
  if (clash.length) throw new Error(`fake name(s) collide with real handles: ${clash.join(', ')}`);
  console.log(`\n${written.length} images, ${fakeByKey.size} distinct players renamed, 0 fake names equal a real handle.`);
}

// --- --sample mode: invented boards ---

// Deterministic, so a re-render of unchanged code produces an identical image to diff against.
function sampleNoteStrokes(count: number, seed: number): number[] {
  let state = seed;
  const next = () => (state = (state * 1664525 + 1013904223) >>> 0) / 0xffffffff;
  return Array.from({ length: count }, () => {
    const roll = next();
    if (roll < 0.35) return 0;
    if (roll > 0.985) return 200;
    return Math.round(next() * next() * 40);
  });
}

async function renderSample(r: Renderers) {
  const { renderGolfResultImage } = await import('../api/src/utils/golf-result-image');
  const who = (role: string) => fakeNameFor(`sample:${role}`);
  // Generic over `extra` so a course row keeps its typed `holesCompleted` instead of widening to `object`.
  const row = <E extends object = object>(rank: number, role: string, totalStrokes: number, extra: E = {} as E) => ({
    rank,
    alias: who(role),
    totalStrokes,
    isSelf: false,
    isRival: false,
    isPreviousBest: false,
    ...extra,
  });

  console.log('Rendering invented sample boards...');

  // Image 1: the existing result card, for context. It shows no names.
  const notes = sampleNoteStrokes(367, 7);
  write(
    'sample-1-card.png',
    await renderGolfResultImage({
      chartTitle: 'GIMME LOVE',
      chartArtist: 'Łaszewo',
      chartHash: '9a5e366400f59236',
      courseName: 'Beta Pines',
      totalStrokes: 3818,
      noteCount: notes.length,
      previousBestStrokes: 4210,
      par: 3,
      aceCount: notes.filter((n) => n === 0).length,
      obCount: notes.filter((n) => n === 200).length,
      noteStrokes: notes,
    }),
  );

  // Image 2: hole page - viewer mid-board, rivals, and an alias too long to fit.
  write(
    'sample-2-hole-midboard.png',
    await r.renderGolfHolePage({
      courseName: 'Beta Pines',
      holeNumber: 8,
      songTitle: 'GIMME LOVE',
      songArtist: 'Łaszewo',
      par: 3,
      totalPlayers: 41,
      rows: [
        row(1, 'leader', 1420),
        row(2, 'second', 1688),
        row(17, 'p17', 3105),
        row(18, 'rival-a', 3377, { isRival: true }),
        row(19, 'me', 3818, { isSelf: true }),
        { ...row(20, 'rival-long', 3902, { isRival: true }), alias: 'oldschool_dancer_since_2004_xo' },
        row(21, 'p21', 4210),
      ],
    }),
  );
  write(
    'sample-2-hole-previous-best.png',
    await r.renderGolfHolePage({
      courseName: 'Beta Hills',
      holeNumber: 14,
      songTitle: 'Not Alone',
      songArtist: 'Yue',
      par: 8,
      totalPlayers: 12,
      rows: [
        row(1, 'leader', 2100),
        row(2, 'second', 2480),
        row(3, 'rival-a', 2630, { isRival: true }),
        row(4, 'me', 2750, { isSelf: true, isPreviousBest: true }),
        row(5, 'p5', 3300),
      ],
    }),
  );
  write(
    'sample-2-hole-tiny-no-par.png',
    await r.renderGolfHolePage({
      courseName: 'Alpha Testing',
      holeNumber: 1,
      songTitle: 'Unknown',
      songArtist: 'Unknown',
      par: null,
      totalPlayers: 2,
      rows: [row(1, 'me', 3818, { isSelf: true }), row(2, 'other', 4100)],
    }),
  );

  // Image 3: course page - finished rounds above unfinished ones, and the viewer partway through.
  write(
    'sample-3-course-mixed.png',
    await r.renderGolfCoursePage({
      courseName: 'Beta Hills',
      holesTotal: 18,
      totalPlayers: 33,
      rows: [
        row(1, 'leader', 90200, { holesCompleted: 18 }),
        row(2, 'second', 102800, { holesCompleted: 18 }),
        row(9, 'rival-a', 65300, { holesCompleted: 16, isRival: true }),
        row(10, 'p10', 91200, { holesCompleted: 16 }),
        row(11, 'me', 70100, { holesCompleted: 15, isSelf: true }),
        row(12, 'p12', 75400, { holesCompleted: 15 }),
        row(13, 'p13', 40200, { holesCompleted: 11 }),
      ],
    }),
  );
  write(
    'sample-3-course-finished-previous-best.png',
    await r.renderGolfCoursePage({
      courseName: 'Beta Pines',
      holesTotal: 18,
      totalPlayers: 5,
      rows: [
        row(1, 'leader', 61200, { holesCompleted: 18 }),
        row(2, 'me', 64800, { holesCompleted: 18, isSelf: true, isPreviousBest: true }),
        row(3, 'p3', 70300, { holesCompleted: 18 }),
        row(4, 'p4', 30100, { holesCompleted: 9 }),
      ],
    }),
  );
  console.log(`\n${written.length} images, ${fakeByKey.size} invented names.`);
}

async function main() {
  // Must be set before the renderers load: they read it at module scope.
  process.env.GOLF_RESULT_IMAGE_ASSETS_DIR = path.resolve('api/assets');
  const { renderGolfHolePage, renderGolfCoursePage } = await import('../api/src/utils/golf-ranking-image');
  prepareOutput();
  console.log(`Output: ${path.relative(process.cwd(), OUT_DIR)}/`);
  const renderers = { renderGolfHolePage, renderGolfCoursePage };
  if (SAMPLE) await renderSample(renderers);
  else await renderLive(renderers);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
