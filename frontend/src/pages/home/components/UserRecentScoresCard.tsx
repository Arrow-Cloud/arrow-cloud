import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, Footprints, Music, Settings } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { GradeImage, DifficultyChip } from '../../../components';
import { BannerImage, TabbedCard, ScoreCard } from '../../../components/ui';
import { LeaderboardToggle } from '../../../components/leaderboards/LeaderboardToggle';
import { type LeaderboardId } from '../../../types/leaderboards';
import { formatRelativeTimeAuto } from '../../../utils/formatRelativeTime';
import { type UserRecentPlay } from '../../../schemas/apiSchemas';
import { type SessionSummary } from '../../../services/api';
import type { Tab } from '../../../components/ui/TabbedCard';

interface UserActivityCardProps {
  scores: UserRecentPlay[];
  isLoading: boolean;
  activeLeaderboard: LeaderboardId;
  user: {
    id: string;
    alias: string;
    profileImageUrl?: string | null;
  };
  sessions: SessionSummary[];
  sessionsLoading: boolean;
}

export const UserActivityCard: React.FC<UserActivityCardProps> = ({ scores, isLoading, activeLeaderboard, sessions, sessionsLoading }) => {
  const intl = useIntl();
  const { formatNumber } = intl;

  // Get filtered scores for display
  const filteredScores = scores.filter((score) => score.leaderboards.some((lb) => lb.leaderboard === activeLeaderboard)).slice(0, 10);

  // Scores tab content
  const ScoresContent = (
    <>
      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-base-300/50 rounded"></div>
          ))}
        </div>
      ) : filteredScores.length > 0 ? (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr className="border-base-content/10">
                  <th className="bg-base-200/50 font-semibold text-base-content">
                    <FormattedMessage defaultMessage="Chart" id="56x/zY" description="table header for chart column" />
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
                {filteredScores.map((score, index) => {
                  const leaderboard = score.leaderboards.find((lb) => lb.leaderboard === activeLeaderboard);
                  if (!leaderboard) return null;
                  const grade = leaderboard.data.grade || 'n/a';
                  return (
                    <tr key={`${score.playId || index}-${score.createdAt}`} className="hover:bg-base-100/30 transition-colors border-base-content/5">
                      <td className="py-3">
                        <Link to={`/chart/${score.chart.hash}`} className="flex items-center gap-3 hover:text-primary transition-colors">
                          <div className="w-32 flex-shrink-0">
                            <BannerImage
                              bannerVariants={score.chart.bannerVariants}
                              mdBannerUrl={score.chart.mdBannerUrl}
                              smBannerUrl={score.chart.smBannerUrl}
                              bannerUrl={score.chart.bannerUrl}
                              alt={`${score.chart.title} banner`}
                              className="w-full rounded shadow-sm"
                              style={{ aspectRatio: '2.56' }}
                              iconSize={12}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{score.chart.title}</div>
                            <div className="text-xs text-base-content/60 truncate">{score.chart.artist}</div>
                            <DifficultyChip stepsType={score.chart.stepsType} difficulty={score.chart.difficulty} meter={score.chart.meter} size="sm" />
                          </div>
                        </Link>
                      </td>
                      <td className="py-3 text-center">
                        <GradeImage grade={grade} className="w-8 h-8 object-contain mx-auto" />
                      </td>
                      <td className="py-3 text-center">
                        {typeof score.playId === 'number' ? (
                          <Link to={`/play/${score.playId}`} className="font-bold text-primary hover:underline">
                            {formatNumber(parseFloat(leaderboard.data.score) / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Link>
                        ) : (
                          <span className="font-bold text-primary">
                            {formatNumber(parseFloat(leaderboard.data.score) / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
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
          <div className="md:hidden space-y-4">
            {filteredScores.map((score, index) => {
              const leaderboard = score.leaderboards.find((lb) => lb.leaderboard === activeLeaderboard);
              if (!leaderboard) return null;
              const grade = leaderboard.data.grade || 'n/a';
              const scoreValue = formatNumber(parseFloat(leaderboard.data.score) / 100, {
                style: 'percent',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
              return <ScoreCard key={`${score.playId || index}-${score.createdAt}`} score={score} grade={grade} scoreValue={scoreValue} />;
            })}
          </div>
        </>
      ) : scores.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="p-3 rounded-full bg-secondary/15">
            <Settings className="w-8 h-8 text-secondary" />
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-base-content">
              <FormattedMessage defaultMessage="No scores yet" id="8w2jI4" description="Heading in empty scores state for new players" />
            </p>
            <p className="text-sm text-base-content/60 max-w-xs">
              <FormattedMessage
                defaultMessage="Follow the setup guide to connect your game client and start submitting scores."
                id="0Gu+MG"
                description="Description in empty scores state for new players"
              />
            </p>
          </div>
          <Link
            to="/help#setup"
            className="btn btn-secondary btn-sm gap-2"
            onClick={() => {
              try {
                sessionStorage.setItem('pendingHelpHash', '#setup');
              } catch {}
            }}
          >
            <Settings className="w-4 h-4" />
            <FormattedMessage defaultMessage="Setup Guide" id="fyv7Ug" description="Button linking to setup guide in new player empty state" />
          </Link>
        </div>
      ) : (
        <div className="text-center py-8 text-base-content/60">
          <FormattedMessage defaultMessage="No recent scores yet. Get playing!" id="5E+RUr" description="empty state for user's recent scores" />
        </div>
      )}
    </>
  );

  // Sessions tab content
  const SessionsContent = (
    <div className="space-y-3">
      {sessionsLoading ? (
        <div className="animate-pulse space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-base-300/50 rounded-lg"></div>
          ))}
        </div>
      ) : sessions.length > 0 ? (
        sessions.map((session) => (
          <Link
            key={session.id}
            to={`/session/${session.id}`}
            className="block p-4 bg-base-200/30 rounded-lg border border-base-content/10 hover:bg-base-200/60 hover:border-info/40 hover:shadow-lg transition-all duration-300"
          >
            {/* Top row: Date/time prominently displayed with ongoing badge */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base-content">
                  {new Date(session.startedAt).toLocaleDateString(intl.locale, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span className="text-base-content/60">
                  {new Date(session.startedAt).toLocaleTimeString(intl.locale, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
                {session.isOngoing && (
                  <span className="badge badge-success badge-xs animate-pulse">
                    <FormattedMessage defaultMessage="Live" id="PuRP5k" description="badge for ongoing session" />
                  </span>
                )}
              </div>
              <div className="text-xs text-base-content/50">
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
                  <span>{formatRelativeTimeAuto(session.endedAt, intl)}</span>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-sm text-base-content/70">
              <span className="flex items-center gap-1">
                <Music className="w-4 h-4" />
                <FormattedMessage
                  defaultMessage="{count, plural, one {# play} other {# plays}}"
                  id="Nh4MbP"
                  description="number of plays in session"
                  values={{ count: session.playCount }}
                />
              </span>
              <span className="flex items-center gap-1">
                <Footprints className="w-4 h-4" />
                <FormattedMessage
                  defaultMessage="{count} steps"
                  id="8/S5Tc"
                  description="total steps in session"
                  values={{ count: session.stepsHit.toLocaleString() }}
                />
              </span>
            </div>
          </Link>
        ))
      ) : (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="p-3 rounded-full bg-secondary/15">
            <Settings className="w-8 h-8 text-secondary" />
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-base-content">
              <FormattedMessage defaultMessage="No sessions yet" id="fgE8qV" description="Heading in empty sessions state for new players" />
            </p>
            <p className="text-sm text-base-content/60 max-w-xs">
              <FormattedMessage
                defaultMessage="Follow the setup guide to connect your game client and start submitting scores."
                id="ExNV8o"
                description="Description in empty sessions state for new players"
              />
            </p>
          </div>
          <Link
            to="/help#setup"
            className="btn btn-secondary btn-sm gap-2"
            onClick={() => {
              try {
                sessionStorage.setItem('pendingHelpHash', '#setup');
              } catch {}
            }}
          >
            <Settings className="w-4 h-4" />
            <FormattedMessage defaultMessage="Setup Guide" id="yWR42n" description="Button linking to setup guide in new player empty sessions state" />
          </Link>
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
      title={<FormattedMessage defaultMessage="Your Activity" id="KYCIL1" description="section heading for user's activity" />}
      tabs={tabs}
      persistKey="userActivityView"
      headerControls={(activeTabId) => (activeTabId === 'scores' ? <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} /> : null)}
    />
  );
};

// Re-export with old name for backwards compatibility during transition
export const UserRecentScoresCard = UserActivityCard;
