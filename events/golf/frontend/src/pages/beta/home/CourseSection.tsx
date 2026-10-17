import { FormattedMessage, useIntl } from 'react-intl';
import Leaderboard from '../../../components/Leaderboard';
import { type CourseSummary } from '../../../data/placeholderHome';
import { useCourseLeaderboard } from '../../../lib/useCourseLeaderboard';
import CurrentlyOnCourse from './CurrentlyOnCourse';

// Blocks nested inside the course card sit directly on it - no second surface - so a course is one card
// with two columns, not cards inside cards.
const INNER_SURFACE = 'card';

// Course art is 1024x400; this box holds that ratio whether or not the image exists yet.
const BANNER = 'w-full aspect-[1024/400] rounded-box';

function CourseBanner({ course }: { course: CourseSummary }) {
  const { formatMessage } = useIntl();
  if (course.bannerUrl) {
    return (
      <img
        src={course.bannerUrl}
        alt={formatMessage({ defaultMessage: '{course} banner', id: 'rLXVi+', description: 'Alt text for a course banner image' }, { course: course.name })}
        className={`${BANNER} object-cover border-2 border-base-content/10`}
      />
    );
  }
  return (
    <div
      className={`${BANNER} border-[3px] border-dashed border-primary/25 bg-primary/5 flex items-center justify-center text-xl font-bold text-base-content/60`}
    >
      {course.name}
    </div>
  );
}

// One course on the logged-in home page: banner + blurb, its recent plays and its leaderboard.
// Recent activity and the leaderboard are both live.
function CourseLeaderboard({ course }: { course: CourseSummary }) {
  const state = useCourseLeaderboard(course.slug);
  const title = <FormattedMessage defaultMessage="Leaderboard" id="3UiB/1" description="Course section: heading of the course leaderboard" />;

  if (state.status === 'ready') {
    return <Leaderboard entries={state.board.rows} par={course.par} scope="course" surfaceClassName={INNER_SURFACE} />;
  }
  return (
    <section className={`${INNER_SURFACE} flex flex-col gap-4 w-full`}>
      <h2 className="text-lg font-bold">{title}</h2>
      {state.status === 'loading' ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton h-9 w-full" />
          ))}
        </div>
      ) : (
        <p className="text-sm text-base-content/60">
          <FormattedMessage
            defaultMessage="Couldn't load the leaderboard right now."
            id="tu/DPE"
            description="Course section: shown when the course leaderboard fails to load"
          />
        </p>
      )}
    </section>
  );
}

export default function CourseSection({ course }: { course: CourseSummary }) {
  return (
    <section className="card pop-card p-5 sm:p-6 flex flex-col gap-5 w-full">
      <div className="grid gap-4 md:grid-cols-2 md:items-center">
        <CourseBanner course={course} />
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-extrabold">{course.name}</h2>
          <p className="text-base-content/70">{course.description}</p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <CurrentlyOnCourse
          course={course}
          surfaceClassName={INNER_SURFACE}
          title={<FormattedMessage defaultMessage="Recent activity" id="1rDLQZ" description="Course section: heading of the course's recent plays feed" />}
        />
        <CourseLeaderboard course={course} />
      </div>
    </section>
  );
}
