import React from 'react';
import { Skeleton, LoadingLabel } from '../ui/skeleton';

interface SessionCardSkeletonProps {
  /** Show the player avatar and name (lists of many players' sessions). */
  withUser?: boolean;
}

/** Placeholder for a session summary card. Matches the `p-4 rounded-lg border` session links. */
export const SessionCardSkeleton: React.FC<SessionCardSkeletonProps> = ({ withUser = false }) => (
  <div aria-hidden="true" className="block p-4 bg-base-200/30 rounded-lg border border-base-content/10">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        {withUser && <Skeleton className="w-8 h-8 rounded-full shrink-0" />}
        {withUser && <Skeleton className="h-4 w-24" />}
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-3 w-16" />
    </div>
    <div className="flex items-center gap-4">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 w-20" />
    </div>
  </div>
);

interface SessionListSkeletonProps extends SessionCardSkeletonProps {
  /** Number of cards. Use the area's page size. */
  rows: number;
  className?: string;
}

export const SessionListSkeleton: React.FC<SessionListSkeletonProps> = ({ rows, withUser, className = 'space-y-3' }) => (
  <div className={className}>
    <LoadingLabel />
    {Array.from({ length: rows }, (_, i) => (
      <SessionCardSkeleton key={i} withUser={withUser} />
    ))}
  </div>
);
