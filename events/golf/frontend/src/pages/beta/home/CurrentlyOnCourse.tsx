import { useEffect, useState, type ReactNode } from 'react';
import { FormattedMessage, FormattedRelativeTime, useIntl } from 'react-intl';
import DispersionChart from '../../../components/DispersionChart';
import ParDelta from '../../../components/ParDelta';
import PlayerName from '../../../components/PlayerName';
import ProfileAvatar from '@shared/components/ui/ProfileAvatar';
import { useRowHighlight } from '../../../lib/useRowHighlight';
import { placeholderActivity, type CourseSummary } from '../../../data/placeholderHome';
import { fetchActivity, showDevPlaceholders, type ActivityRow } from '../../../lib/readApi';

const FEED_LIMIT = 3;

// Only plays that have *finished* exist, so "currently" is just the latest few - there's no
// presence signal. Re-tick the relative times so a page left open doesn't freeze at "1 minute ago".
const CLOCK_TICK_MS = 30_000;

type FeedState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: ActivityRow[] };

type FeedCourse = Pick<CourseSummary, 'slug' | 'name'>;

// Dev only, when VITE_GOLF_READ_API_URL isn't set: placeholder rows so the layout can be worked on
// without the API. A production build always fetches.
function useActivityFeed(course: FeedCourse | undefined, userIds: string[] | undefined): FeedState {
  const slug = course?.slug;
  // The array's contents, not its identity, decide when to refetch - callers build it fresh each render.
  const userKey = userIds?.join(',');
  const [state, setState] = useState<FeedState>(() => (showDevPlaceholders ? { status: 'ready', rows: placeholderActivity(course) } : { status: 'loading' }));

  useEffect(() => {
    if (showDevPlaceholders) return;
    const controller = new AbortController();
    fetchActivity({ limit: FEED_LIMIT, course: slug, userIds: userKey === undefined ? undefined : userKey.split(',').filter(Boolean) }, controller.signal)
      .then((rows) => setState({ status: 'ready', rows }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Failed to load Currently On Course feed', err);
        setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [slug, userKey]);

  return state;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Largest whole unit that fits, as a negative (past) value for FormattedRelativeTime. Anything
// under a minute reads as "now" rather than counting seconds the clock only re-ticks every 30s.
function relativeTo(timestamp: string, now: number): { value: number; unit: 'second' | 'minute' | 'hour' | 'day' } {
  const seconds = Math.max(0, (now - Date.parse(timestamp)) / 1000);
  if (seconds < 60) return { value: 0, unit: 'second' };
  if (seconds < 3600) return { value: -Math.floor(seconds / 60), unit: 'minute' };
  if (seconds < 86400) return { value: -Math.floor(seconds / 3600), unit: 'hour' };
  return { value: -Math.floor(seconds / 86400), unit: 'day' };
}

// How much a card says about where the play happened. Each level drops what the feed's own scope
// already tells you: `all` (any course) shows course and song, `course` drops the course name,
// `song` drops the song line too.
export type ActivityDetail = 'all' | 'course' | 'song';

// @container: the name and strokes scale with the card's own width (a phone's course feed is far
// narrower than the home page's), not the viewport's.
// The li is the @container, so layout follows the card's own width (a phone's course feed is far
// narrower than the home page's), not the viewport's. Container queries can't style the container
// itself, hence the inner row div.
const CARD = '@container card pop-tile overflow-hidden';
// A fixed height per level rather than letting content decide: every text line truncates, so the
// content's height is known, and the plot needs a definite height to size itself from - otherwise
// the SVG's own 320px wins and squeezes the text out. Narrow cards stack the strokes under the
// text, so they're taller.
const ROW_HEIGHT: Record<ActivityDetail, string> = { all: 'h-40 @sm:h-32', course: 'h-32 @sm:h-28', song: 'h-28' };
// Square, flush to the card's right edge and as tall as the card.
const PLOT = 'h-full aspect-square shrink-0';

function ActivityItem({ activity, now, detail }: { activity: ActivityRow; now: number; detail: ActivityDetail }) {
  const { formatNumber } = useIntl();
  const when = relativeTo(activity.timestamp, now);
  const { rowGradientClass } = useRowHighlight(activity.userId);

  return (
    <li className={`${CARD} ${rowGradientClass}`}>
      <div className={`flex ${ROW_HEIGHT[detail]}`}>
        <div className="flex-1 min-w-0 p-3 flex flex-col justify-center gap-2 @sm:flex-row @sm:items-center @sm:justify-between @sm:gap-3">
          <div className="flex flex-col justify-center gap-2 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <ProfileAvatar profileImageUrl={activity.profileImageUrl} alias={activity.playerAlias} size="sm" />
              <div className="flex flex-col min-w-0">
                <PlayerName userId={activity.userId} alias={activity.playerAlias} className="font-display text-lg @sm:text-xl font-semibold" />
                <span className="text-xs text-base-content/60 truncate">
                  <FormattedRelativeTime value={when.value} unit={when.unit} numeric="auto" />
                </span>
              </div>
            </div>
            {detail !== 'song' && (
              <div className="flex flex-col min-w-0">
                {detail === 'all' && <span className="font-semibold truncate">{activity.courseName}</span>}
                <span className="text-xs text-base-content/70 truncate">{activity.songName}</span>
              </div>
            )}
          </div>

          {/* Under the text on narrow cards ("↓ -0.42  par 3"), beside it on wide ones. */}
          <div className="flex items-baseline gap-2 shrink-0 @sm:flex-col @sm:items-end @sm:gap-0.5">
            {activity.par === null ? (
              // No par to measure from (hidden test charts) - show the raw total instead.
              // totalStrokes is the raw integer; the HUD (GolfScoring.lua) shows it /1000 to 2dp.
              <span className="font-display text-lg @sm:text-xl font-semibold tabular-nums">
                {formatNumber(activity.totalStrokes / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            ) : (
              <>
                <ParDelta totalStrokes={activity.totalStrokes} par={activity.par} size="lg" />
                <span className="text-xs text-base-content/60 whitespace-nowrap">
                  <FormattedMessage
                    defaultMessage="par {par}"
                    id="H4BzKI"
                    description="Activity card: the hole's par, under the strokes-from-par figure"
                    values={{ par: activity.par }}
                  />
                </span>
              </>
            )}
          </div>
        </div>

        {activity.noteStrokes ? (
          // DispersionChart draws at a fixed pixel size; the viewBox lets it scale to the card's height.
          // Seeded from chartHash with no variant, so the green matches this hole's result image.
          <div className={`${PLOT} bg-neutral [&>svg]:w-full [&>svg]:h-full`}>
            <DispersionChart noteStrokes={activity.noteStrokes} greenSeed={activity.chartHash} size={320} />
          </div>
        ) : (
          // Same footprint without a plot, so cards line up either way.
          <div className={PLOT} />
        )}
      </div>
    </li>
  );
}

function SkeletonItem({ detail }: { detail: ActivityDetail }) {
  return (
    <li className={CARD}>
      <div className={`flex ${ROW_HEIGHT[detail]}`}>
        <div className="flex-1 p-3 flex flex-col justify-center gap-2">
          <div className="skeleton h-5 w-1/2" />
          <div className="skeleton h-3 w-1/4" />
          <div className="skeleton h-3 w-2/3" />
        </div>
        <div className={`${PLOT} skeleton rounded-none`} />
      </div>
    </li>
  );
}

const GLASS_SURFACE = 'card pop-card p-5';

interface CurrentlyOnCourseProps {
  /** Only plays on this course (`slug` filters the API; `name` labels dev placeholder rows). */
  course?: FeedCourse;
  /** Defaults to "Currently On Course". */
  title?: ReactNode;
  /** Rendered at the right of the heading (e.g. a filter toggle). */
  headerAction?: ReactNode;
  /** Rendered under the list (e.g. a "show more" control). */
  footer?: ReactNode;
  /** Only these players' plays. Omit for everyone; `[]` shows nothing (a rivals filter with no rivals). */
  userIds?: string[];
  /** What each card shows; defaults to `course` when `course` is set, otherwise `all`. */
  detail?: ActivityDetail;
  /** Card surface classes; defaults to the page's glass card. */
  surfaceClassName?: string;
}

// A feed of recent plays, one row each, from GET /activity - across all courses, or one course.
export default function CurrentlyOnCourse({ course, title, headerAction, footer, detail, userIds, surfaceClassName = GLASS_SURFACE }: CurrentlyOnCourseProps) {
  const feed = useActivityFeed(course, userIds);
  const cardDetail = detail ?? (course ? 'course' : 'all');
  const now = useNow(CLOCK_TICK_MS);

  return (
    <section className={`${surfaceClassName} flex flex-col gap-4 w-full`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          {title ?? (
            <FormattedMessage
              defaultMessage="Currently On Course"
              id="otNXHq"
              description="Heading of the live feed of recently played holes on the logged-out home page"
            />
          )}
        </h2>
        {headerAction}
      </div>
      {feed.status === 'loading' && (
        <ul className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: FEED_LIMIT }, (_, i) => (
            <SkeletonItem key={i} detail={cardDetail} />
          ))}
        </ul>
      )}
      {feed.status === 'error' && (
        <p className="text-sm text-base-content/60">
          <FormattedMessage
            defaultMessage="Couldn't load recent rounds right now."
            id="GYdx1h"
            description="Currently On Course: shown when the feed of recent plays fails to load"
          />
        </p>
      )}
      {feed.status === 'ready' && feed.rows.length === 0 && (
        <p className="text-sm text-base-content/60">
          <FormattedMessage
            defaultMessage="No rounds played yet. Be the first on the course!"
            id="Nq/ScJ"
            description="Currently On Course: shown when no one has played an eligible round yet"
          />
        </p>
      )}
      {feed.status === 'ready' && feed.rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {feed.rows.map((activity) => (
            <ActivityItem key={activity.playId} activity={activity} now={now} detail={cardDetail} />
          ))}
        </ul>
      )}
      {footer}
    </section>
  );
}
