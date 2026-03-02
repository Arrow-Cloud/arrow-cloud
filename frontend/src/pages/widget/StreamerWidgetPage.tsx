import React, { useState, useEffect } from 'react';
import { ProfileAvatar, GradeImage } from '../../components';
import { BannerImage } from '../../components/ui/BannerImage';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';
import { Swords } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { getWidgetData } from '../../services/api';
import type { WidgetDataResponse } from '../../schemas/apiSchemas';
import { useWebSocket } from '../../hooks/useWebSocket';

interface UserStats {
  rank: number;
  totalPoints: number;
  chartsPlayed: number;
  totalParticipants: number;
}

interface LeaderboardEntry {
  rank: number;
  alias: string;
  points: number;
  profileImageUrl: string | null;
  isSelf?: boolean;
  isRival?: boolean;
}

interface LeaderboardData {
  stats: UserStats;
  entries: LeaderboardEntry[];
}

type LeaderboardMode = 'HardEX' | 'EX' | 'ITG';

export const StreamerWidgetPage: React.FC = () => {
  const { formatNumber, formatMessage } = useIntl();
  const [searchParams] = useSearchParams();
  const [scrollIndex, setScrollIndex] = useState(0);
  const [scrollDirection, setScrollDirection] = useState<'down' | 'up'>('down');
  const [widgetData, setWidgetData] = useState<WidgetDataResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Get parameters from URL
  const userIdParam = searchParams.get('userId');
  const themeParam = searchParams.get('theme');
  const leaderboardsParam = searchParams.get('leaderboards');
  const delayParam = searchParams.get('delay');
  const featuresParam = searchParams.get('features');
  const compatMode = searchParams.get('compat') === 'true';

  // Parse features from comma-separated string
  const enabledFeatures = featuresParam ? featuresParam.split(',') : ['main', 'leaderboard', 'lastPlayed'];
  const showLeaderboard = enabledFeatures.includes('leaderboard');
  const showLastPlayed = enabledFeatures.includes('lastPlayed');

  // Calculate dynamic width based on enabled features
  const baseWidth = 235; // Main info section
  const leaderboardWidth = showLeaderboard ? 290 : 0;
  const lastPlayedWidth = showLastPlayed ? 235 : 0;
  const totalWidth = baseWidth + leaderboardWidth + lastPlayedWidth;

  // Parse leaderboards from comma-separated string, default to all three
  const availableLeaderboards: LeaderboardMode[] = leaderboardsParam
    ? (leaderboardsParam.split(',').filter((lb) => ['HardEX', 'EX', 'ITG'].includes(lb)) as LeaderboardMode[])
    : ['HardEX', 'EX', 'ITG'];

  // Parse rotation delay (in seconds), default to 30s, clamp between 10-120
  const rotationDelay = Math.max(10, Math.min(120, Number(delayParam) || 30)) * 1000; // Convert to ms

  const [currentLeaderboardIndex, setCurrentLeaderboardIndex] = useState(0);
  const leaderboard = availableLeaderboards[currentLeaderboardIndex];

  // WebSocket connection for real-time updates
  const WS_URL = (import.meta as any).env?.VITE_WEBSOCKET_URL || '';
  const {
    isConnected: wsConnected,
    lastMessage,
    error: wsError,
  } = useWebSocket({
    url: WS_URL,
    userId: userIdParam || undefined,
    autoConnect: true,
  });

  // Log WebSocket state changes
  useEffect(() => {
    console.log('[Widget] WebSocket connection state:', {
      isConnected: wsConnected,
      url: WS_URL,
      hasError: !!wsError,
    });
  }, [wsConnected, wsError, WS_URL]);

  // Fetch widget data on mount
  useEffect(() => {
    const fetchData = async () => {
      if (!userIdParam) {
        setLoading(false);
        return;
      }

      try {
        const data = await getWidgetData(userIdParam, featuresParam || undefined);
        setWidgetData(data);
      } catch (error) {
        console.error('Failed to fetch widget data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userIdParam, featuresParam]);

  // Handle WebSocket messages and refresh data
  useEffect(() => {
    if (!lastMessage || !userIdParam) return;

    console.log('[Widget] WebSocket message received:', lastMessage);

    // Handle refresh notifications
    if (lastMessage.type === 'refresh' || lastMessage.type === 'widgetUpdate') {
      // Check if this message is for our userId
      const messageUserId = lastMessage.userId;
      if (!messageUserId || messageUserId === userIdParam) {
        console.log('[Widget] Refresh triggered by WebSocket message');

        // Refresh widget data
        getWidgetData(userIdParam, featuresParam || undefined)
          .then((data) => {
            setWidgetData(data);
            console.log('[Widget] Data refreshed successfully');
          })
          .catch((error) => {
            console.error('[Widget] Failed to refresh data:', error);
          });
      }
    }
  }, [lastMessage, userIdParam, featuresParam]);

  // Get data for current leaderboard
  const currentData: LeaderboardData | null = widgetData?.leaderboards?.[leaderboard] || null;
  const stats = currentData?.stats;

  // Map API entries to component format
  const leaderboardWithUser =
    currentData?.entries.map((entry) => ({
      rank: entry.rank,
      alias: entry.alias,
      points: entry.points,
      profileImageUrl: entry.profileImageUrl,
      isSelf: entry.isSelf,
      isRival: entry.isRival,
    })) || [];

  // Calculate how many entries fit in the visible area (approximately 5 entries)
  const visibleEntries = 5;
  const maxScrollIndex = Math.max(0, leaderboardWithUser.length - visibleEntries);

  // Reset scroll when leaderboard changes
  useEffect(() => {
    setScrollIndex(0);
    setScrollDirection('down');
  }, [leaderboard]);

  // Apply theme from query parameter
  useEffect(() => {
    if (compatMode) {
      // Compatibility mode: use hardcoded fallback colors (no OKLCH)
      // Override all color-related CSS variables with hex values
      const style = document.createElement('style');
      style.id = 'compat-mode-colors';
      style.textContent = `
        * {
          --primary: 59 130 246 !important;
          --primary-content: 255 255 255 !important;
          --accent: 245 158 11 !important;
          --accent-content: 255 255 255 !important;
          --base-100: 31 41 55 !important;
          --base-200: 17 24 39 !important;
          --base-300: 15 23 42 !important;
          --base-content: 229 231 235 !important;
          --success: 16 185 129 !important;
          --error: 239 68 68 !important;
        }
        
        /* Override any Tailwind color utilities to use RGB */
        .bg-primary { background-color: rgb(59 130 246) !important; }
        .text-primary { color: rgb(59 130 246) !important; }
        .bg-accent { background-color: rgb(245 158 11) !important; }
        .text-accent { color: rgb(245 158 11) !important; }
        .bg-base-100 { background-color: rgb(31 41 55) !important; }
        .bg-base-200 { background-color: rgb(17 24 39) !important; }
        .bg-base-300 { background-color: rgb(15 23 42) !important; }
        .text-base-content { color: rgb(229 231 235) !important; }
        .border-base-content { border-color: rgb(229 231 235) !important; }
        
        /* Opacity variants */
        .bg-primary\\/5 { background-color: rgba(59, 130, 246, 0.05) !important; }
        .bg-primary\\/10 { background-color: rgba(59, 130, 246, 0.1) !important; }
        .bg-primary\\/20 { background-color: rgba(59, 130, 246, 0.2) !important; }
        .bg-accent\\/5 { background-color: rgba(245, 158, 11, 0.05) !important; }
        .bg-accent\\/10 { background-color: rgba(245, 158, 11, 0.1) !important; }
        .bg-accent\\/20 { background-color: rgba(245, 158, 11, 0.2) !important; }
        .bg-base-200\\/50 { background-color: rgba(17, 24, 39, 0.5) !important; }
        .bg-base-300\\/30 { background-color: rgba(15, 23, 42, 0.3) !important; }
        .text-base-content\\/40 { color: rgba(229, 231, 235, 0.4) !important; }
        .text-base-content\\/50 { color: rgba(229, 231, 235, 0.5) !important; }
        .text-base-content\\/60 { color: rgba(229, 231, 235, 0.6) !important; }
        .text-base-content\\/70 { color: rgba(229, 231, 235, 0.7) !important; }
        .text-base-content\\/80 { color: rgba(229, 231, 235, 0.8) !important; }
        .border-base-content\\/10 { border-color: rgba(229, 231, 235, 0.1) !important; }
        .border-primary\\/40 { border-color: rgba(59, 130, 246, 0.4) !important; }
        .border-accent\\/30 { border-color: rgba(245, 158, 11, 0.3) !important; }
        
        /* Gradients */
        .from-base-200 { --tw-gradient-from: rgb(17 24 39) !important; }
        .via-base-300 { --tw-gradient-via: rgb(15 23 42) !important; }
        .to-base-200 { --tw-gradient-to: rgb(17 24 39) !important; }
        .from-primary\\/5 { --tw-gradient-from: rgba(59, 130, 246, 0.05) !important; }
        .to-accent\\/5 { --tw-gradient-to: rgba(245, 158, 11, 0.05) !important; }
        .via-primary\\/50 { --tw-gradient-via: rgba(59, 130, 246, 0.5) !important; }
        .via-accent\\/50 { --tw-gradient-via: rgba(245, 158, 11, 0.5) !important; }
        
        /* Shadows */
        .shadow-primary\\/20 { --tw-shadow-color: rgba(59, 130, 246, 0.2) !important; }
        .shadow-primary\\/50 { --tw-shadow-color: rgba(59, 130, 246, 0.5) !important; }
        .shadow-accent\\/10 { --tw-shadow-color: rgba(245, 158, 11, 0.1) !important; }
        .shadow-success\\/50 { --tw-shadow-color: rgba(16, 185, 129, 0.5) !important; }
        .shadow-error\\/50 { --tw-shadow-color: rgba(239, 68, 68, 0.5) !important; }
        
        /* Badge variants */
        .badge-primary { background-color: rgb(59 130 246) !important; color: rgb(255 255 255) !important; }
        .badge-ghost { background-color: rgba(229, 231, 235, 0.1) !important; }
        
        /* Success/Error states */
        .bg-success { background-color: rgb(16 185 129) !important; }
        .bg-error { background-color: rgb(239 68 68) !important; }
        
        /* Improve leaderboard text readability for non-self/rival entries */
        .text-base { color: rgb(229 231 235) !important; }
        .text-base-content\\/70 { color: rgba(229, 231, 235, 0.9) !important; }
      `;
      document.head.appendChild(style);

      // Remove data-theme attribute when in compat mode
      document.documentElement.removeAttribute('data-theme');

      return () => {
        const styleElement = document.getElementById('compat-mode-colors');
        if (styleElement) {
          styleElement.remove();
        }
      };
    } else {
      const theme = themeParam || 'arrow-blue'; // Default to arrow-blue if no theme specified
      document.documentElement.setAttribute('data-theme', theme);
    }

    // Set body background to transparent for OBS
    document.body.style.backgroundColor = 'transparent';
    document.documentElement.style.backgroundColor = 'transparent';

    // Cleanup: reset when component unmounts
    return () => {
      document.body.style.backgroundColor = '';
      document.documentElement.style.backgroundColor = '';
    };
  }, [themeParam, compatMode]);

  // Auto-rotate leaderboard based on rotation delay
  useEffect(() => {
    if (availableLeaderboards.length <= 1) return; // No rotation needed if only one leaderboard

    const interval = setInterval(() => {
      setCurrentLeaderboardIndex((prev) => (prev + 1) % availableLeaderboards.length);
    }, rotationDelay);

    return () => clearInterval(interval);
  }, [availableLeaderboards.length, rotationDelay]);

  // Auto-scroll leaderboard - oscillate between top and bottom
  useEffect(() => {
    const interval = setInterval(() => {
      setScrollIndex((prev) => {
        if (scrollDirection === 'down') {
          if (prev >= maxScrollIndex) {
            setScrollDirection('up');
            return prev;
          }
          return prev + 1;
        } else {
          if (prev <= 0) {
            setScrollDirection('down');
            return prev;
          }
          return prev - 1;
        }
      });
    }, 2500);

    return () => clearInterval(interval);
  }, [scrollDirection, maxScrollIndex]);

  if (loading) {
    return (
      <div className="w-full h-screen bg-base-100 flex items-center justify-center p-4">
        <div style={{ width: `${totalWidth}px`, height: '300px' }} className="bg-base-200 flex items-center justify-center">
          <div className="loading loading-spinner loading-lg text-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex items-center justify-center p-0">
      <div
        style={{ width: `${totalWidth}px`, height: '300px' }}
        className="bg-gradient-to-br from-base-200 via-base-300 to-base-200 shadow-2xl overflow-hidden relative flex"
      >
        {/* Animated gradient overlays for visual interest */}
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

        {/* Left Side - User Info & Stats */}
        <div className="w-[235px] flex flex-col p-4 relative z-10">
          {/* Top - Blue Shift Logo and Leaderboard Badges */}
          <div className="mb-auto">
            {/* Blue Shift Logo */}
            <div className="mb-3 relative">
              <div className="absolute inset-0 bg-primary/10 blur-2xl" />
              <img
                src="https://assets.arrowcloud.dance/logos/20250725/blue shift-t big.png"
                alt={formatMessage({ defaultMessage: 'Blue Shift', id: 'r2gihF', description: 'Alt text for Blue Shift logo' })}
                className="h-10 object-contain opacity-90 relative drop-shadow-lg"
              />
            </div>

            {/* Leaderboard Mode Indicator */}
            <motion.div className="flex gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
              {availableLeaderboards.includes('HardEX') && (
                <motion.div
                  className={`badge ${leaderboard === 'HardEX' ? 'badge-primary shadow-lg shadow-primary/50' : 'badge-ghost'} badge-sm`}
                  animate={{ scale: leaderboard === 'HardEX' ? 1.25 : 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <FormattedMessage defaultMessage="H.EX" description="Abbreviation for Hard EX leaderboard mode" id="T3ze71" />
                </motion.div>
              )}
              {availableLeaderboards.includes('EX') && (
                <motion.div
                  className={`badge ${leaderboard === 'EX' ? 'badge-primary shadow-lg shadow-primary/50' : 'badge-ghost'} badge-sm`}
                  animate={{ scale: leaderboard === 'EX' ? 1.25 : 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <FormattedMessage defaultMessage="EX" description="Abbreviation for EX leaderboard mode" id="SpD64Q" />
                </motion.div>
              )}
              {availableLeaderboards.includes('ITG') && (
                <motion.div
                  className={`badge ${leaderboard === 'ITG' ? 'badge-primary shadow-lg shadow-primary/50' : 'badge-ghost'} badge-sm`}
                  animate={{ scale: leaderboard === 'ITG' ? 1.25 : 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <FormattedMessage defaultMessage="ITG" description="Abbreviation for ITG leaderboard mode" id="UhnD7Q" />
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* Bottom - Avatar, Username, and Stats */}
          <div className="mt-auto">
            {/* Avatar & Username */}
            <div className="flex items-center gap-3 mb-3">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
                <ProfileAvatar alias={widgetData?.user.alias || 'Player'} profileImageUrl={widgetData?.user.profileImageUrl || null} size="lg" />
              </div>
              <div>
                <div className="text-xl font-bold text-primary drop-shadow-lg">{widgetData?.user.alias}</div>
              </div>
            </div>

            {/* Points and Rank */}
            {stats && stats.rank > 0 ? (
              <div className="space-y-1">
                <motion.div
                  key={`rank-${leaderboard}`}
                  initial={{ x: -50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.3, ease: 'easeInOut', delay: 0 }}
                  className="flex items-baseline gap-2"
                >
                  <span className="text-3xl font-bold text-accent drop-shadow-[0_0_10px_rgba(var(--accent),0.5)]">
                    <FormattedMessage
                      defaultMessage="#{rank,number}"
                      id="tn3SH1"
                      description="stat indicating a user's overall rank in an event"
                      values={{ rank: stats.rank }}
                    />
                  </span>
                  <span className="text-md text-base-content/60">
                    <FormattedMessage
                      defaultMessage="of {total,number}"
                      id="vQNNhl"
                      description="stat indicating total number of participants in an event"
                      values={{ total: stats.totalParticipants }}
                    />
                  </span>
                </motion.div>
                <motion.div
                  key={`points-${leaderboard}`}
                  initial={{ x: -50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.3, ease: 'easeInOut', delay: 0.1 }}
                  className="flex items-baseline gap-2"
                >
                  <span className="text-2xl font-bold text-primary drop-shadow-[0_0_10px_rgba(var(--primary),0.5)]">{formatNumber(stats.totalPoints)}</span>
                  <span className="text-sm text-base-content/60">
                    <FormattedMessage defaultMessage="points" id="DYk76o" description="Label for points stat" />
                  </span>
                </motion.div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="text-sm text-base-content/60">
                  <FormattedMessage defaultMessage="No scores yet" id="By9s2f" description="Message shown when user has no scores in the event" />
                </div>
                <div className="text-xs text-base-content/40 mt-1">
                  <FormattedMessage defaultMessage="Play some songs to get started!" id="mvXRqN" description="Hint shown when user has no scores" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Leaderboard */}
        {showLeaderboard && (
          <div className="w-[290px] bg-base-300/30 backdrop-blur-sm p-4 flex flex-col relative z-10 border-l border-base-content/10">
            <div className="flex-1 overflow-hidden relative">
              <motion.div
                key={`leaderboard-${leaderboard}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <motion.div animate={{ y: -scrollIndex * 54 }} transition={{ type: 'spring', stiffness: 100, damping: 20, mass: 0.5 }} className="space-y-2">
                  {leaderboardWithUser
                    .filter((entry) => scrollIndex <= 10 || entry.isSelf || entry.isRival)
                    .map((entry) => (
                      <div
                        key={entry.rank}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded transition-all ${
                          entry.isSelf
                            ? 'bg-primary/20 border border-primary/40 shadow-lg shadow-primary/20'
                            : entry.isRival
                              ? 'bg-accent/10 border border-accent/30 shadow-md shadow-accent/10'
                              : 'bg-base-200/50'
                        }`}
                      >
                        {/* Rank */}
                        <div className={`text-lg font-bold w-10 ${entry.isSelf ? 'text-primary' : entry.isRival ? 'text-accent' : 'text-base-content/60'}`}>
                          <FormattedMessage
                            defaultMessage="#{rank,number}"
                            id="tn3SH1"
                            description="stat indicating a user's overall rank in an event"
                            values={{ rank: entry.rank }}
                          />
                        </div>

                        {/* Avatar */}
                        <div className="relative">
                          {(entry.isSelf || entry.isRival) && (
                            <div className={`absolute inset-0 ${entry.isSelf ? 'bg-primary/20' : 'bg-accent/20'} rounded-full blur-md`} />
                          )}
                          <ProfileAvatar alias={entry.alias} profileImageUrl={entry.profileImageUrl} size="sm" />
                        </div>

                        {/* Name with Rival Icon */}
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <div className={`text-base truncate ${entry.isSelf ? 'font-bold text-primary' : entry.isRival ? 'text-accent' : ''}`}>
                            {entry.alias}
                          </div>
                          {entry.isRival && <Swords className="w-3 h-3 text-accent flex-shrink-0 drop-shadow-[0_0_4px_rgba(var(--accent),0.8)]" />}
                        </div>

                        {/* Points */}
                        <div className="text-base font-medium text-base-content/70">{formatNumber(entry.points)}</div>
                      </div>
                    ))}
                </motion.div>
              </motion.div>
            </div>
          </div>
        )}

        {/* Last Played Song */}
        {showLastPlayed && widgetData?.lastPlayed && (
          <div className="w-[235px] bg-base-300/30 backdrop-blur-sm p-4 flex flex-col relative z-10 border-l border-base-content/10">
            <div className="text-xs font-bold text-base-content/70 mb-2 uppercase tracking-wide">
              <FormattedMessage defaultMessage="Last Played" id="pB9pg4" description="Label for the last played song section" />
            </div>

            <div className="flex-1 flex flex-col gap-2">
              {/* Banner */}
              <div className="relative">
                <BannerImage
                  bannerVariants={widgetData.lastPlayed.chart.bannerVariants}
                  mdBannerUrl={widgetData.lastPlayed.chart.mdBannerUrl}
                  smBannerUrl={widgetData.lastPlayed.chart.smBannerUrl}
                  bannerUrl={widgetData.lastPlayed.chart.bannerUrl}
                  alt={widgetData.lastPlayed.chart.title}
                  className="w-full rounded shadow-lg object-cover"
                  style={{ aspectRatio: '2.56' }}
                  loading="eager"
                  sizePreference="responsive"
                />
              </div>

              {/* Song Info */}
              <div className="space-y-1">
                <div className="text-base font-bold text-base-content truncate">{widgetData.lastPlayed.chart.title}</div>
              </div>

              {/* Last Play Score */}
              <div className="mt-auto space-y-1.5">
                <div className="flex items-center gap-2">
                  <GradeImage grade={widgetData.lastPlayed.scores[leaderboard].lastScore.grade} className="h-7 w-auto drop-shadow-lg" />
                  <motion.div
                    key={`last-score-${leaderboard}`}
                    initial={{ x: -50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.3, ease: 'easeInOut', delay: 0 }}
                  >
                    <span className="text-xl font-bold text-primary drop-shadow-[0_0_10px_rgba(var(--primary),0.5)]">
                      <FormattedNumber
                        value={widgetData.lastPlayed.scores[leaderboard].lastScore.score / 100}
                        style="percent"
                        minimumFractionDigits={2}
                        maximumFractionDigits={2}
                      />
                    </span>
                  </motion.div>
                </div>

                {/* Personal Best Score */}
                <div className="border-t border-base-content/10 pt-1.5 mt-1.5">
                  <div className="text-[10px] font-semibold text-base-content/50 uppercase tracking-wider mb-0">
                    <FormattedMessage defaultMessage="Personal Best" id="+pLe/x" description="Label for the user's best score on this chart" />
                  </div>
                  <motion.div
                    key={`pb-rank-${leaderboard}`}
                    initial={{ x: -50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.3, ease: 'easeInOut', delay: 0.05 }}
                    className="flex items-baseline gap-1.5 mb-1"
                  >
                    <span className="text-2xl font-bold text-accent drop-shadow-[0_0_10px_rgba(var(--accent),0.5)]">
                      <FormattedMessage
                        defaultMessage="#{rank}"
                        id="QIi1Qb"
                        description="Rank of the player on the chart"
                        values={{ rank: widgetData.lastPlayed.scores[leaderboard].pbScore.rank }}
                      />
                    </span>
                    <span className="text-sm text-base-content/50">
                      <FormattedMessage
                        defaultMessage="of {total,number}"
                        id="vQNNhl"
                        description="stat indicating total number of participants in an event"
                        values={{ total: widgetData.lastPlayed.scores[leaderboard].pbScore.totalPlayers }}
                      />
                    </span>
                  </motion.div>
                  <div className="flex items-center gap-2">
                    <GradeImage grade={widgetData.lastPlayed.scores[leaderboard].pbScore.grade} className="h-7 w-auto drop-shadow-lg" />
                    <motion.div
                      key={`pb-score-${leaderboard}`}
                      initial={{ x: -50, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ duration: 0.3, ease: 'easeInOut', delay: 0.1 }}
                    >
                      <span className="text-xl font-bold text-primary drop-shadow-[0_0_10px_rgba(var(--primary),0.5)]">
                        <FormattedNumber
                          value={widgetData.lastPlayed.scores[leaderboard].pbScore.score / 100}
                          style="percent"
                          minimumFractionDigits={2}
                          maximumFractionDigits={2}
                        />
                      </span>
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Connection Status Indicator */}
        <div className="absolute top-2 right-2 z-20">
          <div
            className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-success shadow-lg shadow-success/50' : 'bg-error shadow-lg shadow-error/50'} animate-pulse`}
          />
        </div>
      </div>
    </div>
  );
};
