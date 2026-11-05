import React from 'react';
import { Skeleton, LoadingLabel, SkeletonColumn } from '../ui/skeleton';

/**
 * Cell placeholders for the score tables used across the site
 * (recent plays, global activity, leaderboards, user scores). Each matches the real cell's layout.
 */
export const SCORE_SKELETON_CELLS = {
  /** Banner + title/artist + difficulty chip. */
  chart: {
    className: 'py-4',
    content: (
      <div className="flex items-center gap-3">
        <Skeleton className="w-32 aspect-[2.56] rounded-lg shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-3 w-28 max-w-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </div>
    ),
  },
  player: { className: 'py-4', content: <Skeleton className="h-4 w-28" /> },
  /** Player name with avatar. */
  playerWithAvatar: {
    className: 'py-4',
    content: (
      <div className="flex items-center gap-2">
        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
        <Skeleton className="h-4 w-24" />
      </div>
    ),
  },
  grade: { className: 'py-4 text-center', content: <Skeleton className="w-8 h-8 rounded mx-auto" /> },
  score: { className: 'py-4 text-center', content: <Skeleton className="h-6 w-20 mx-auto" /> },
  date: {
    className: 'py-4 text-center',
    content: (
      <div className="space-y-1 py-0.5">
        <Skeleton className="h-4 w-24 mx-auto" />
        <Skeleton className="h-3 w-14 mx-auto" />
      </div>
    ),
  },
  rank: { className: 'py-4 text-center', content: <Skeleton className="h-6 w-8 mx-auto" /> },
} satisfies Record<string, SkeletonColumn>;

interface ScoreCardSkeletonProps {
  /** Show the chart banner, title, and difficulty block (lists that span many charts). */
  withChart?: boolean;
  /** Show the player row (lists of many players' scores, like `ScoreCard` with `showPlayer`). */
  withPlayer?: boolean;
  /** Height of the difficulty row: `h-6` for `DifficultyBadge` (24px), `h-[21px]` for a small `DifficultyChip`. */
  badgeRowClassName?: string;
  className?: string;
}

/**
 * Mobile score card placeholder. Matches the `rounded-lg p-4 border` score cards.
 * Each line sits in a wrapper as tall as the real text line (text-sm 20px, text-xs 16px, text-lg 28px),
 * so the card is as tall as the real one.
 */
export const ScoreCardSkeleton: React.FC<ScoreCardSkeletonProps> = ({
  withChart = false,
  withPlayer = false,
  badgeRowClassName = 'h-6',
  className = 'bg-base-200/30',
}) => (
  <div aria-hidden="true" className={`rounded-lg p-4 border border-base-content/10 ${className}`}>
    {withChart && (
      <div className="mb-3">
        <Skeleton className="w-full aspect-[2.56] min-h-12 rounded-lg mb-2" />
        <div className="mb-2">
          <div className="h-5 flex items-center">
            <Skeleton className="h-3.5 w-2/3" />
          </div>
          <div className="h-4 flex items-center">
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <div className={`${badgeRowClassName} flex items-center`}>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
    )}
    {withPlayer && (
      <div className="flex items-center gap-2 mb-3 py-2 px-3 -mx-3 bg-base-300/30 rounded">
        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
        <Skeleton className="h-3.5 w-24" />
      </div>
    )}
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="w-8 h-8 rounded" />
          {!withPlayer && (
            <div className="h-5 flex items-center">
              <Skeleton className="h-3.5 w-24" />
            </div>
          )}
        </div>
        <div className="flex flex-col items-end">
          <div className="h-4 flex items-center">
            <Skeleton className="h-3 w-10" />
          </div>
          <div className="h-7 flex items-center">
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
      </div>
      <div className="h-4 flex items-center justify-between">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  </div>
);

/** First-load placeholder for a mobile score card list. */
export const ScoreCardListSkeleton: React.FC<{ rows: number } & Omit<ScoreCardSkeletonProps, 'className'>> = ({ rows, ...cardProps }) => (
  <>
    <LoadingLabel />
    {Array.from({ length: rows }, (_, i) => (
      <ScoreCardSkeleton key={i} {...cardProps} />
    ))}
  </>
);
