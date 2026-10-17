import { useEffect, useState } from 'react';
import { PLACEHOLDER_COURSES, placeholderCourseLeaderboard } from '../data/placeholderHome';
import { fetchCourseLeaderboard, showDevPlaceholders, type CourseLeaderboard } from './readApi';

export type CourseLeaderboardState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; board: CourseLeaderboard };

// One request per course per page load, shared by every component that asks - the course section and the
// player summary both read the same board. A failed request is dropped so the next mount retries.
const inflight = new Map<string, Promise<CourseLeaderboard>>();

function load(slug: string): Promise<CourseLeaderboard> {
  let request = inflight.get(slug);
  if (!request) {
    request = fetchCourseLeaderboard(slug);
    request.catch(() => inflight.delete(slug));
    inflight.set(slug, request);
  }
  return request;
}

export function useCourseLeaderboard(slug: string): CourseLeaderboardState {
  const [state, setState] = useState<CourseLeaderboardState>(() => {
    if (!showDevPlaceholders) return { status: 'loading' };
    const course = PLACEHOLDER_COURSES.find((c) => c.slug === slug) ?? PLACEHOLDER_COURSES[0];
    return { status: 'ready', board: placeholderCourseLeaderboard(course) };
  });

  useEffect(() => {
    if (showDevPlaceholders) return;
    let cancelled = false;
    load(slug)
      .then((board) => !cancelled && setState({ status: 'ready', board }))
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error(`Failed to load the ${slug} leaderboard`, err);
        setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state;
}
