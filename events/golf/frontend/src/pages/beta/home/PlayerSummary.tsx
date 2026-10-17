import { Flag } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import ProfileAvatar from '@shared/components/ui/ProfileAvatar';
import { useAuth } from '@shared/contexts/AuthContext';
import ParDelta from '../../../components/ParDelta';
import { PLACEHOLDER_COURSES, type CourseSummary } from '../../../data/placeholderHome';
import { useCourseLeaderboard } from '../../../lib/useCourseLeaderboard';

// Typographic placeholders for "no figure", kept out of JSX text so the i18n lint doesn't read them as copy.
const NO_FIGURE = '\u2014';
const BLANK_LINE = '\u00a0';

// Newest course first, like the sections below it.
const COURSES = [...PLACEHOLDER_COURSES].sort((a, b) => b.order - a.order);

// One course on the scorecard: where the viewer stands on it, read from that course's leaderboard.
function ScorecardRow({ course, userId }: { course: CourseSummary; userId: string }) {
  const { formatNumber } = useIntl();
  const state = useCourseLeaderboard(course.slug);
  const entry = state.status === 'ready' ? state.board.rows.find((r) => r.userId === userId) : undefined;
  const board = state.status === 'ready' ? state.board : undefined;

  let detail: React.ReactNode;
  if (state.status === 'loading') {
    detail = <div className="skeleton h-6 w-28" />;
  } else if (state.status === 'error') {
    detail = <span className="text-sm text-base-content/60">{NO_FIGURE}</span>;
  } else if (!entry) {
    // Not on the first 100 of a large board looks the same as not having played; only claim "not started"
    // while the whole board is in hand.
    detail =
      board && board.totalPlayers <= board.rows.length ? (
        <span className="text-sm text-base-content/60">
          <FormattedMessage defaultMessage="Not started" id="XFgVEo" description="Player summary: the viewer has no scores on this course yet" />
        </span>
      ) : (
        <span className="text-sm text-base-content/60">{NO_FIGURE}</span>
      );
  } else if (entry.complete) {
    detail = <ParDelta totalStrokes={entry.totalStrokes} par={course.par} size="md" />;
  } else {
    detail = (
      <span className="font-display tabular-nums">{formatNumber(entry.totalStrokes / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    );
  }

  return (
    <li className="pop-tile flex items-center gap-3 p-3">
      <div className="flex-1 min-w-0">
        <div className="font-display font-semibold truncate">{course.name}</div>
        <div className="text-xs text-base-content/60">
          {board && entry ? (
            <FormattedMessage
              defaultMessage="thru {done}"
              id="bmlZ+F"
              description="Leaderboard row: golf's 'thru N' - how many holes of the course an unfinished round has played"
              values={{ done: entry.holesCompleted }}
            />
          ) : (
            BLANK_LINE
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {detail}
        {board && entry && (
          <span className="text-xs text-base-content/60">
            <FormattedMessage
              defaultMessage="#{rank} of {total}"
              id="XRndlT"
              description="Player summary: the viewer's rank on a course out of everyone who has played it"
              values={{ rank: entry.rank, total: board.totalPlayers }}
            />
          </span>
        )}
      </div>
    </li>
  );
}

// The logged-in player's scorecard: who they are, and a line per course with their standing.
export default function PlayerSummary() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <section className="card pop-card p-5 flex flex-col gap-4 w-full">
      <div className="flex items-center gap-3">
        <ProfileAvatar profileImageUrl={user.profileImageUrl} alias={user.alias} size="md" />
        <div className="min-w-0">
          <div className="eyebrow">
            <FormattedMessage defaultMessage="Your scorecard" id="K6byEA" description="Player summary: heading above the viewer's name" />
          </div>
          <h2 className="text-2xl font-bold truncate">{user.alias}</h2>
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {COURSES.map((course) => (
          <ScorecardRow key={course.slug} course={course} userId={user.id} />
        ))}
      </ul>
      <p className="mt-auto flex items-center gap-2 text-sm text-base-content/60">
        <Flag className="w-4 h-4 shrink-0 text-accent" aria-hidden />
        <FormattedMessage
          defaultMessage="Finish a hole in game and it lands here."
          id="nH10uT"
          description="Player summary: footer line explaining that the scorecard fills in as the player finishes holes"
        />
      </p>
    </section>
  );
}
