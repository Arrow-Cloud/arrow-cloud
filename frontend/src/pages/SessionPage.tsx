import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FormattedMessage, FormattedDate, FormattedNumber, useIntl } from 'react-intl';
import { Clock, Play, Hash, Footprints, Loader2, Music, Timer, Activity, BarChart3, Trophy, Share2 } from 'lucide-react';
import { AppPageLayout, Alert, ProfileAvatar, GradeImage, Pagination, JudgmentList, SessionShareModal } from '../components';
import { DifficultyChip } from '../components/DifficultyChip';
import type { PaginationMeta } from '../components/ui/Pagination';
import { BannerImage } from '../components/ui';
import { LeaderboardToggle } from '../components/leaderboards/LeaderboardToggle';
import { useLeaderboardView } from '../contexts/LeaderboardViewContext';
import { backendNameFor, type LeaderboardId } from '../types/leaderboards';
import { getSession } from '../services/api';
import type { SessionDetails, SessionPlay } from '../schemas/apiSchemas';

// Chart.js
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend, type TooltipItem } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// localStorage key for persisting PBs only filter
const PB_ONLY_LS_KEY = 'sessionPBsOnly';

/**
 * Format duration in milliseconds to a human-readable string
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

interface SessionHeaderProps {
  session: SessionDetails;
  onShare?: () => void;
  canShare?: boolean;
}

const SessionHeader: React.FC<SessionHeaderProps> = ({ session, onShare, canShare = false }) => {
  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body py-4">
        {/* User Info Header */}
        <div className="flex items-center gap-3 mb-4">
          <Link to={`/user/${session.userId}`}>
            <ProfileAvatar profileImageUrl={session.userProfileImageUrl} alias={session.userAlias} size="md" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              <Link to={`/user/${session.userId}`}>
                <h2 className="text-lg font-bold text-base-content truncate">{session.userAlias}</h2>
              </Link>
              {session.isOngoing && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/15 text-success text-xs font-semibold border border-success/40 shadow-sm animate-pulse">
                  <Activity className="w-3 h-3" />
                  <FormattedMessage defaultMessage="Live Session" id="injFaU" description="Badge indicating the session is currently active" />
                </span>
              )}
            </div>
          </div>
          {/* Share button - only shown with permission */}
          {canShare && onShare && (
            <button className="btn btn-primary btn-sm gap-1" onClick={onShare}>
              <Share2 size={16} />
              <FormattedMessage defaultMessage="Share" id="puPEAC" description="Share session button text" />
            </button>
          )}
        </div>

        {/* Session Time Info - Stacked on own lines */}
        <div className="p-3 bg-base-200/30 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-primary flex-shrink-0" />
            <div>
              <div className="text-xs text-base-content/60 uppercase tracking-wide">
                <FormattedMessage defaultMessage="Session Started" id="02FqeE" description="Label for session start time" />
              </div>
              <div className="text-sm font-semibold text-base-content">
                <FormattedDate value={session.startedAt} weekday="long" month="long" day="numeric" year="numeric" hour="numeric" minute="2-digit" />
              </div>
            </div>
          </div>
          {!session.isOngoing && (
            <div className="flex items-center gap-2">
              <Timer size={16} className="text-primary flex-shrink-0" />
              <div>
                <div className="text-xs text-base-content/60 uppercase tracking-wide">
                  <FormattedMessage defaultMessage="Duration" id="VPCWX3" description="Label for session duration" />
                </div>
                <div className="text-sm font-semibold text-base-content">{formatDuration(session.durationMs)}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Session Stats Row Component
interface SessionStatsProps {
  session: SessionDetails;
}

const SessionStats: React.FC<SessionStatsProps> = ({ session }) => {
  const hasPerfectScores = session.quads > 0 || session.quints > 0 || session.hexes > 0;

  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gradient-to-br from-primary/10 to-transparent rounded-lg">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Play size={16} className="text-primary" />
              <span className="text-sm font-medium text-base-content/80">
                <FormattedMessage defaultMessage="Plays" id="3LF9Yy" description="Label for total plays in session" />
              </span>
            </div>
            <span className="text-3xl font-bold text-base-content tabular-nums">
              <FormattedNumber value={session.playCount} />
            </span>
          </div>

          <div className="text-center p-4 bg-gradient-to-br from-secondary/10 to-transparent rounded-lg">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Hash size={16} className="text-secondary" />
              <span className="text-sm font-medium text-base-content/80">
                <FormattedMessage defaultMessage="Charts" id="8iqCJI" description="Label for distinct charts played in session" />
              </span>
            </div>
            <span className="text-3xl font-bold text-base-content tabular-nums">
              <FormattedNumber value={session.distinctCharts} />
            </span>
          </div>

          <div className="text-center p-4 bg-gradient-to-br from-accent/10 to-transparent rounded-lg">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Footprints size={16} className="text-accent" />
              <span className="text-sm font-medium text-base-content/80">
                <FormattedMessage defaultMessage="Steps Hit" id="HCJHu+" description="Label for steps hit in session" />
              </span>
            </div>
            <span className="text-3xl font-bold text-base-content tabular-nums">
              <FormattedNumber value={session.stepsHit} />
            </span>
          </div>

          <div className="text-center p-4 bg-gradient-to-br from-primary/10 to-transparent rounded-lg">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Timer size={16} className="text-primary" />
              <span className="text-sm font-medium text-base-content/80">
                <FormattedMessage defaultMessage="Duration" id="b+0PJw" description="Label for session duration in stats" />
              </span>
            </div>
            <span className="text-3xl font-bold text-base-content tabular-nums">{formatDuration(session.durationMs)}</span>
          </div>
        </div>

        {hasPerfectScores && (
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-base-content/10">
            {session.quads > 0 && (
              <div className="text-center p-3 bg-gradient-to-br from-primary/10 to-transparent rounded-lg">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <GradeImage grade="quad" className="w-5 h-5" />
                  <span className="text-sm font-medium text-base-content/80">
                    <FormattedMessage defaultMessage="Quads" id="ef3a2E" description="Label for quad count in session" />
                  </span>
                </div>
                <span className="text-2xl font-bold text-base-content tabular-nums">
                  <FormattedNumber value={session.quads} />
                </span>
              </div>
            )}
            {session.quints > 0 && (
              <div className="text-center p-3 bg-gradient-to-br from-secondary/10 to-transparent rounded-lg">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <GradeImage grade="quint" className="w-5 h-5" />
                  <span className="text-sm font-medium text-base-content/80">
                    <FormattedMessage defaultMessage="Quints" id="161pDN" description="Label for quint count in session" />
                  </span>
                </div>
                <span className="text-2xl font-bold text-base-content tabular-nums">
                  <FormattedNumber value={session.quints} />
                </span>
              </div>
            )}
            {session.hexes > 0 && (
              <div className="text-center p-3 bg-gradient-to-br from-accent/10 to-transparent rounded-lg">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <GradeImage grade="hex" className="w-5 h-5" />
                  <span className="text-sm font-medium text-base-content/80">
                    <FormattedMessage defaultMessage="Hexes" id="1IVbWS" description="Label for hex count in session" />
                  </span>
                </div>
                <span className="text-2xl font-bold text-base-content tabular-nums">
                  <FormattedNumber value={session.hexes} />
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Difficulty Distribution Chart Component
interface DifficultyDistributionChartProps {
  distribution: Array<{ meter: number; count: number }>;
}

const DifficultyDistributionChart: React.FC<DifficultyDistributionChartProps> = ({ distribution }) => {
  const { formatMessage } = useIntl();

  if (distribution.length === 0) {
    return null;
  }

  // Get color based on difficulty level
  const getDifficultyColor = (meter: number): string => {
    if (meter <= 5) return '#36d399'; // Easy - green
    if (meter <= 9) return '#3abff8'; // Medium - blue
    if (meter <= 12) return '#fbbd23'; // Hard - yellow
    if (meter <= 15) return '#f87272'; // Expert - red
    return '#d946ef'; // Challenge+ - purple
  };

  const data = {
    labels: distribution.map((d) => d.meter.toString()),
    datasets: [
      {
        data: distribution.map((d) => d.count),
        backgroundColor: distribution.map((d) => getDifficultyColor(d.meter)),
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        padding: 12,
        displayColors: false,
        callbacks: {
          title: () => '',
          label: (item: TooltipItem<'bar'>) =>
            formatMessage(
              { defaultMessage: '{count, plural, one {# play} other {# plays}}', id: 'AzxLjP', description: 'Tooltip showing play count' },
              { count: item.raw as number },
            ),
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } },
        title: {
          display: true,
          text: formatMessage({ defaultMessage: 'Difficulty', id: '51kB0H', description: 'X-axis label for difficulty chart' }),
          color: 'rgba(255, 255, 255, 0.6)',
          font: { size: 12 },
        },
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
        ticks: {
          color: 'rgba(255, 255, 255, 0.6)',
          font: { size: 11 },
          stepSize: 1,
        },
        title: {
          display: true,
          text: formatMessage({ defaultMessage: 'Plays', id: 'waqPQd', description: 'Y-axis label for difficulty chart' }),
          color: 'rgba(255, 255, 255, 0.6)',
          font: { size: 12 },
        },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body">
        <h3 className="card-title text-lg flex items-center gap-2 mb-4">
          <BarChart3 size={20} className="text-primary" />
          <FormattedMessage defaultMessage="Difficulty Distribution" id="y67Nsv" description="Title for the difficulty distribution chart" />
        </h3>
        <div className="h-36">
          <Bar data={data} options={options} />
        </div>
      </div>
    </div>
  );
};

// Top Packs Card Component
interface TopPacksCardProps {
  topPacks: SessionDetails['topPacks'];
}

const TopPacksCard: React.FC<TopPacksCardProps> = ({ topPacks }) => {
  if (topPacks.length === 0) {
    return null;
  }

  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body py-4">
        <h3 className="card-title text-lg flex items-center gap-2 mb-3">
          <Music size={20} className="text-primary" />
          <FormattedMessage defaultMessage="Top Packs Played" id="1RY6iM" description="Title for the top packs section in session details" />
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {topPacks.map((pack) => (
            <Link key={pack.packId} to={`/pack/${pack.packId}`} className="group flex flex-col items-center">
              <div className="relative w-full aspect-[2.56] rounded-lg overflow-hidden shadow-md group-hover:shadow-xl transition-shadow">
                <BannerImage
                  bannerVariants={pack.bannerVariants}
                  mdBannerUrl={pack.mdBannerUrl}
                  smBannerUrl={pack.smBannerUrl}
                  bannerUrl={pack.bannerUrl}
                  alt={pack.packName}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {/* Chart count badge */}
                <div className="absolute bottom-1 right-1 bg-black/70 px-1.5 py-0.5 rounded text-xs font-semibold text-white">{pack.chartCount}</div>
              </div>
              <span className="mt-1 text-xs font-medium text-base-content/80 text-center truncate w-full group-hover:text-primary transition-colors">
                {pack.packName}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

interface PlayCardProps {
  play: SessionPlay;
}

/**
 * Get the active leaderboard entry matching global preference
 */
function useActiveLeaderboard(play: SessionPlay, global: 'HardEX' | 'EX' | 'ITG') {
  return useMemo(() => {
    // Try to find an exact match using backend names
    const names = backendNameFor(global as LeaderboardId);
    for (const n of names) {
      const entry = play.leaderboards.find((lb) => lb.type === n || lb.type.toLowerCase().includes(n.toLowerCase()));
      if (entry) return entry;
    }

    // Fallback includes
    const short = global === 'ITG' ? 'Money' : global;
    const entry = play.leaderboards.find((lb) => lb.type.toLowerCase().includes(short.toLowerCase()));
    if (entry) return entry;

    // Last resort: first leaderboard
    return play.leaderboards[0] || null;
  }, [play, global]);
}

const PlayCard: React.FC<PlayCardProps> = ({ play }) => {
  const { formatMessage, formatNumber } = useIntl();
  const { activeLeaderboard } = useLeaderboardView();

  // Get leaderboard data based on active toggle
  const entry = useActiveLeaderboard(play, activeLeaderboard);
  const judgments = entry?.judgments || {};
  const hasJudgments = Object.keys(judgments).length > 0;

  const grade = entry?.grade;
  const score = entry?.score;
  const delta = entry?.delta;

  // Format delta for display
  const formatDelta = (d: number | null | undefined): { text: string; color: string } | null => {
    if (d === null || d === undefined) return null;
    const formatted = formatNumber(d / 100, { style: 'percent', maximumFractionDigits: 2, minimumFractionDigits: 2, signDisplay: 'always' });
    if (d > 0) return { text: formatted, color: '#36d399' }; // green
    if (d < 0) return { text: formatted, color: '#f87272' }; // red
    return { text: formatted, color: '#9ca3af' }; // gray for tie
  };

  const deltaDisplay = formatDelta(delta);

  return (
    <Link to={`/play/${play.id}`} className="block group">
      <div className="card bg-gradient-to-br from-base-200/80 to-base-300/60 backdrop-blur-sm shadow-md hover:shadow-xl transition-shadow overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Left side: Banner (70% width on desktop) with overlaid info */}
          <div className="relative md:w-[70%] flex-shrink-0 overflow-hidden">
            <BannerImage
              bannerVariants={play.chart.bannerVariants}
              mdBannerUrl={play.chart.mdBannerUrl}
              smBannerUrl={play.chart.smBannerUrl}
              bannerUrl={play.chart.bannerUrl}
              alt={`${play.chart.title} banner`}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              style={{ minHeight: '180px', aspectRatio: '2.56' }}
              loading="lazy"
            />
            {/* Gradient overlays for text readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/70" />

            {/* Chart name at top */}
            <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/40 to-transparent">
              <h3 className="font-bold text-lg text-white truncate drop-shadow-lg">
                {play.chart.title || formatMessage({ defaultMessage: 'Unknown', id: 'AW7bIo', description: 'Fallback text for unknown chart title' })}
              </h3>
              <p className="text-sm text-white/80 truncate drop-shadow-md">
                {play.chart.artist || formatMessage({ defaultMessage: 'Unknown Artist', id: 'gVeY2y', description: 'Fallback text for unknown chart artist' })}
              </p>
            </div>

            {/* Score at bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/40 to-transparent">
              <div className="flex items-center justify-between">
                {entry && (
                  <div className="flex items-center gap-3">
                    <GradeImage grade={grade || 'D'} className="h-12 w-auto object-contain drop-shadow-lg" />
                    <div>
                      <div
                        className="text-2xl font-extrabold tabular-nums drop-shadow-lg flex items-baseline gap-2"
                        style={{ color: activeLeaderboard === 'HardEX' ? '#FF69B4' : activeLeaderboard === 'EX' ? '#21CCE8' : '#FFFFFF' }}
                      >
                        {score ? (
                          <>
                            {formatNumber(parseFloat(score) / 100, { style: 'percent', maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                            {deltaDisplay && (
                              <span className="text-sm font-semibold" style={{ color: deltaDisplay.color }}>
                                {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx -- numeric delta not translatable */}
                                {`(${deltaDisplay.text})`}
                              </span>
                            )}
                          </>
                        ) : (
                          <FormattedMessage defaultMessage="N/A" id="H5m4gD" description="Score not available" />
                        )}
                      </div>
                      <div
                        className="text-xs uppercase tracking-wide font-semibold drop-shadow-md"
                        style={{ color: activeLeaderboard === 'HardEX' ? '#FF69B4' : activeLeaderboard === 'EX' ? '#21CCE8' : '#FFFFFF', opacity: 0.8 }}
                      >
                        {activeLeaderboard === 'HardEX' ? (
                          <FormattedMessage defaultMessage="H.EX" id="+t0i1m" description="Hard EX leaderboard abbreviation" />
                        ) : activeLeaderboard === 'EX' ? (
                          <FormattedMessage defaultMessage="EX" id="i0NYF+" description="EX leaderboard abbreviation" />
                        ) : (
                          <FormattedMessage defaultMessage="ITG" id="cSQcQe" description="ITG leaderboard abbreviation" />
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* Removed empty flex container - DifficultyChip now positioned absolutely */}
              </div>
            </div>
            {/* Difficulty chip at bottom-right of banner */}
            <div className="absolute bottom-2 right-2">
              <DifficultyChip stepsType={play.chart.stepsType} difficulty={play.chart.difficulty} meter={play.chart.meter} />
            </div>
          </div>

          {/* Right side: Judgments */}
          <div className="flex-1 flex flex-col justify-center min-w-0">
            {hasJudgments ? (
              <JudgmentList judgments={judgments} modifiers={play.modifiers} variant="compact" scoringSystem={activeLeaderboard} />
            ) : (
              <div className="flex items-center justify-center h-full p-3" style={{ backgroundColor: 'rgba(20, 20, 30, 0.95)' }}>
                <span className="text-base-content/50 text-sm uppercase tracking-wide">
                  <FormattedMessage defaultMessage="Chart Not Passed" id="wIu1Zm" description="Displayed when a chart has no judgment data available" />
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

export const SessionPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<SessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showOnlyPBs, setShowOnlyPBs] = useState(() => {
    try {
      return localStorage.getItem(PB_ONLY_LS_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const { activeLeaderboard } = useLeaderboardView();
  const canShare = true;

  // Persist showOnlyPBs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(PB_ONLY_LS_KEY, showOnlyPBs ? 'true' : 'false');
    } catch {}
  }, [showOnlyPBs]);

  const parsedSessionId = sessionId ? parseInt(sessionId, 10) : NaN;

  // Map frontend leaderboard names to backend API values
  const getBackendLeaderboard = (lb: string): 'EX' | 'ITG' | 'HardEX' => {
    if (lb === 'HardEX') return 'HardEX';
    if (lb === 'Money' || lb === 'ITG') return 'ITG';
    return 'EX';
  };

  useEffect(() => {
    if (Number.isNaN(parsedSessionId)) {
      setError('Invalid session ID');
      setLoading(false);
      return;
    }

    const fetchSession = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getSession(parsedSessionId, {
          page,
          limit: 5,
          pbOnly: showOnlyPBs,
          leaderboard: showOnlyPBs ? getBackendLeaderboard(activeLeaderboard) : undefined,
        });
        setSession(data);
      } catch (err) {
        console.error('Error fetching session:', err);
        setError('Failed to load session details');
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [parsedSessionId, page, showOnlyPBs, activeLeaderboard]);

  // Reset to page 1 when PB filter or leaderboard changes
  useEffect(() => {
    setPage(1);
  }, [showOnlyPBs, activeLeaderboard]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    // Scroll to plays section
    document.getElementById('plays-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  if (loading && !session) {
    return (
      <AppPageLayout accent="secondary">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppPageLayout>
    );
  }

  if (error || !session) {
    return (
      <AppPageLayout accent="secondary">
        <Alert variant="error">
          {error || <FormattedMessage defaultMessage="Session not found" id="Qhfqx5" description="Error message when session is not found" />}
        </Alert>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout accent="secondary">
      <div className="max-w-4xl mx-auto space-y-6 px-4">
        {/* Session Header and Difficulty Distribution - side by side on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SessionHeader session={session} onShare={() => setShowShareModal(true)} canShare={canShare} />
          {session.difficultyDistribution && session.difficultyDistribution.length > 0 && (
            <DifficultyDistributionChart distribution={session.difficultyDistribution} />
          )}
        </div>

        {/* Session Stats - full width row */}
        <SessionStats session={session} />

        {/* Top Packs Played - full width row */}
        {session.topPacks && session.topPacks.length > 0 && <TopPacksCard topPacks={session.topPacks} />}

        {/* Plays Section */}
        <div id="plays-section" className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
          <div className="card-body">
            {/* Header with toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h3 className="card-title text-lg flex items-center gap-2">
                <Music size={20} className="text-primary" />
                <FormattedMessage defaultMessage="Plays" id="tR3UGU" description="Title for the plays section" />
              </h3>
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-sm"
                    checked={showOnlyPBs}
                    onChange={(e) => setShowOnlyPBs(e.target.checked)}
                  />
                  <span className="text-sm">
                    <FormattedMessage defaultMessage="PBs Only" id="BkIenQ" description="Toggle to show only personal best plays" />
                  </span>
                </label>
                <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />
                <span className="text-sm text-base-content/60">
                  <FormattedMessage
                    defaultMessage="Showing {start}-{end} of {total}"
                    id="iPg/Z+"
                    description="Pagination info showing current range"
                    values={{
                      start: (page - 1) * session.pagination.limit + 1,
                      end: Math.min(page * session.pagination.limit, session.pagination.totalPlays),
                      total: session.pagination.totalPlays,
                    }}
                  />
                </span>
              </div>
            </div>

            {/* Play Cards */}
            <div className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : session.plays.length === 0 && showOnlyPBs ? (
                <div className="text-center py-8 text-base-content/60">
                  <Trophy size={32} className="mx-auto mb-2 text-warning/50" />
                  <FormattedMessage
                    defaultMessage="No PBs on this Leaderboard"
                    id="G6xjMl"
                    description="Message when no personal best plays match the filter"
                  />
                </div>
              ) : (
                session.plays.map((play) => <PlayCard key={play.id} play={play} />)
              )}
            </div>

            {/* Pagination */}
            <Pagination
              meta={
                {
                  page,
                  limit: session.pagination.limit,
                  total: session.pagination.totalPlays,
                  totalPages: session.pagination.totalPages,
                  hasNextPage: page < session.pagination.totalPages,
                  hasPreviousPage: page > 1,
                } as PaginationMeta
              }
              onPageChange={handlePageChange}
            />
          </div>
        </div>
      </div>

      {/* Session Share Modal - only rendered with permission */}
      {canShare && <SessionShareModal sessionId={session.id} isOpen={showShareModal} onClose={() => setShowShareModal(false)} />}
    </AppPageLayout>
  );
};

export default SessionPage;
