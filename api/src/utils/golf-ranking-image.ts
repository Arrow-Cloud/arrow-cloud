/**
 * Renders the golf event's two ranking pages: the hole page (everyone's best on the hole just
 * played) and the course page (everyone's standing across the whole course). They follow the result
 * card (golf-result-image.ts) in the in-game results pager, and share its size, palette, fonts and
 * header so the three read as a set.
 *
 * Like pack-result-image.ts's leaderboard pages, this module only renders. Which rows to show, and
 * every ranking decision - the order, ties, what counts as complete - was made by the golf backend's
 * /rankings route using events/golf/backend/src/rankings.ts. Nothing here ranks or sorts.
 *
 * Strokes are stored and passed as raw integers; they are divided by 1000 to two decimals only here,
 * at render time, to match the in-game HUD (GolfScoring.lua).
 */

import {
  AC_MARK_SIZE,
  CARD_HEIGHT,
  CARD_WIDTH,
  HEADER_LOGO_HEIGHT,
  HEADER_LOGO_WIDTH,
  STROKE_BAD,
  STROKE_GOOD,
  fmtStrokes,
  h,
  loadImageDataUris,
  renderCardToPng,
  s,
  truncatedLine,
  type Node,
} from './golf-result-image';

// Rivals are red with a crossed-swords icon, as on the site (frontend/src/utils/rivalHighlight.tsx shows
// lucide's Swords, and the pack leaderboard widget colours it text-error) and on the pack result pages.
const RIVAL_COLOR = STROKE_BAD;
const DIM = 'rgba(255,255,255,0.5)';

/**
 * lucide's "swords" icon (ISC licence) - the same one the site puts beside a rival. The geometry is
 * copied from lucide-react's icon definition rather than redrawn, so the images match the site. Embedded
 * as a data URI image because that is how the dispersion chart already gets vector shapes through
 * satori, so it is a known-good path here.
 */
const SWORDS_ICON = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${RIVAL_COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/>` +
    `<line x1="13" x2="19" y1="19" y2="13"/>` +
    `<line x1="16" x2="20" y1="16" y2="20"/>` +
    `<line x1="19" x2="21" y1="21" y2="19"/>` +
    `<polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/>` +
    `<line x1="5" x2="9" y1="14" y2="18"/>` +
    `<line x1="7" x2="4" y1="17" y2="20"/>` +
    `<line x1="3" x2="5" y1="19" y2="21"/>` +
    `</svg>`,
).toString('base64')}`;
const RIVAL_ICON_SIZE = s(16);

export interface GolfHolePageRow {
  rank: number;
  alias: string;
  /** Raw integer strokes - this player's best on the hole. */
  totalStrokes: number;
  isSelf: boolean;
  isRival: boolean;
  /** Viewer's own row only: this play did not beat their best, so the row shows an older score. */
  isPreviousBest: boolean;
}

export interface GolfHolePageData {
  courseName: string;
  holeNumber: number;
  songTitle: string;
  songArtist: string;
  /** null for charts with no assigned par - the heading then omits it. */
  par: number | null;
  totalPlayers: number;
  rows: GolfHolePageRow[];
}

export interface GolfCoursePageRow {
  rank: number;
  alias: string;
  /** Raw integer strokes across the holes this player has completed. */
  totalStrokes: number;
  holesCompleted: number;
  isSelf: boolean;
  isRival: boolean;
  isPreviousBest: boolean;
}

export interface GolfCoursePageData {
  courseName: string;
  holesTotal: number;
  totalPlayers: number;
  rows: GolfCoursePageRow[];
}

interface PageRow {
  rank: number;
  alias: string;
  strokes: string;
  /** Holes played, for a round that isn't finished; undefined for a finished one. */
  thru?: number;
  isSelf: boolean;
  isRival: boolean;
  isPreviousBest: boolean;
}

const RANK_COL = s(54); // wide enough that the "RANK" header clears "PLAYER"
const STROKES_COL = s(92);
const THRU_COL = s(70);

function columnHeader(label: string, width: number, align: 'flex-start' | 'flex-end' = 'flex-end') {
  return h(
    'div',
    { style: { display: 'flex', width, justifyContent: align, fontSize: s(11), fontWeight: 700, letterSpacing: s(1), color: 'rgba(255,255,255,0.4)' } },
    label,
  );
}

function buildRow(row: PageRow, index: number, count: number, showThru: boolean) {
  const nameColor = row.isSelf ? STROKE_GOOD : row.isRival ? RIVAL_COLOR : '#ffffff';
  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        padding: `${s(9)}px ${s(8)}px`,
        backgroundColor: row.isSelf ? 'rgba(54,211,153,0.12)' : 'transparent',
        borderBottom: index < count - 1 ? `${s(1)}px solid rgba(255,255,255,0.06)` : 'none',
      },
    },
    h('div', { style: { display: 'flex', width: RANK_COL, fontSize: s(18), fontWeight: 700, color: row.isSelf ? STROKE_GOOD : DIM } }, `${row.rank}`),
    // The name and, for a rival, the icon beside it. The wrapper is what takes the free width and may
    // shrink; the name inside it is allowed to shrink too (minWidth 0), so on a long alias it is the name
    // that truncates with an ellipsis and the icon, which never shrinks, stays visible.
    h(
      'div',
      { style: { display: 'flex', flex: 1, minWidth: 0, alignItems: 'center' } },
      h(
        'div',
        {
          style: {
            display: 'flex',
            // Without minWidth 0 a flex item won't shrink below its content's intrinsic width, and the
            // ellipsis below would never trigger on a long alias.
            minWidth: 0,
            fontSize: s(18),
            fontWeight: row.isSelf || row.isRival ? 700 : 400,
            color: nameColor,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        },
        row.alias,
      ),
      row.isRival &&
        h('img', { src: SWORDS_ICON, width: RIVAL_ICON_SIZE, height: RIVAL_ICON_SIZE, style: { display: 'flex', flexShrink: 0, marginLeft: s(6) } }),
    ),
    // Only ever on the viewer's own row. A board shows each player's best, so when this play missed
    // it the row holds an older, worse score - without this the page looks wrong beside the result
    // card, which reports the play itself.
    row.isPreviousBest &&
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexShrink: 0,
            marginLeft: s(8),
            padding: `${s(2)}px ${s(6)}px`,
            backgroundColor: 'rgba(255,255,255,0.08)',
            fontSize: s(11),
            fontWeight: 700,
            letterSpacing: s(1),
            color: 'rgba(255,255,255,0.55)',
          },
        },
        'PREV BEST',
      ),
    showThru &&
      h(
        'div',
        { style: { display: 'flex', width: THRU_COL, justifyContent: 'flex-end', fontSize: s(13), color: DIM } },
        row.thru !== undefined ? `thru ${row.thru}` : '',
      ),
    h(
      'div',
      {
        style: {
          display: 'flex',
          width: STROKES_COL,
          justifyContent: 'flex-end',
          fontSize: s(18),
          fontWeight: 700,
          color: row.isSelf ? STROKE_GOOD : '#ffffff',
        },
      },
      row.strokes,
    ),
  );
}

function buildPage(args: { courseName: string; heading: Node[]; rows: PageRow[]; footer: string }, images: ReturnType<typeof loadImageDataUris>): Node {
  const showThru = args.rows.some((r) => r.thru !== undefined);
  return h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: '#101410',
        fontFamily: 'Nunito',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
      },
    },
    h('img', {
      src: images.patternDataUri,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      style: { position: 'absolute', top: 0, left: 0, opacity: 0.1, objectFit: 'cover' },
    }),
    h('img', { src: images.acLogoDataUri, width: AC_MARK_SIZE, height: AC_MARK_SIZE, style: { position: 'absolute', top: s(16), right: s(16), opacity: 0.9 } }),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: s(20), paddingBottom: 0 } },
      h('img', { src: images.headerLogoDataUri, width: HEADER_LOGO_WIDTH, height: HEADER_LOGO_HEIGHT, style: { display: 'flex' } }),
      truncatedLine(args.courseName, CARD_WIDTH - s(40), { fontFamily: 'PermanentMarker', fontSize: s(20), color: STROKE_GOOD, marginTop: s(4) }),
      h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', marginTop: s(8) } }, ...args.heading),
    ),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', marginTop: s(14), paddingLeft: s(24), paddingRight: s(24) } },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', padding: `0 ${s(8)}px ${s(8)}px`, borderBottom: `${s(1)}px solid rgba(255,255,255,0.12)` } },
        h(
          'div',
          { style: { display: 'flex', width: RANK_COL, fontSize: s(11), fontWeight: 700, letterSpacing: s(1), color: 'rgba(255,255,255,0.4)' } },
          'RANK',
        ),
        h('div', { style: { display: 'flex', flex: 1, fontSize: s(11), fontWeight: 700, letterSpacing: s(1), color: 'rgba(255,255,255,0.4)' } }, 'PLAYER'),
        showThru && columnHeader('', THRU_COL),
        columnHeader('STROKES', STROKES_COL),
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column' } }, ...args.rows.map((row, i) => buildRow(row, i, args.rows.length, showThru))),
    ),
    h(
      'div',
      {
        style: {
          display: 'flex',
          flex: 1,
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: s(16),
          fontSize: s(13),
          color: 'rgba(255,255,255,0.4)',
        },
      },
      args.footer,
    ),
  );
}

function playersLabel(n: number): string {
  return `${n} ${n === 1 ? 'player' : 'players'}`;
}

export async function renderGolfHolePage(data: GolfHolePageData): Promise<Buffer> {
  const holeLine = data.par !== null ? `HOLE ${data.holeNumber}  ·  PAR ${data.par}` : `HOLE ${data.holeNumber}`;
  const tree = buildPage(
    {
      courseName: data.courseName,
      heading: [
        h('div', { style: { display: 'flex', fontSize: s(12), fontWeight: 700, letterSpacing: s(2), color: DIM } }, holeLine),
        truncatedLine(data.songTitle, CARD_WIDTH - s(40), { fontSize: s(18), fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginTop: s(4) }),
        truncatedLine(data.songArtist, CARD_WIDTH - s(40), { fontSize: s(15), fontWeight: 700, color: 'rgba(255,255,255,0.65)', marginTop: s(1) }),
      ],
      rows: data.rows.map((r) => ({
        rank: r.rank,
        alias: r.alias,
        strokes: fmtStrokes(r.totalStrokes),
        isSelf: r.isSelf,
        isRival: r.isRival,
        isPreviousBest: r.isPreviousBest,
      })),
      footer: playersLabel(data.totalPlayers),
    },
    loadImageDataUris(),
  );
  return renderCardToPng(tree);
}

export async function renderGolfCoursePage(data: GolfCoursePageData): Promise<Buffer> {
  const tree = buildPage(
    {
      courseName: data.courseName,
      heading: [
        h('div', { style: { display: 'flex', fontSize: s(12), fontWeight: 700, letterSpacing: s(2), color: DIM } }, 'COURSE STANDINGS'),
        truncatedLine(`${data.holesTotal} holes`, CARD_WIDTH - s(40), { fontSize: s(18), fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginTop: s(4) }),
      ],
      rows: data.rows.map((r) => ({
        rank: r.rank,
        alias: r.alias,
        strokes: fmtStrokes(r.totalStrokes),
        // Only an unfinished round gets "thru N". A finished one is left blank, as in the plan's example board.
        thru: r.holesCompleted < data.holesTotal ? r.holesCompleted : undefined,
        isSelf: r.isSelf,
        isRival: r.isRival,
        isPreviousBest: r.isPreviousBest,
      })),
      footer: playersLabel(data.totalPlayers),
    },
    loadImageDataUris(),
  );
  return renderCardToPng(tree);
}
