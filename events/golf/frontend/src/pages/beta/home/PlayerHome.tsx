import { useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { useAuth } from '@shared/contexts/AuthContext';
import { PLACEHOLDER_COURSES } from '../../../data/placeholderHome';
import CourseSection from './CourseSection';
import CurrentlyOnCourse from './CurrentlyOnCourse';
import PlayerSummary from './PlayerSummary';

// Newest course first; more are added as the event goes on.
const COURSES = [...PLACEHOLDER_COURSES].sort((a, b) => b.order - a.order);

// Logged-in home: the player's own dashboard for the event. The scorecard, feeds and leaderboards are live;
// only the course list and descriptions are still placeholder data.
const PlayerHome = () => {
  const { user } = useAuth();
  const [rivalsOnly, setRivalsOnly] = useState(false);
  // The signed-in user object carries the ids of their rivals (see the profile page's RivalsSection).
  const rivalIds = ((user as { rivalUserIds?: string[] } | null)?.rivalUserIds ?? []) as string[];

  return (
    <div className="flex flex-col items-center gap-8 pt-28 pb-16 px-4">
      {/* --- Personal summary + latest activity --- */}
      <div className="grid gap-6 md:grid-cols-2 w-full max-w-5xl">
        <PlayerSummary />
        <CurrentlyOnCourse
          userIds={rivalsOnly ? rivalIds : undefined}
          title={<FormattedMessage defaultMessage="Latest Activity" id="8rRIy1" description="Beta home player view: heading of the latest plays feed" />}
          headerAction={
            <label className="label cursor-pointer text-sm gap-2 text-base-content/80">
              <input type="checkbox" className="toggle toggle-sm toggle-accent" checked={rivalsOnly} onChange={(e) => setRivalsOnly(e.target.checked)} />
              <FormattedMessage defaultMessage="Rivals only" id="nO9DER" description="Beta home player view: toggle to only show rivals' plays in the feed" />
            </label>
          }
        />
      </div>

      {/* --- One section per course --- */}
      <div className="flex flex-col gap-8 w-full max-w-5xl">
        {COURSES.map((course) => (
          <CourseSection key={course.slug} course={course} />
        ))}
      </div>
    </div>
  );
};

export default PlayerHome;
