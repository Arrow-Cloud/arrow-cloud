import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, Footprints, Music } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { ProfileAvatar, GradeImage, Pagination, DifficultyChip } from '../../../components';
import type { PaginationMeta } from '../../../components/ui/Pagination';
import { BannerImage, TabbedCard, ScoreCard } from '../../../components/ui';
import { LeaderboardToggle } from '../../../components/leaderboards/LeaderboardToggle';
import { findLeaderboardData } from '../../../utils/leaderboards';
import { formatRelativeTimeAuto } from '../../../utils/formatRelativeTime';
import { type LeaderboardId } from '../../../types/leaderboards';
import { type GlobalRecentScore, type SessionSummary } from '../../../services/api';
import type { Tab } from '../../../components/ui/TabbedCard';
import { ListLoadError, Skeleton, SkeletonRows } from '../../../components/ui';
import type { SkeletonColumn } from '../../../components/ui';
import { SCORE_SKELETON_CELLS, ScoreCardListSkeleton } from '../../../components/plays/ScoreListSkeleton';
import { SessionListSkeleton } from '../../../components/sessions/SessionCardSkeleton';
import type { PaginatedLoadState } from '../../../hooks/usePaginatedResource';

const PAGE_SIZE = 10;

/**
 * Placeholder cells sized like the compact Home rows: `py-3` cells, a chart cell with
 * text-sm title + text-xs artist + small chip (56px), and a one-line date/time.
 */
const HOME_SCORE_SKELETON_COLUMNS: SkeletonColumn[] = [
  {
    className: 'py-3',
    content: (
      <div className="flex items-center gap-3">
        <Skeleton className="w-20 sm:w-32 aspect-[2.56] rounded shrink-0" />
        <div className="flex-1 h-14 flex flex-col justify-between py-0.5">
          <Skeleton className="h-4 w-32 max-w-full" />
          <Skeleton className="h-3 w-24 max-w-full" />
          <Skeleton className="h-4 w-12 rounded-full" />
        </div>
      </div>
    ),
  },
  { ...SCORE_SKELETON_CELLS.playerWithAvatar, className: 'py-3' },
  { className: 'py-3 text-center', content: <Skeleton className="w-8 h-8 rounded mx-auto" /> },
  { className: 'py-3 text-center', content: <Skeleton className="h-5 w-16 mx-auto" /> },
  { className: 'py-3 text-right', content: <Skeleton className="h-4 w-24 ml-auto" /> },
];

interface GlobalActivityCardProps {
  scores: GlobalRecentScore[];
  loadState: PaginatedLoadState;
  paginationMeta: PaginationMeta | null;
  onPageChange: (page: number) => void;
  activeLeaderboard: LeaderboardId;
  user: { id: string } | null;
  rivalsOnly: boolean;
  onRivalsOnlyChange: (value: boolean) => void;
  sessions: SessionSummary[];
  sessionsLoadState: PaginatedLoadState;
  sessionsPaginationMeta: PaginationMeta | null;
  onSessionsPageChange: (page: number) => void;
}

export const GlobalActivityCard: React.FC<GlobalActivityCardProps> = ({
  scores,
  loadState,
  paginationMeta,
  onPageChange,
  activeLeaderboard,
  user,
  rivalsOnly,
  onRivalsOnlyChange,
  sessions,
  sessionsLoadState,
  sessionsPaginationMeta,
  onSessionsPageChange,
}) => {
  const intl = useIntl();
  const activeTab = (activeLeaderboard === 'ITG' ? 'Money' : activeLeaderboard) as 'HardEX' | 'EX' | 'Money';

  // Scores tab content
  const ScoresContent = (
    <>
      <ListLoadError state={loadState} />
      {loadState.isInitialLoading || scores.length > 0 ? (
        <>
          {/* Desktop Table */}
          <div className={`hidden md:block overflow-x-auto -mx-4 sm:mx-0 ${loadState.showBusy ? 'opacity-50' : ''}`} aria-busy={loadState.isFetching}>
            <table className="table w-full min-w-[640px]">
              <thead>
                <tr className="border-base-content/10">
                  <th className="bg-base-200/50 font-semibold text-base-content">
                    <FormattedMessage defaultMessage="Chart" id="56x/zY" description="table header for chart column" />
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content">
                    <FormattedMessage defaultMessage="Player" id="VzU8H9" description="table header for player column" />
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content text-center">
                    <FormattedMessage defaultMessage="Grade" id="DYQ8XL" description="table header for grade column" />
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content text-center">
                    <FormattedMessage defaultMessage="Score" id="x7nBF5" description="table header for score column" />
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content text-right">
                    <FormattedMessage defaultMessage="Time" id="S1Vv4x" description="table header for time column" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadState.isInitialLoading && <SkeletonRows rows={PAGE_SIZE} columns={HOME_SCORE_SKELETON_COLUMNS} />}
                {scores.map((score, index) => {
                  const id: LeaderboardId = (activeTab === 'Money' ? 'ITG' : activeTab) as LeaderboardId;
                  const matchingData = findLeaderboardData(score.leaderboards as any, id);
                  const scoreValue = Number(matchingData?.score || 0).toFixed(2) + '%';
                  const grade = matchingData ? matchingData.grade : 'n/a';
                  return (
                    <tr key={`${score.playId || index}-${score.createdAt}`} className="hover:bg-base-100/30 transition-colors border-base-content/5">
                      <td className="py-3 max-w-[200px] sm:max-w-[280px]">
                        <Link to={`/chart/${score.chart.hash}`} className="flex items-center gap-3 hover:text-primary transition-colors min-w-0">
                          <div className="w-20 sm:w-32 flex-shrink-0">
                            <BannerImage
                              bannerVariants={score.chart.bannerVariants as any}
                              mdBannerUrl={score.chart.mdBannerUrl}
                              smBannerUrl={score.chart.smBannerUrl}
                              bannerUrl={score.chart.bannerUrl}
                              alt={`${score.chart.title} banner`}
                              className="w-full rounded shadow-sm"
                              style={{ aspectRatio: '2.56' }}
                              iconSize={12}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate">{score.chart.title}</div>
                            <div className="text-xs text-base-content/60 truncate">{score.chart.artist}</div>
                            <DifficultyChip stepsType={score.chart.stepsType} difficulty={score.chart.difficulty} meter={score.chart.meter} size="sm" />
                          </div>
                        </Link>
                      </td>
                      <td className="py-3">
                        <Link to={`/user/${score.user.id}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                          <ProfileAvatar profileImageUrl={score.user.profileImageUrl} alias={score.user.alias} size="sm" />
                          <span className="font-medium text-sm">{score.user.alias}</span>
                        </Link>
                      </td>
                      <td className="py-3 text-center">
                        <GradeImage grade={grade} className="w-8 h-8 object-contain mx-auto" />
                      </td>
                      <td className="py-3 text-center">
                        {typeof score.playId === 'number' ? (
                          <Link to={`/play/${score.playId}`} className="font-bold text-primary hover:underline">
                            {scoreValue}
                          </Link>
                        ) : (
                          <span className="font-bold text-primary">{scoreValue}</span>
                        )}
                      </td>
                      <td className="py-3 text-right text-sm text-base-content/70">
                        {new Date(score.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className={`md:hidden space-y-4 ${loadState.showBusy ? 'opacity-50' : ''}`} aria-busy={loadState.isFetching}>
            {loadState.isInitialLoading && <ScoreCardListSkeleton rows={PAGE_SIZE} withChart withPlayer />}
            {scores.map((score, index) => {
              const id: LeaderboardId = (activeTab === 'Money' ? 'ITG' : activeTab) as LeaderboardId;
              const matchingData = findLeaderboardData(score.leaderboards as any, id);
              const scoreValue = Number(matchingData?.score || 0).toFixed(2) + '%';
              const grade = matchingData ? matchingData.grade : 'n/a';
              return <ScoreCard key={`${score.playId || index}-${score.createdAt}`} score={score} grade={grade} scoreValue={scoreValue} showPlayer />;
            })}
          </div>

          {paginationMeta && paginationMeta.totalPages > 1 && (
            <div className="mt-6">
              <Pagination meta={paginationMeta} onPageChange={onPageChange} disabled={loadState.isFetching} />
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8 text-base-content/60">
          <FormattedMessage defaultMessage="No recent scores available" id="lWmuWi" description="empty state for recent scores" />
        </div>
      )}
    </>
  );

  // Sessions tab content
  const SessionsContent = (
    <div className={`space-y-3 ${sessionsLoadState.showBusy ? 'opacity-50' : ''}`} aria-busy={sessionsLoadState.isFetching}>
      <ListLoadError state={sessionsLoadState} />
      {sessionsLoadState.isInitialLoading ? (
        <SessionListSkeleton rows={PAGE_SIZE} withUser />
      ) : sessions.length > 0 ? (
        sessions.map((session) => (
          <Link
            key={session.id}
            to={`/session/${session.id}`}
            className="block p-4 bg-base-200/30 rounded-lg border border-base-content/10 hover:bg-base-200/60 hover:border-accent/40 hover:shadow-lg transition-all duration-300"
          >
            {/* Top row: Avatar, name, ongoing badge, and time */}
            <div className="flex items-center gap-3 mb-2">
              <ProfileAvatar profileImageUrl={session.userProfileImageUrl} alias={session.userAlias} size="sm" />
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="font-semibold text-base-content truncate">{session.userAlias}</span>
                {session.isOngoing && (
                  <span className="badge badge-success badge-xs">
                    <FormattedMessage defaultMessage="Ongoing" id="X0NEcW" description="badge for ongoing session" />
                  </span>
                )}
              </div>
              <div className="text-xs text-base-content/60 flex-shrink-0">
                {session.isOngoing ? (
                  <FormattedMessage
                    defaultMessage="Started {time}"
                    id="BlBhJ7"
                    description="when session started"
                    values={{
                      time: formatRelativeTimeAuto(session.startedAt, intl),
                    }}
                  />
                ) : (
                  <FormattedMessage
                    defaultMessage="Ended {time}"
                    id="j6cl8r"
                    description="when session ended"
                    values={{
                      time: formatRelativeTimeAuto(session.endedAt, intl),
                    }}
                  />
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-sm text-base-content/70 pl-9">
              <span className="flex items-center gap-1">
                <Footprints className="w-4 h-4" />
                <FormattedMessage
                  defaultMessage="{count} steps"
                  id="8/S5Tc"
                  description="total steps in session"
                  values={{ count: session.stepsHit.toLocaleString() }}
                />
              </span>
              <span className="flex items-center gap-1">
                <Music className="w-4 h-4" />
                <FormattedMessage defaultMessage="{count} plays" id="IXRHTg" description="number of plays in session" values={{ count: session.playCount }} />
              </span>
            </div>
          </Link>
        ))
      ) : (
        <div className="text-center py-8 text-base-content/60">
          <FormattedMessage defaultMessage="No recent sessions available" id="J4DsUl" description="empty state for recent sessions" />
        </div>
      )}
      {sessionsPaginationMeta && sessionsPaginationMeta.totalPages > 1 && (
        <div className="mt-6">
          <Pagination meta={sessionsPaginationMeta} onPageChange={onSessionsPageChange} disabled={sessionsLoadState.isFetching} />
        </div>
      )}
    </div>
  );

  const tabs: Tab[] = [
    {
      id: 'scores',
      label: intl.formatMessage({ defaultMessage: 'Scores', id: 'GbDfeL', description: 'tab label for recent scores' }),
      content: ScoresContent,
    },
    {
      id: 'sessions',
      label: intl.formatMessage({ defaultMessage: 'Sessions', id: 'oJibSl', description: 'tab label for recent sessions' }),
      content: SessionsContent,
    },
  ];

  return (
    <TabbedCard
      icon={Activity}
      title={<FormattedMessage defaultMessage="Global Activity" id="apFDFw" description="section heading for global activity" />}
      tabs={tabs}
      persistKey="homeActivityView"
      headerControls={(activeTabId) => (
        <div className="flex flex-wrap items-center gap-4">
          {user && (
            <label className="label cursor-pointer gap-2">
              <input
                type="checkbox"
                className="checkbox checkbox-accent checkbox-sm"
                checked={rivalsOnly}
                onChange={(e) => {
                  onRivalsOnlyChange(e.target.checked);
                  onPageChange(1);
                }}
              />
              <span className="label-text text-sm">
                <FormattedMessage defaultMessage="Show Rivals Only" id="sQcEY7" description="checkbox to filter scores to only show rivals" />
              </span>
            </label>
          )}
          {activeTabId === 'scores' && <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />}
        </div>
      )}
    />
  );
};
