import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, ArrowRight, Download } from 'lucide-react';
import { AppPageLayout, Alert, GradeImage, DifficultyBadge, ProfileAvatar, InteractiveCard } from '../../components';
import { useAuth } from '../../contexts/AuthContext';
import { BannerImage } from '../../components/ui';
import { getStoredUser, computeHighlight, HighlightedAlias } from '../../utils/rivalHighlight';
import { getBlueShiftData } from '../../services/api';
import { BlueShiftResponse, BlueShiftRecentPlay } from '../../schemas/apiSchemas';
import { LeaderboardToggle } from '../../components/leaderboards/LeaderboardToggle';
import { useLeaderboardView } from '../../contexts/LeaderboardViewContext';
import { findLeaderboardData, isScoreInLeaderboard } from '../../utils/leaderboards';
import { type LeaderboardId } from '../../types/leaderboards';
import { FormattedMessage, useIntl } from 'react-intl';
import { isPhase1Active } from '../../utils/blueshift';

const HeroTitle: React.FC = () => {
  const { formatMessage } = useIntl();
  return (
    <div className="mb-16 text-center flex justify-center">
      <h1 className="text-6xl md:text-8xl from-white via-primary-content to-accent-content animate-pulse">
        <img
          src="https://assets.arrowcloud.dance/logos/20250725/blue shift-t big.png"
          alt={formatMessage({ defaultMessage: 'Blue Shift Logo', id: '+a1gOU', description: 'alt text for the blue shift logo image' })}
          className="w-full max-w-[850px]"
        />
      </h1>
    </div>
  );
};

const RecentPlaySkeleton: React.FC = () => (
  <div className="bg-base-200/30 rounded-lg p-4 border border-base-content/10 animate-pulse">
    {/* Banner Image */}
    <div className="mb-3">
      <div className="w-full bg-base-300/60 rounded shadow-sm" style={{ aspectRatio: '2.56', minHeight: '3rem' }} />
    </div>

    {/* Song Info */}
    <div className="mb-2">
      <div className="h-4 bg-base-300 rounded w-3/4 mb-1"></div>
      <div className="h-3 bg-base-300 rounded w-1/2 mb-1"></div>
      <div className="h-3 bg-base-300 rounded w-1/4"></div>
    </div>

    {/* Score, Player and Date Info */}
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-3 bg-base-300 rounded w-8 mb-1"></div>
          <div className="h-4 bg-base-300 rounded w-16"></div>
        </div>
        <div className="text-right">
          <div className="h-3 bg-base-300 rounded w-8 mb-1"></div>
          <div className="h-6 bg-base-300 rounded w-12"></div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="h-3 bg-base-300 rounded w-6"></div>
        <div className="h-3 bg-base-300 rounded w-12"></div>
      </div>
    </div>
  </div>
);

const AnnouncementSkeleton: React.FC = () => (
  <div className="card bg-success/25 p-6 backdrop-blur-sm shadow-lg animate-pulse">
    <div className="flex items-center mb-2">
      <div className="w-5 h-5 bg-base-300 rounded mr-2"></div>
      <div className="h-5 bg-base-300 rounded w-32"></div>
    </div>
    <div className="space-y-2">
      <div className="h-4 bg-base-300 rounded w-full"></div>
      <div className="h-4 bg-base-300 rounded w-3/4"></div>
    </div>
  </div>
);

const RecentScoreComponent: React.FC<{ score: BlueShiftRecentPlay; activeLeaderboard: 'HardEX' | 'EX' | 'Money' }> = ({ score, activeLeaderboard }) => {
  const { formatMessage, formatDate, formatNumber } = useIntl();
  // Resolve data from whichever backend naming is present
  const id: LeaderboardId = (activeLeaderboard === 'Money' ? 'ITG' : activeLeaderboard) as LeaderboardId;
  const matchingData = findLeaderboardData(score.leaderboards as any, id);
  const scoreValue = formatNumber((matchingData?.score || 0) / 100, { maximumFractionDigits: 2, style: 'percent', minimumFractionDigits: 2 });

  const grade = matchingData ? matchingData.grade : 'n/a';

  return (
    <div className="bg-base-200/30 rounded-lg border border-base-content/10 p-4">
      <Link to={`/chart/${score.chart.hash}`} className="block hover:bg-base-100/20 rounded-lg transition-colors">
        {/* Banner Image */}
        <div className="mb-3">
          <BannerImage
            bannerVariants={score.chart.bannerVariants}
            alt={`${score.chart.title} banner`}
            className="w-full object-contain rounded shadow-sm"
            style={{ aspectRatio: '2.56', minHeight: '3rem' }}
            iconSize={20}
          />
        </div>
      </Link>

      {/* Song Info */}
      <div className="mb-2">
        <div className="font-medium text-base-content text-sm">{score.chart.title}</div>
        <div className="text-xs text-base-content/60">{score.chart.artist}</div>
        <div className="text-xs text-base-content/60 mt-1">
          <DifficultyBadge difficulty={score.chart.difficulty} meter={score.chart.meter} />
        </div>
      </div>

      {/* Score, Player and Date Info */}
      <div className="space-y-2">
        {/* Player and Score */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-base-content/60">
              <GradeImage grade={grade} className="w-8 h-8 object-contain" />
            </div>
            <div className="font-medium text-base-content text-sm">
              <Link to={`/user/${score.user.id}`} className="hover:text-primary transition-colors">
                {score.user.alias}
              </Link>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-base-content/60">
              {formatMessage({ defaultMessage: 'Score', id: 'RAgpSZ', description: 'label next to a score in the recent scores section' })}
            </div>
            {typeof score.playId === 'number' ? (
              <Link to={`/play/${score.playId}`} className="font-bold text-lg text-primary">
                {scoreValue}
              </Link>
            ) : (
              <div className="font-bold text-lg text-primary">{scoreValue}</div>
            )}
          </div>
        </div>

        {/* Time */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-base-content/60">
            {formatMessage({ defaultMessage: 'Time', id: 'No2aRz', description: 'label next to the time a recent score was ' })}
          </span>
          <span className="text-base-content/70">
            {formatDate(score.createdAt, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>
    </div>
  );
};

const OverallLeaderboard: React.FC<{ activeFilter: 'HardEX' | 'EX' | 'Money'; blueShiftData: BlueShiftResponse | null; isLoading: boolean }> = ({
  activeFilter,
  blueShiftData,
  isLoading,
}) => {
  const { formatMessage } = useIntl();
  const getLeaderboardData = () => {
    if (!blueShiftData?.overallLeaderboard) return [];

    switch (activeFilter) {
      case 'HardEX':
        return blueShiftData.overallLeaderboard.leaderboards.hardEX.rankings.slice(0, 10); // Top 10
      case 'EX':
        return blueShiftData.overallLeaderboard.leaderboards.EX.rankings.slice(0, 10);
      case 'Money':
        return blueShiftData.overallLeaderboard.leaderboards.money.rankings.slice(0, 10);
      default:
        return [];
    }
  };

  const leaderboardData = getLeaderboardData();
  const storedUser = getStoredUser();
  const rivalIds: string[] = storedUser?.rivalUserIds || [];
  const thead = (
    <thead>
      <tr className="border-base-content/10">
        <th className="bg-base-200/50 font-semibold text-base-content text-center">
          {formatMessage({ defaultMessage: 'Rank', id: 'JEZQFw', description: 'table column header for player rank within the event' })}
        </th>
        <th className="bg-base-200/50 font-semibold text-base-content">
          {formatMessage({ defaultMessage: 'Player', id: 'stf0NS', description: 'table column header for player within the event' })}
        </th>
        <th className="bg-base-200/50 font-semibold text-base-content text-center">
          {formatMessage({
            defaultMessage: 'Points',
            id: 'byTjHq',
            description: 'table column header for total points earned by a player within the event',
          })}
        </th>
      </tr>
    </thead>
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {/* Desktop Table Skeleton */}
        <div className="md:block overflow-x-auto">
          <table className="table w-full">
            {thead}
            <tbody>
              {Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="border-base-content/5">
                  <td className="py-4 text-center">
                    <div className="h-6 bg-base-300 rounded w-8 mx-auto animate-pulse"></div>
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-base-300 rounded-full animate-pulse"></div>
                      <div className="h-4 bg-base-300 rounded w-24 animate-pulse"></div>
                    </div>
                  </td>
                  <td className="py-4 text-center">
                    <div className="h-6 bg-base-300 rounded w-16 mx-auto animate-pulse"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards Skeleton */}
        <div className="md:hidden space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="bg-base-200/30 rounded-lg p-4 border border-base-content/10 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-base-300 rounded"></div>
                  <div className="w-8 h-8 bg-base-300 rounded-full"></div>
                  <div className="w-20 h-4 bg-base-300 rounded"></div>
                </div>
                <div className="w-16 h-6 bg-base-300 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Desktop Table */}
      <div className="overflow-x-auto">
        <table className="table w-full">
          {thead}
          <tbody>
            {leaderboardData.length > 0 ? (
              leaderboardData.map((entry) => {
                const highlight = computeHighlight(storedUser?.id, rivalIds, entry.userId);
                return (
                  <tr key={entry.rank} className={`hover:brightness-110 transition-colors border-base-content/5 ${highlight.rowGradientClass}`}>
                    <td className="py-4 text-center">
                      <div className={`font-bold text-lg ${highlight.rankColorClass}`}>
                        <FormattedMessage
                          defaultMessage="#{rank,number}"
                          id="dQfrc/"
                          description="stat indicating a user's rank"
                          values={{ rank: entry.rank }}
                        />
                      </div>
                    </td>
                    <td className="py-4">
                      <Link
                        to={`/user/${entry.userId}`}
                        className={`font-medium hover:text-primary transition-colors flex items-center gap-3 ${highlight.playerTextClass}`}
                      >
                        <ProfileAvatar profileImageUrl={entry.userProfileImageUrl} alias={entry.userAlias} size="sm" />
                        <HighlightedAlias alias={entry.userAlias} highlight={highlight} />
                      </Link>
                    </td>
                    <td className="py-4 text-center">
                      <div className={`font-bold text-lg ${highlight.scoreColorClass}`}>{entry.totalPoints.toLocaleString()}</div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="py-8 text-center text-base-content/60">
                  {formatMessage({
                    defaultMessage: 'No leaderboard data available',
                    id: 'wVs4V5',
                    description: 'fallback case for the event leaderboard table',
                  })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const BlueShiftPage: React.FC<{ limit?: number | null }> = ({ limit }) => {
  const { formatMessage } = useIntl();
  const { user, isInitializing, hasPermission } = useAuth();
  const { activeLeaderboard } = useLeaderboardView();
  const activeLeaderboardFilter = activeLeaderboard === 'ITG' ? 'Money' : activeLeaderboard; // map ITG -> Money naming
  const activeRecentFilter = activeLeaderboardFilter;
  const [blueShiftData, setBlueShiftData] = useState<BlueShiftResponse | null>(null);
  const [isBlueShiftLoading, setIsBlueShiftLoading] = useState(true);
  const [blueShiftError, setBlueShiftError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsBlueShiftLoading(true);
        // Use provided limit prop (null for full data, 10 for homepage preview, or undefined for default)
        const response = await getBlueShiftData(limit !== undefined ? limit : null);
        setBlueShiftData(response);
        setBlueShiftError(null);
      } catch (err) {
        console.error('Failed to fetch Blue Shift data:', err);
        setBlueShiftError('Failed to load Blue Shift data');
      } finally {
        setIsBlueShiftLoading(false);
      }
    };

    fetchData();
  }, [limit]);

  const noScoresMsg = formatMessage({
    defaultMessage: 'No recent scores available',
    id: 'Rp8OF+',
    description: 'fallback case when no recent scores load for the event',
  });

  // Check for blue-shift.preview permission
  if (isInitializing) {
    return (
      <AppPageLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="text-center">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        </div>
      </AppPageLayout>
    );
  }

  // Allow access if Phase 1 has started or user has preview permission
  if (!isPhase1Active() && !hasPermission('blue-shift.preview')) {
    return (
      <AppPageLayout>
        <div className="container mx-auto px-4 py-6">
          <Alert variant="error">
            <h2 className="text-2xl font-bold mb-2">
              <FormattedMessage defaultMessage="Access Denied" description="Access denied alert heading" id="STVQpe" />
            </h2>
            <p>
              <FormattedMessage
                defaultMessage="You do not have permission to access this page. The Blue Shift event is currently in preview."
                description="Access denied message for the Blue Shift event page during preview"
                id="ANUZlc"
              />
            </p>
          </Alert>
        </div>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout>
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header Section with existing HeroTitle plus conditional onboarding hero */}
        <div className="text-center mt-8 mb-12">
          <HeroTitle />
          {/* Conditional onboarding / help center CTA */}
          {!isInitializing && (!user || (user && (user as any).userHasSubmittedScore !== true)) && (
            <div className="mt-4 mx-auto max-w-4xl px-4">
              <div className="relative group">
                {/* Glow */}
                <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-primary via-secondary to-accent opacity-60 blur-xl group-hover:opacity-80 transition-opacity"></div>
                <div className="relative rounded-2xl overflow-hidden border border-primary/30 bg-gradient-to-br from-base-200/80 via-base-100/60 to-base-300/40 backdrop-blur-xl shadow-2xl shadow-primary/20">
                  <div className="p-8 md:p-10">
                    <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-accent mb-4">
                      {formatMessage({
                        defaultMessage: 'Welcome to Arrow Cloud',
                        id: 'C6tISW',
                        description: 'introductory header on the blueshift event page',
                      })}
                    </h2>
                    <p className="text-base md:text-lg leading-relaxed text-base-content/80 max-w-3xl mx-auto mb-6">
                      {formatMessage({
                        defaultMessage: 'A modern ITG platform for score tracking, leaderboards, events, rivalries, and more.',
                        id: 'Duq0nQ',
                        description: 'introductory paragraph on the event page',
                      })}
                    </p>
                    <div className="flex flex-wrap gap-4 justify-center">
                      {(user && (
                        <a
                          href="/help#setup"
                          className="btn btn-primary btn-lg normal-case gap-2 shadow-lg hover:shadow-primary/40 transition-all group/btn"
                          onClick={() => {
                            // Allow normal navigation but store intent in sessionStorage for smooth scroll after load
                            try {
                              sessionStorage.setItem('pendingHelpHash', '#setup');
                            } catch {}
                          }}
                        >
                          <span>
                            {formatMessage({
                              defaultMessage: 'Finish Setup & Submit a Score',
                              id: 's4GvEu',
                              description: 'label on a CTA button sending a user to the help page',
                            })}
                          </span>
                          <ArrowRight className="w-5 h-5 transition-transform group-hover/btn:translate-x-1" />
                        </a>
                      )) ||
                        null}
                      <a
                        href="/help#what-it-is"
                        className="btn btn-outline btn-lg normal-case border-base-content/30 hover:border-primary/60 hover:text-primary"
                        onClick={() => {
                          try {
                            sessionStorage.setItem('pendingHelpHash', '#what-is');
                          } catch {}
                        }}
                      >
                        {formatMessage({ defaultMessage: 'What Is Arrow Cloud?', id: '2TD5hu', description: 'button label leading to the help page' })}
                      </a>
                      {!user && (
                        <a href="/register" className="btn btn-accent btn-lg normal-case shadow-md hover:shadow-accent/40">
                          {formatMessage({ defaultMessage: 'Create Account', id: 'oueHUv', description: 'button label appearing for anonymous users' })}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Discord invite moved to footer icon */}

        {/* Announcement/Info Pane */}
        {isBlueShiftLoading ? (
          <AnnouncementSkeleton />
        ) : blueShiftError ? (
          <Alert variant="error" className="mb-4">
            {blueShiftError}
          </Alert>
        ) : blueShiftData ? (
          <div className="relative group">
            <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-green-400/50 via-primary/50 to-accent/50 opacity-40 blur-xl group-hover:opacity-60 transition-opacity"></div>
            <div className="card relative bg-base-100/70 p-6 backdrop-blur-xl shadow-2xl border border-success/30">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-base-content mb-1 flex items-center">
                    <Megaphone className="w-5 h-5 mr-2 text-success" />
                    {formatMessage({ defaultMessage: 'Announcement', id: 'dhBX9c', description: 'section heading for event-related announcements' })}
                  </h2>
                  <p className="text-base-content/80">{blueShiftData.announcement}</p>
                </div>
                {blueShiftData.announcementDownloadUrl && (
                  <a
                    href={blueShiftData.announcementDownloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary gap-2 self-start lg:self-auto shadow-lg hover:shadow-primary/40"
                  >
                    <Download className="w-5 h-5" />
                    {formatMessage({ defaultMessage: 'Download Pack', id: 'SSi3N2', description: 'button label for the link to pack download' })}
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Overall Leaderboard */}
          <InteractiveCard>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-base-content">
                  {formatMessage({ defaultMessage: 'Overall Leaderboard', id: 'oid8be', description: 'section heading for the leaderboard card' })}
                </h2>
                <div className="flex gap-2">
                  <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />
                  <Link to="/leaderboards/overall" className="btn btn-sm btn-outline normal-case">
                    {formatMessage({
                      defaultMessage: 'View full',
                      id: 'BSsFlc',
                      description:
                        'link text leading to the dedicated leaderboard page; displayed next to radio-toggle style buttons for the three leaderboard types',
                    })}
                  </Link>
                </div>
              </div>
              <OverallLeaderboard activeFilter={activeLeaderboardFilter} blueShiftData={blueShiftData} isLoading={isBlueShiftLoading} />
            </div>
          </InteractiveCard>
          {/* Recent Scores */}
          <div className="card bg-base-100/80 p-6 backdrop-blur-sm shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-base-content">
                {formatMessage({ defaultMessage: 'Recent Scores', id: 'iYUlUC', description: 'section header for the recent scores card' })}
              </h2>
              <div className="flex gap-2">
                <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />
              </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr className="border-base-content/10">
                    <th className="bg-base-200/50 font-semibold text-base-content">
                      {formatMessage({ defaultMessage: 'Chart', id: 'bH4nBJ', description: 'table column header for the recent scores on the event page' })}
                    </th>
                    <th className="bg-base-200/50 font-semibold text-base-content">
                      {formatMessage({ defaultMessage: 'Player', id: 'n4o4oJ', description: 'table column header for the recent scores on the event page' })}
                    </th>
                    <th className="bg-base-200/50 font-semibold text-base-content text-center">
                      {formatMessage({ defaultMessage: 'Grade', id: 'czOkfs', description: 'table column header for the recent scores on the event page' })}
                    </th>
                    <th className="bg-base-200/50 font-semibold text-base-content text-center">
                      {formatMessage({ defaultMessage: 'Score', id: 'pfIZz9', description: 'table column header for the recent scores on the event page' })}
                    </th>
                    <th className="bg-base-200/50 font-semibold text-base-content text-center">
                      {formatMessage({ defaultMessage: 'Time', id: 'e8mHcE', description: 'table column header for the recent scores on the event page' })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isBlueShiftLoading ? (
                    // Show skeleton rows while loading
                    Array.from({ length: 3 }).map((_, index) => (
                      <tr key={index} className="border-base-content/5">
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-16 h-6 bg-base-300/60 rounded animate-pulse"></div>
                            <div>
                              <div className="h-4 bg-base-300 rounded w-32 mb-1 animate-pulse"></div>
                              <div className="h-3 bg-base-300 rounded w-24 mb-1 animate-pulse"></div>
                              <div className="h-3 bg-base-300 rounded w-16 animate-pulse"></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="h-4 bg-base-300 rounded w-20 animate-pulse"></div>
                        </td>
                        <td className="py-4 text-center">
                          <div className="h-6 bg-base-300 rounded w-16 mx-auto animate-pulse"></div>
                        </td>
                        <td className="py-4 text-center">
                          <div className="h-4 bg-base-300 rounded w-20 mx-auto animate-pulse"></div>
                        </td>
                      </tr>
                    ))
                  ) : blueShiftData?.recentPlays ? (
                    blueShiftData.recentPlays
                      .filter((score) => {
                        const id: LeaderboardId = (activeRecentFilter === 'Money' ? 'ITG' : activeRecentFilter) as LeaderboardId;
                        return isScoreInLeaderboard(score as any, id);
                      })
                      .map((score, index) => {
                        const storedUser = getStoredUser();
                        const rivalIdsLocal: string[] = storedUser?.rivalUserIds || [];
                        const highlight = computeHighlight(storedUser?.id, rivalIdsLocal, score.user.id);
                        // Resolve leaderboard data for display
                        const id: LeaderboardId = (activeRecentFilter === 'Money' ? 'ITG' : activeRecentFilter) as LeaderboardId;
                        const matching = findLeaderboardData(score.leaderboards as any, id) as any | undefined;
                        const scoreValue = matching ? matching.score : 'n/a';
                        const grade = matching ? matching.grade : 'n/a';

                        const timestamp = new Date(score.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        });

                        return (
                          <tr key={index} className={`relative transition-colors border-base-content/5 hover:brightness-110 ${highlight.rowGradientClass}`}>
                            <td className="py-4">
                              <Link to={`/chart/${score.chart.hash}`} className="block hover:bg-base-100/20 -m-2 p-2 rounded transition-colors">
                                <div className="flex items-center gap-3">
                                  <BannerImage
                                    bannerVariants={score.chart.bannerVariants}
                                    alt={`${score.chart.title} banner`}
                                    className="w-32 h-12 object-cover rounded shadow-sm"
                                    style={{ aspectRatio: '2.56' }}
                                    iconSize={12}
                                  />
                                  <div>
                                    <div className="font-medium text-base-content">{score.chart.title}</div>
                                    <div className="text-sm text-base-content/70">{score.chart.artist}</div>
                                    <div className="text-xs text-base-content/60">
                                      <DifficultyBadge difficulty={score.chart.difficulty} meter={score.chart.meter} />
                                    </div>
                                  </div>
                                </div>
                              </Link>
                            </td>
                            <td className="py-4">
                              <Link
                                to={`/user/${score.user.id}`}
                                className={`font-medium inline-flex items-center gap-1 hover:text-primary transition-colors ${highlight.playerTextClass}`}
                              >
                                <HighlightedAlias alias={score.user.alias} highlight={highlight} className="inline-flex items-center gap-1" />
                              </Link>
                            </td>
                            <td className="py-4 text-center">
                              <div className="flex items-center justify-center">
                                <GradeImage grade={grade} className="w-8 h-8 object-contain" />
                              </div>
                            </td>
                            <td className="py-4 text-center">
                              {typeof score.playId === 'number' ? (
                                <Link to={`/play/${score.playId}`} className={`font-bold text-lg ${highlight.scoreColorClass}`}>
                                  {scoreValue}
                                </Link>
                              ) : (
                                <div className={`font-bold text-lg ${highlight.scoreColorClass}`}>{scoreValue}</div>
                              )}
                            </td>
                            <td className="py-4 text-center">
                              <div className="text-sm text-base-content/70">{timestamp}</div>
                            </td>
                          </tr>
                        );
                      })
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-base-content/60">
                        {noScoresMsg}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {isBlueShiftLoading ? (
                Array.from({ length: 3 }).map((_, index) => <RecentPlaySkeleton key={index} />)
              ) : blueShiftData?.recentPlays ? (
                blueShiftData.recentPlays
                  .filter((score) => {
                    const id: LeaderboardId = (activeRecentFilter === 'Money' ? 'ITG' : activeRecentFilter) as LeaderboardId;
                    return isScoreInLeaderboard(score as any, id);
                  })
                  .map((score, index) => <RecentScoreComponent key={index} score={score} activeLeaderboard={activeRecentFilter} />)
              ) : (
                <div className="text-center py-8 text-base-content/60">{noScoresMsg}</div>
              )}
            </div>
          </div>
        </div>

        {/* Charts Table */}
        <div className="card bg-base-100/80 p-6 backdrop-blur-sm shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-base-content">
              {formatMessage({ defaultMessage: 'Event Charts', id: '0Susv7', description: 'section heading for the list of charts in the event' })}
            </h2>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr className="border-base-content/10">
                  <th className="bg-base-200/50 font-semibold text-base-content">
                    {formatMessage({ defaultMessage: 'Chart', id: 'GRui4y', description: 'table heading for the list of charts in the event' })}
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content text-center">
                    {formatMessage({ defaultMessage: 'Difficulty', id: 'TSz5Re', description: 'table heading for the list of charts in the event' })}
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content">
                    {formatMessage({ defaultMessage: 'Chart Artist', id: 'FXXCXg', description: 'table heading for the list of charts in the event' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {isBlueShiftLoading ? (
                  // Show skeleton rows while loading
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index} className="border-base-content/5">
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-32 h-12 bg-base-300/60 rounded animate-pulse"></div>
                          <div>
                            <div className="h-4 bg-base-300 rounded w-32 mb-1 animate-pulse"></div>
                            <div className="h-3 bg-base-300 rounded w-24 animate-pulse"></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 text-center">
                        <div className="h-4 bg-base-300 rounded w-20 mx-auto animate-pulse"></div>
                      </td>
                      <td className="py-4">
                        <div className="h-4 bg-base-300 rounded w-24 animate-pulse"></div>
                      </td>
                    </tr>
                  ))
                ) : blueShiftData?.charts ? (
                  blueShiftData.charts.map((chart) => (
                    <tr key={chart.hash} className="hover:bg-base-100/30 transition-colors border-base-content/5">
                      <td className="py-4">
                        <Link to={`/chart/${chart.hash}`} className="block hover:bg-base-100/20 -m-2 p-2 rounded transition-colors">
                          <div className="flex items-center gap-3">
                            <BannerImage
                              bannerVariants={chart.bannerVariants}
                              alt={`${chart.title} banner`}
                              className="w-32 h-12 object-cover rounded shadow-sm"
                              style={{ aspectRatio: '2.56' }}
                              iconSize={12}
                            />
                            <div>
                              <div className="font-medium text-base-content">{chart.title}</div>
                              <div className="text-sm text-base-content/70">{chart.artist}</div>
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="py-4 text-center">
                        <DifficultyBadge difficulty={chart.difficulty} meter={chart.meter} />
                      </td>
                      <td className="py-4">
                        <div className="text-sm text-base-content/70">
                          {chart.credit ||
                            formatMessage({
                              defaultMessage: 'Unknown',
                              id: 'rPy5Tt',
                              description: 'fallback text when we have no credit info for the artist of a song',
                            })}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-base-content/60">
                      {formatMessage({
                        defaultMessage: 'No charts available',
                        id: '6e+rCB',
                        description: 'fallback text when we have no data to display for the charts in the event',
                      })}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {isBlueShiftLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="bg-base-200/30 rounded-lg p-4 border border-base-content/10 animate-pulse">
                  {/* Banner Image */}
                  <div className="mb-3">
                    <div className="w-full bg-base-300/60 rounded shadow-sm" style={{ aspectRatio: '2.56', minHeight: '3rem' }} />
                  </div>
                  {/* Song Info */}
                  <div className="mb-2">
                    <div className="h-4 bg-base-300 rounded w-3/4 mb-1"></div>
                    <div className="h-3 bg-base-300 rounded w-1/2 mb-1"></div>
                    <div className="h-3 bg-base-300 rounded w-1/4"></div>
                  </div>
                  {/* Chart Artist */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-base-content/60">
                      {formatMessage({
                        defaultMessage: 'Chart Artist',
                        id: '9kMeyR',
                        description: "label next to a song's artist for a song in the event (mobile layout)",
                      })}
                    </span>
                    <div className="h-3 bg-base-300 rounded w-16"></div>
                  </div>
                </div>
              ))
            ) : blueShiftData?.charts ? (
              blueShiftData.charts.map((chart) => (
                <div key={chart.hash} className="bg-base-200/30 rounded-lg p-4 border border-base-content/10">
                  <Link to={`/chart/${chart.hash}`} className="block hover:opacity-80 transition-opacity">
                    {/* Banner Image */}
                    <div className="mb-3">
                      <BannerImage
                        bannerVariants={chart.bannerVariants}
                        alt={`${chart.title} banner`}
                        className="w-full object-contain rounded shadow-sm"
                        style={{ aspectRatio: '2.56', minHeight: '3rem' }}
                        iconSize={20}
                      />
                    </div>

                    {/* Song Info */}
                    <div className="mb-2">
                      <div className="font-medium text-base-content text-sm">{chart.title}</div>
                      <div className="text-xs text-base-content/60">{chart.artist}</div>
                      <div className="text-xs text-base-content/60 mt-1">
                        <DifficultyBadge difficulty={chart.difficulty} meter={chart.meter} />
                      </div>
                    </div>
                  </Link>

                  {/* Chart Artist - Outside link since it's not part of chart details */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-base-content/60">
                      {formatMessage({
                        defaultMessage: 'Chart Artist',
                        id: '9kMeyR',
                        description: "label next to a song's artist for a song in the event (mobile layout)",
                      })}
                    </span>
                    <span className="text-base-content/70">
                      {chart.credit ||
                        formatMessage({
                          defaultMessage: 'Unknown',
                          id: 'rPy5Tt',
                          description: 'fallback text when we have no credit info for the artist of a song',
                        })}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-base-content/60">
                {formatMessage({
                  defaultMessage: 'No charts available',
                  id: '6e+rCB',
                  description: 'fallback text when we have no data to display for the charts in the event',
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legacy floating Discord button removed per new UX guidelines */}
    </AppPageLayout>
  );
};
