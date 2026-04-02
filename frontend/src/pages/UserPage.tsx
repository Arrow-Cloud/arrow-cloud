import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Calendar, Music, Loader2, Globe, Swords, User as UserIcon, BarChart3, Play, Hash, Footprints } from 'lucide-react';
import { AppPageLayout, Alert, GradeImage, DifficultyChip, ProfileAvatar, Pagination, TrophyCase, ActivityHeatmap } from '../components';
import type { Trophy as TrophyType, TrophyTier } from '../components';
import { LeaderboardToggle } from '../components/leaderboards/LeaderboardToggle';
import { useLeaderboardView } from '../contexts/LeaderboardViewContext';
import { getUserById, addRival as apiAddRival, deleteRival as apiDeleteRival, banUser as apiBanUser } from '../services/api';
import { UserProfile, UserRecentPlay, type UserRecentPlaysMeta } from '../schemas/apiSchemas';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../contexts/AuthContext';
import { BannerImage } from '../components/ui';
import { FormattedDate, FormattedMessage, useIntl } from 'react-intl';

interface UserMetadataCardProps {
  user: UserProfile;
  isRival?: boolean;
  isSelf?: boolean;
  canManageRival?: boolean;
  canBanUser?: boolean;
  actionLoading?: boolean;
  onAddRival?: () => void;
  onRemoveRival?: () => void;
  onBanUser?: () => void;
}

const UserMetadataCard: React.FC<UserMetadataCardProps> = ({
  user,
  isRival,
  isSelf,
  canManageRival,
  canBanUser,
  actionLoading,
  onAddRival,
  onRemoveRival,
  onBanUser,
}) => {
  const { formatDisplayName } = useIntl();
  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body">
        {/* Profile Header */}
        <div className="flex items-center gap-4 mb-6">
          {/* Avatar */}
          <ProfileAvatar profileImageUrl={user.profileImageUrl} alias={user.alias} size="xl" />
          {/* User Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              <h2 className="text-2xl font-bold text-base-content truncate">{user.alias}</h2>
              {isSelf && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/15 text-success text-xs font-semibold border border-success/40 shadow-sm">
                  <FormattedMessage
                    defaultMessage="{userIcon} You"
                    values={{ userIcon: <UserIcon className="w-3.5 h-3.5" /> }}
                    id="43jzOu"
                    description="displayed as a small chip next to the user on the user page to indicate it is the user currently logged in"
                  />
                </span>
              )}
              {!isSelf && isRival && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error/15 text-error text-xs font-semibold border border-error/40 shadow-sm">
                  <FormattedMessage
                    defaultMessage="{swordIcon} Rival"
                    values={{ swordIcon: <Swords className="w-3.5 h-3.5" /> }}
                    id="P/vx2w"
                    description="displayed as a small chip next to the user on the user page to indicate it is someone added as a rival of the current user"
                  />
                </span>
              )}
              {/* Rival Actions */}
              {canManageRival &&
                !isSelf &&
                (isRival ? (
                  <button className="btn btn-ghost btn-xs text-error hover:bg-error/10" onClick={onRemoveRival} disabled={actionLoading}>
                    <FormattedMessage
                      defaultMessage="Remove Rival"
                      id="PP8AC8"
                      description="text on a button that is used to remove a user from your list of rivals"
                    />
                  </button>
                ) : (
                  <button className="btn btn-primary btn-xs" onClick={onAddRival} disabled={actionLoading}>
                    <FormattedMessage defaultMessage="Add Rival" id="acZVz2" description="text on a button that is used to add a user to your list of rivals" />
                  </button>
                ))}
              {/* Ban User Action */}
              {canBanUser && !isSelf && (
                <button className="btn btn-error btn-xs" onClick={onBanUser} disabled={actionLoading}>
                  <FormattedMessage defaultMessage="Ban User" id="MJfqi+" description="text on a button to ban a user from the platform" />
                </button>
              )}
            </div>
            <p className="text-sm text-base-content/60">
              <FormattedMessage defaultMessage="User Profile" id="Jyhkfl" description="sub-text under the username on the user profile page" />
            </p>
          </div>
        </div>

        {/* Profile Details */}
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3 p-3 bg-base-200/30 rounded-lg">
            <Calendar size={16} className="text-base-content/60 flex-shrink-0" />
            <div>
              <div className="text-xs text-base-content/60 uppercase tracking-wide">
                <FormattedMessage defaultMessage="Member Since" id="G9kRa2" description="label for the user profile field displaying their registration date" />
              </div>
              <div className="font-medium text-base-content">
                <FormattedDate value={user.createdAt} month="long" day="numeric" year="numeric" />
              </div>
            </div>
          </div>

          {user.country && (
            <div className="flex items-center gap-3 p-3 bg-base-200/30 rounded-lg">
              <Globe size={16} className="text-base-content/60 flex-shrink-0" />
              <div>
                <div className="text-xs text-base-content/60 uppercase tracking-wide">
                  <FormattedMessage defaultMessage="Country" id="+FgcFw" description="label for the user profile field displaying their country" />
                </div>
                <div className="font-medium text-base-content flex items-center gap-2">
                  <span>{formatDisplayName(user.country.code, { type: 'region' })}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stats Section */}
        {user.stats?.totalPlays !== undefined && (
          <div className="mt-6 pt-6 border-t border-base-content/10">
            <h3 className="text-sm font-semibold text-base-content/70 uppercase tracking-wider mb-4 flex items-center gap-2">
              <BarChart3 size={18} className="text-primary" />
              <FormattedMessage defaultMessage="Statistics" id="NsHg0w" description="heading for the user statistics section" />
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 to-transparent rounded-lg border-l-4 border-primary">
                <span className="text-sm font-medium text-base-content/80 flex items-center gap-2">
                  <Play size={16} className="text-primary" />
                  <FormattedMessage defaultMessage="Total Plays" id="SyigeG" description="label for the user profile field displaying their total play count" />
                </span>
                <span className="text-2xl font-bold text-base-content tabular-nums">{user.stats.totalPlays.toLocaleString()}</span>
              </div>
              {user.stats.chartsPlayed !== undefined && (
                <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 to-transparent rounded-lg border-l-4 border-primary">
                  <span className="text-sm font-medium text-base-content/80 flex items-center gap-2">
                    <Hash size={16} className="text-primary" />
                    <FormattedMessage
                      defaultMessage="Charts Played"
                      id="mb1qgo"
                      description="label for the user profile field displaying the number of unique charts they have played"
                    />
                  </span>
                  <span className="text-2xl font-bold text-base-content tabular-nums">{user.stats.chartsPlayed.toLocaleString()}</span>
                </div>
              )}
              {user.stats.stepsHit !== undefined && (
                <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 to-transparent rounded-lg border-l-4 border-primary">
                  <span className="text-sm font-medium text-base-content/80 flex items-center gap-2">
                    <Footprints size={16} className="text-primary" />
                    <FormattedMessage
                      defaultMessage="Steps Hit"
                      id="gzpqYg"
                      description="label for the user profile field displaying the number of steps (arrows) they have hit"
                    />
                  </span>
                  <span className="text-2xl font-bold text-base-content tabular-nums">{user.stats.stepsHit.toLocaleString()}</span>
                </div>
              )}
              {user.stats.quads !== undefined && user.stats.quads > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 to-transparent rounded-lg border-l-4 border-primary">
                  <span className="text-sm font-medium text-base-content/80 flex items-center gap-2">
                    <GradeImage grade="quad" className="w-5 h-5" />
                    <FormattedMessage
                      defaultMessage="Quads"
                      id="Bg/ALb"
                      description="label for the user profile field displaying their number of quad star scores (100% ITG)"
                    />
                  </span>
                  <span className="text-2xl font-bold text-base-content tabular-nums">{user.stats.quads.toLocaleString()}</span>
                </div>
              )}
              {user.stats.quints !== undefined && user.stats.quints > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 to-transparent rounded-lg border-l-4 border-primary">
                  <span className="text-sm font-medium text-base-content/80 flex items-center gap-2">
                    <GradeImage grade="quint" className="w-5 h-5" />
                    <FormattedMessage
                      defaultMessage="Quints"
                      id="40dwCc"
                      description="label for the user profile field displaying their number of quint star scores (100% EX)"
                    />
                  </span>
                  <span className="text-2xl font-bold text-base-content tabular-nums">{user.stats.quints.toLocaleString()}</span>
                </div>
              )}
              {user.stats.hexes !== undefined && user.stats.hexes > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 to-transparent rounded-lg border-l-4 border-primary">
                  <span className="text-sm font-medium text-base-content/80 flex items-center gap-2">
                    <GradeImage grade="hex" className="w-5 h-5" />
                    <FormattedMessage
                      defaultMessage="Hexes"
                      id="HQoABI"
                      description="label for the user profile field displaying their number of hex star scores (100% H.EX)"
                    />
                  </span>
                  <span className="text-2xl font-bold text-base-content tabular-nums">{user.stats.hexes.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Activity Heatmap */}
        {user.stats?.heatMap && Object.keys(user.stats.heatMap).length > 0 && (
          <div className="mt-6 pt-6 border-t border-base-content/10">
            <h3 className="text-sm font-semibold text-base-content/70 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Calendar size={18} className="text-primary" />
              <FormattedMessage defaultMessage="Activity" id="vqkjSf" description="heading for the user activity heatmap section" />
            </h3>
            <div className="relative">
              <ActivityHeatmap heatMap={user.stats.heatMap} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface ChartDisplayProps {
  chart: UserRecentPlay['chart'];
}

const ChartDisplay: React.FC<ChartDisplayProps> = ({ chart }) => {
  return (
    <Link to={`/chart/${chart.hash}`} className="block hover:bg-base-100/20 -m-2 p-2 rounded transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <BannerImage
          bannerVariants={chart.bannerVariants}
          mdBannerUrl={chart.mdBannerUrl}
          smBannerUrl={chart.smBannerUrl}
          bannerUrl={chart.bannerUrl}
          alt={`${chart.title} banner`}
          className="rounded-lg shadow-lg w-[128px]"
          style={{ aspectRatio: '2.56' }}
          loading="eager"
        />
        <div className="flex-1">
          <div className="font-medium text-base-content">{chart.title}</div>
          <div className="text-sm text-base-content/60">{chart.artist}</div>
          <div className="flex items-center gap-2 mt-1">
            <DifficultyChip stepsType={chart.stepsType} difficulty={chart.difficulty} meter={chart.meter} size="sm" />
          </div>
        </div>
      </div>
    </Link>
  );
};

interface TrophyCaseSectionProps {
  trophies?: UserProfile['trophies'];
  showManageButton?: boolean;
}

const TrophyCaseSection: React.FC<TrophyCaseSectionProps> = ({ trophies = [], showManageButton = false }) => {
  // Map backend trophy format to frontend Trophy type
  const mappedTrophies: TrophyType[] = trophies.map((t) => ({
    id: String(t.id),
    name: t.name,
    description: t.description,
    tier: t.tier as TrophyTier,
    iconUrl: t.imageUrl || undefined,
    unlockedAt: t.createdAt ? new Date(t.createdAt) : undefined,
  }));

  return <TrophyCase trophies={mappedTrophies} maxTrophies={8} showManageButton={showManageButton} />;
};

interface RecentScoresSectionProps {
  recentScores: UserRecentPlay[];
  meta?: UserRecentPlaysMeta;
  loading?: boolean;
  filters: {
    search: string;
    orderBy: 'date' | 'score';
    orderDirection: 'asc' | 'desc';
    minMeter?: number;
    maxMeter?: number;
    includeUnknown: boolean;
  };
  onSearchChange: (value: string) => void;
  onSortChange: (orderBy: 'date' | 'score', direction: 'asc' | 'desc') => void;
  onPageChange: (page: number) => void;
  onMinMeterChange: (min?: number) => void;
  onMaxMeterChange: (max?: number) => void;
  onIncludeUnknownChange: (include: boolean) => void;
}

const RecentScoresSection: React.FC<RecentScoresSectionProps> = ({
  recentScores,
  meta,
  loading,
  filters,
  onSearchChange,
  onSortChange,
  onPageChange,
  onMinMeterChange,
  onMaxMeterChange,
  onIncludeUnknownChange,
}) => {
  const { formatMessage, formatDate } = useIntl();
  const { activeLeaderboard } = useLeaderboardView();
  const activeTab = activeLeaderboard;
  const filteredScores = recentScores.filter((score) => {
    return score.leaderboards.some((lb) => lb.leaderboard === activeTab);
  });

  // All sorting is now handled by the backend
  const displayScores = filteredScores;

  const TableHeader: React.FC<{ label: string; sortKey: 'date' | 'score' }> = ({ label, sortKey }) => {
    const isActive = filters.orderBy === sortKey;
    const nextDirection = isActive && filters.orderDirection === 'asc' ? 'desc' : 'asc';
    return (
      <th className="bg-base-200/50 font-semibold text-base-content cursor-pointer select-none" onClick={() => onSortChange(sortKey, nextDirection)}>
        <div className="flex items-center justify-center gap-1">
          <span>{label}</span>
          <span className="flex flex-col">
            <ChevronUp size={12} className={`${isActive && filters.orderDirection === 'asc' ? 'text-primary' : 'text-base-content/30'}`} />
            <ChevronDown size={12} className={`${isActive && filters.orderDirection === 'desc' ? 'text-primary' : 'text-base-content/30'} -mt-1`} />
          </span>
        </div>
      </th>
    );
  };

  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body">
        <h3 className="card-title text-lg mb-4">
          <FormattedMessage defaultMessage="Recent Scores" id="VyKUu+" description="Title for the recent scores section" />
        </h3>

        {/* Leaderboard Type Tabs (global) */}
        <div className="mb-6">
          <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />
        </div>

        {/* Controls: search (row 1) and filters/meta (row 2) */}
        <div className="mb-4 flex flex-col gap-3">
          {/* Row 1: search aligned to left */}
          <div className="flex items-center">
            <div className="relative w-full sm:max-w-sm">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50" />
              <input
                type="text"
                placeholder={formatMessage({
                  defaultMessage: 'Search charts or artists...',
                  id: 'Lk4UgA',
                  description: "placeholder text for a search input on a player's recent scores",
                })}
                className="input input-bordered w-full pl-10 bg-base-100/60"
                value={filters.search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              {loading && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <span className="loading loading-spinner loading-sm"></span>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: min/max + includeUnknown on left; meta on right */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="flex gap-2 w-full sm:w-auto items-end">
              <div className="form-control w-full sm:w-40">
                <label className="label">
                  <span className="label-text text-xs">
                    {formatMessage({
                      defaultMessage: 'Min',
                      id: '8i+1ZL',
                      description: 'label for an input field specifying the minimum block level to search for (prefer very short length)',
                    })}
                  </span>
                </label>
                <select
                  className="select select-bordered w-full"
                  value={filters.minMeter ?? ''}
                  onChange={(e) => onMinMeterChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                >
                  {generateMeterOptions('min', filters.maxMeter).map((opt) => (
                    <option key={opt.value} value={opt.value ?? ''}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-control w-full sm:w-40">
                <label className="label">
                  <span className="label-text text-xs">
                    {formatMessage({
                      defaultMessage: 'Max',
                      id: 'upYb9D',
                      description: 'label for an input field specifying the maximum block level to search for (prefer very short length)',
                    })}
                  </span>
                </label>
                <select
                  className="select select-bordered w-full"
                  value={filters.maxMeter ?? ''}
                  onChange={(e) => onMaxMeterChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                >
                  {generateMeterOptions('max', filters.minMeter).map((opt) => (
                    <option key={opt.value} value={opt.value ?? ''}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-control">
                <label className="label cursor-pointer gap-2 mb-2">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-neutral"
                    checked={filters.includeUnknown}
                    onChange={(e) => onIncludeUnknownChange(e.target.checked)}
                  />
                  <span className="label-text text-xs">
                    {formatMessage({
                      defaultMessage: 'Include Unknown',
                      id: 'afF6i8',
                      description:
                        'label for a checkbox on the user profile list of played charts. when checked will include unregistered charts in the search results',
                    })}
                  </span>
                </label>
              </div>
            </div>

            {meta && (
              <div className="text-sm text-base-content/70 sm:ml-auto">
                {formatMessage(
                  {
                    defaultMessage: 'Showing {recentScores,number} of {total,number} plays',
                    id: 'FdrJbE',
                    description: 'label indicating how many rows are being displayed in the table of played charts of the user profile page',
                  },
                  { recentScores: recentScores.length, total: meta.total },
                )}
              </div>
            )}
          </div>
        </div>

        {/* Scores Table - Desktop */}
        <div className="hidden md:block overflow-x-auto">
          {filteredScores.length > 0 ? (
            <table className="table w-full">
              <thead>
                <tr className="border-base-content/10">
                  <th className="bg-base-200/50 font-semibold text-base-content">
                    {formatMessage({
                      defaultMessage: 'Chart',
                      id: '5jGvbu',
                      description: 'table column header label for played charts on the user profile page, this column shows info about the song',
                    })}
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content text-center">
                    {formatMessage({
                      defaultMessage: 'Grade',
                      id: 'DOXSYq',
                      description: 'table column header label for played charts on the user profile page, this column displays the ITG grade earned',
                    })}
                  </th>
                  <TableHeader
                    label={formatMessage({
                      defaultMessage: 'Score',
                      id: 'egg6+H',
                      description: 'table column header label for played charts on the user profile page, this column displays the score',
                    })}
                    sortKey="score"
                  />
                  <TableHeader
                    label={formatMessage({
                      defaultMessage: 'Date',
                      id: 'xfRlae',
                      description: 'table column header label for played charts on the user profile page, this column displays the date played',
                    })}
                    sortKey="date"
                  />
                </tr>
              </thead>
              <tbody className={loading ? 'opacity-50' : ''}>
                {displayScores.map((score, index) => {
                  const leaderboard = score.leaderboards.find((lb) => lb.leaderboard === activeTab);
                  if (!leaderboard) return null;

                  const grade = leaderboard.data.grade;

                  return (
                    <tr key={index} className="hover:bg-base-100/30 transition-colors border-base-content/5">
                      <td className="py-4">
                        <ChartDisplay chart={score.chart} />
                      </td>
                      <td className="py-4 text-center">
                        <div className="flex items-center justify-center">
                          <GradeImage grade={grade} className="w-8 h-8 object-contain" />
                        </div>
                      </td>
                      <td className="py-4 text-center">
                        {typeof score.playId === 'number' ? (
                          <Link to={`/play/${score.playId}`} className="font-bold text-lg text-primary">
                            {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx -- numeric score not translatable */}
                            {`${leaderboard.data.score}%`}
                          </Link>
                        ) : (
                          // eslint-disable-next-line formatjs/no-literal-string-in-jsx -- numeric score not translatable
                          <div className="font-bold text-lg text-primary">{`${leaderboard.data.score}%`}</div>
                        )}
                      </td>
                      <td className="py-4 text-center">
                        <div className="text-sm text-base-content/70">
                          {new Date(score.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="text-xs text-base-content/50">
                          {new Date(score.createdAt).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>

        {/* Scores Cards - Mobile */}
        <div className={`md:hidden space-y-4 ${loading ? 'opacity-50' : ''}`}>
          {displayScores.length > 0
            ? displayScores.map((score, index) => {
                const leaderboard = score.leaderboards.find((lb) => lb.leaderboard === activeTab);
                if (!leaderboard) return null;

                const grade = leaderboard.data.grade;

                return (
                  <div key={index} className="bg-base-200/30 rounded-lg p-4 border border-base-content/10">
                    {/* Chart Info */}
                    <Link to={`/chart/${score.chart.hash}`} className="block mb-3 hover:opacity-80 transition-opacity">
                      {/* Banner */}
                      <div className="mb-2">
                        <BannerImage
                          bannerVariants={score.chart.bannerVariants}
                          mdBannerUrl={score.chart.mdBannerUrl}
                          smBannerUrl={score.chart.smBannerUrl}
                          bannerUrl={score.chart.bannerUrl}
                          alt={`${score.chart.title} banner`}
                          className="w-full rounded-lg shadow-lg"
                          style={{ aspectRatio: '2.56' }}
                          loading="eager"
                        />
                      </div>

                      {/* Title and Artist */}
                      <div className="mb-2">
                        <div className="font-medium text-base-content text-sm truncate">{score.chart.title}</div>
                        <div className="text-xs text-base-content/60 truncate">{score.chart.artist}</div>
                      </div>

                      {/* Difficulty Chip */}
                      <div>
                        <DifficultyChip stepsType={score.chart.stepsType} difficulty={score.chart.difficulty} meter={score.chart.meter} size="sm" />
                      </div>
                    </Link>

                    {/* Score and Date Info */}
                    <div className="space-y-2">
                      {/* Grade and Score */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-base-content/60">
                            <GradeImage grade={grade} className="w-8 h-8 object-contain" />
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-base-content/60">
                            <FormattedMessage defaultMessage="Score" id="oGL1Ha" description="label for the score a user earned on a particular chart" />
                          </div>
                          {typeof score.playId === 'number' ? (
                            <Link to={`/play/${score.playId}`} className="font-bold text-lg text-primary">
                              {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx -- numeric score not translatable */}
                              {`${leaderboard.data.score}%`}
                            </Link>
                          ) : (
                            // eslint-disable-next-line formatjs/no-literal-string-in-jsx -- numeric score not translatable
                            <div className="font-bold text-lg text-primary">{`${leaderboard.data.score}%`}</div>
                          )}
                        </div>
                      </div>

                      {/* Date */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-base-content/60">
                          <FormattedMessage defaultMessage="Date" id="/eiyYH" description="label for the date a user earned a particular score" />
                        </span>
                        <div className="text-right">
                          <span className="text-base-content/70">
                            {formatDate(score.createdAt, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                          <span className="text-base-content/50 ml-2">
                            {formatDate(score.createdAt, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            : null}
        </div>

        {/* No scores message */}
        {filteredScores.length === 0 && !loading && (
          <div className="text-center py-12 text-base-content/50">
            <Music size={48} className="mx-auto mb-4 text-base-content/30" />
            <div className="text-lg font-medium mb-2">
              <FormattedMessage
                defaultMessage="No recent scores"
                id="YDRVsO"
                description="displayed on the user profile page if they have no scores to display"
              />
            </div>
          </div>
        )}

        {/* Pagination */}
        {meta && <Pagination meta={meta} onPageChange={onPageChange} />}
      </div>
    </div>
  );
};

export const UserPage: React.FC = () => {
  const { userId } = useParams<{ userId?: string }>();
  const { user: currentUser, updateUser } = useAuth();
  const { activeLeaderboard } = useLeaderboardView();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [recentPlaysMeta, setRecentPlaysMeta] = useState<UserRecentPlaysMeta | undefined>(undefined);
  const [profileLoading, setProfileLoading] = useState(true);
  const [recentLoading, setRecentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rivalActionLoading, setRivalActionLoading] = useState(false);
  const [rivalActionError, setRivalActionError] = useState<string | null>(null);
  const [banLoading, setBanLoading] = useState(false);
  const [banError, setBanError] = useState<string | null>(null);
  const [showBanConfirm, setShowBanConfirm] = useState(false);

  // Pagination/search/sort state for recent scores
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);
  const [orderBy, setOrderBy] = useState<'date' | 'score'>('date');
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('desc');
  // difficulty (meter) filters; default min=6-, max=17+
  // We'll represent 6- as 6 and 17+ as 17 for API; label rendering will add +/-
  const [minMeter, setMinMeter] = useState<number | undefined>(6);
  const [maxMeter, setMaxMeter] = useState<number | undefined>(17);
  const [includeUnknown, setIncludeUnknown] = useState<boolean>(true);

  // Track if initial profile load has completed to prevent double-fetching
  const initialLoadComplete = React.useRef(false);

  // Reset page when leaderboard changes
  useEffect(() => {
    setPage(1);
  }, [activeLeaderboard]);

  // Initial profile load (and initial recent plays)
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        setProfileLoading(true);
        setError(null);
        // Determine which user to fetch
        const targetUserId = userId || currentUser?.id;
        if (!targetUserId) {
          setError('You must be logged in to view your profile');
          setProfileLoading(false);
          return;
        }
        const response = await getUserById(targetUserId, {
          page,
          limit,
          search: debouncedSearch || undefined,
          leaderboard: activeLeaderboard,
          minMeter,
          maxMeter,
          includeUnknown,
          // API now supports date/title/score (score requires leaderboard selection)
          orderBy: orderBy,
          orderDirection,
        });
        setUserProfile(response.user);
        setRecentPlaysMeta(response.recentPlaysMeta);
        initialLoadComplete.current = true;
      } catch (err) {
        console.error('Failed to fetch user data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load user data');
      } finally {
        setProfileLoading(false);
        setRecentLoading(false);
      }
    };

    fetchInitial();
    // Only when the identity of the viewed user changes
    // Reset initial load flag when user changes
    initialLoadComplete.current = false;
  }, [userId, currentUser]);

  // Subsequent recent plays updates (pagination/search/sort/leaderboard/includeUnknown)
  useEffect(() => {
    const fetchRecentOnly = async () => {
      try {
        // Skip if initial load hasn't completed yet to avoid double-fetching
        if (!initialLoadComplete.current) return;

        // Derive the target user ID to use in the request
        const targetUserId = userId || userProfile?.id || currentUser?.id;
        if (!targetUserId) return; // Can't fetch without knowing which user

        setRecentLoading(true);
        const response = await getUserById(targetUserId, {
          page,
          limit,
          search: debouncedSearch || undefined,
          leaderboard: activeLeaderboard,
          minMeter,
          maxMeter,
          includeUnknown,
          orderBy: orderBy,
          orderDirection,
        });
        // Only update the recent plays/meta to avoid jarring page reload
        setUserProfile((prev) => (prev ? { ...prev, recentPlays: response.user.recentPlays } : response.user));
        setRecentPlaysMeta(response.recentPlaysMeta);
      } catch (err) {
        console.error('Failed to fetch recent plays:', err);
        setError(err instanceof Error ? err.message : 'Failed to load recent plays');
      } finally {
        setRecentLoading(false);
      }
    };

    fetchRecentOnly();
  }, [page, limit, debouncedSearch, orderBy, orderDirection, activeLeaderboard, minMeter, maxMeter, includeUnknown, userId, currentUser]);

  // Derived flags and rival actions must be declared before any early returns to preserve hooks order
  const isSelf = useMemo(() => {
    const viewedId = userProfile?.id;
    return !!currentUser?.id && !!viewedId && currentUser.id === viewedId;
  }, [currentUser?.id, userProfile?.id]);

  const isRival = useMemo(() => {
    if (!currentUser || !userProfile?.id) return false;
    if (isSelf) return false;
    const ids = (currentUser as any).rivalUserIds as string[] | undefined;
    return Array.isArray(ids) && ids.includes(userProfile.id);
  }, [currentUser, isSelf, userProfile?.id]);

  const canManageRival = !!currentUser && !isSelf;
  const canBanUser = !!currentUser && !isSelf && (currentUser as any)?.permissions?.includes?.('users.ban');

  const handleBanUser = useCallback(async () => {
    if (!userProfile?.id) return;

    try {
      setBanError(null);
      setBanLoading(true);

      await apiBanUser(userProfile.id, {
        reason: 'Violation of terms of service',
        deleteData: true,
      });

      // Navigate away since user is now banned
      window.location.href = '/';
    } catch (e: any) {
      setBanError(e?.message || 'Failed to ban user');
    } finally {
      setBanLoading(false);
      setShowBanConfirm(false);
    }
  }, [userProfile?.id]);

  const handleAddRival = useCallback(async () => {
    if (!currentUser || !userProfile?.id) return;
    try {
      setRivalActionError(null);
      setRivalActionLoading(true);
      await apiAddRival({ rivalUserId: userProfile.id });
      const prevIds = ((currentUser as any).rivalUserIds as string[] | undefined) || [];
      if (!prevIds.includes(userProfile.id)) {
        const nextIds = [...prevIds, userProfile.id];
        updateUser({ ...(currentUser as any), rivalUserIds: nextIds });
      }
    } catch (e: any) {
      setRivalActionError(e?.message || 'Failed to add rival');
    } finally {
      setRivalActionLoading(false);
    }
  }, [currentUser, updateUser, userProfile?.id]);

  const handleRemoveRival = useCallback(async () => {
    if (!currentUser || !userProfile?.id) return;
    try {
      setRivalActionError(null);
      setRivalActionLoading(true);
      await apiDeleteRival(userProfile.id);
      const prevIds = ((currentUser as any).rivalUserIds as string[] | undefined) || [];
      if (prevIds.includes(userProfile.id)) {
        const nextIds = prevIds.filter((id) => id !== userProfile.id);
        updateUser({ ...(currentUser as any), rivalUserIds: nextIds });
      }
    } catch (e: any) {
      setRivalActionError(e?.message || 'Failed to remove rival');
    } finally {
      setRivalActionLoading(false);
    }
  }, [currentUser, updateUser, userProfile?.id]);

  if (profileLoading) {
    return (
      <AppPageLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-96">
            <div className="text-center">
              <Loader2 size={48} className="mx-auto mb-4 text-primary animate-spin" />
              <div className="text-lg font-medium mb-2">
                <FormattedMessage defaultMessage="Loading user profile..." id="ZqM/Oi" description="displayed on the user profile page while data is loading" />
              </div>
            </div>
          </div>
        </div>
      </AppPageLayout>
    );
  }

  if (error) {
    return (
      <AppPageLayout>
        <div className="container mx-auto px-4 pt-28 py-8">
          <Alert variant="error" className="mb-8">
            {error}
          </Alert>
        </div>
      </AppPageLayout>
    );
  }

  if (!userProfile) {
    return (
      <AppPageLayout>
        <div className="container mx-auto px-4 pt-28 py-8">
          <Alert variant="error" className="mb-8">
            <FormattedMessage defaultMessage="User not found" id="uC7RSq" description="displayed on the user profile page if the user was not found" />
          </Alert>
        </div>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout>
      <div className="container mx-auto pt-28">
        {rivalActionError && (
          <Alert variant="error" className="mb-4">
            {rivalActionError}
          </Alert>
        )}
        {banError && (
          <Alert variant="error" className="mb-4">
            {banError}
          </Alert>
        )}

        {/* Ban Confirmation Modal */}
        {showBanConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-base-100 rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-bold mb-4">
                <FormattedMessage defaultMessage="Confirm Ban User" id="I/+lYe" description="heading for a dialog element confirming a ban action" />
              </h3>
              <p className="mb-4">
                <FormattedMessage
                  defaultMessage="Are you sure you want to ban <strong>{userAlias}</strong>? This will:"
                  id="Jic09P"
                  description="sub-head followed by a bulleted list of effects a ban will have on a user"
                  values={{ userAlias: userProfile?.alias, strong: (txt) => <strong>{txt}</strong> }}
                />
              </p>
              <ul className="list-disc list-inside mb-6 text-sm space-y-1">
                <li>
                  <FormattedMessage
                    defaultMessage="Prevent them from logging in"
                    id="s5gLzo"
                    description="one item in a bulleted list of effects a ban will have for a user"
                  />
                </li>
                <li>
                  <FormattedMessage
                    defaultMessage="Hide their profile from other users"
                    id="01/J8T"
                    description="one item in a bulleted list of effects a ban will have for a user"
                  />
                </li>
                <li>
                  <FormattedMessage
                    defaultMessage="Delete all their data (plays, API keys, etc.)"
                    id="olipRr"
                    description="one item in a bulleted list of effects a ban will have for a user"
                  />
                </li>
                <li>
                  <FormattedMessage
                    defaultMessage="Send them a suspension notification email"
                    id="QF7nqo"
                    description="one item in a bulleted list of effects a ban will have for a user"
                  />
                </li>
              </ul>
              <div className="flex gap-3">
                <button className="btn btn-outline flex-1" onClick={() => setShowBanConfirm(false)} disabled={banLoading}>
                  <FormattedMessage defaultMessage="Cancel" id="5Bb8X7" description="button label to cancel the process of banning a user" />
                </button>
                <button className={`btn btn-error flex-1 ${banLoading ? 'loading' : ''}`} onClick={handleBanUser} disabled={banLoading}>
                  {banLoading ? (
                    <FormattedMessage
                      defaultMessage="Banning..."
                      id="adIw3h"
                      description="button label displayed with a loading spinner while a ban action is processing"
                    />
                  ) : (
                    <FormattedMessage defaultMessage="Ban User" id="XgH7/X" description="button label to confirm a ban action against a user" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - User Metadata */}
          <div className="lg:col-span-1">
            <UserMetadataCard
              user={userProfile}
              isSelf={isSelf}
              isRival={isRival}
              canManageRival={canManageRival}
              canBanUser={canBanUser}
              actionLoading={rivalActionLoading}
              onAddRival={handleAddRival}
              onRemoveRival={handleRemoveRival}
              onBanUser={() => setShowBanConfirm(true)}
            />
          </div>

          {/* Right Column - Trophy Case */}
          <div className="lg:col-span-2">
            <TrophyCaseSection trophies={userProfile.trophies} showManageButton={isSelf} />
          </div>
        </div>

        {/* Full Width - Recent Scores */}
        <div className="mt-6">
          <RecentScoresSection
            recentScores={userProfile.recentPlays}
            meta={recentPlaysMeta}
            loading={recentLoading}
            filters={{ search: searchInput, orderBy, orderDirection, minMeter, maxMeter, includeUnknown }}
            onSearchChange={(v) => {
              setSearchInput(v);
              setPage(1);
            }}
            onSortChange={(ob, dir) => {
              setOrderBy(ob);
              setOrderDirection(dir);
              setPage(1);
            }}
            onPageChange={(p) => setPage(p)}
            onMinMeterChange={(min) => {
              // If max is defined and below new min, raise max to min
              setMinMeter(min);
              setMaxMeter((prev) => (prev !== undefined && min !== undefined && prev < min ? min : prev));
              setPage(1);
            }}
            onMaxMeterChange={(max) => {
              // If min is defined and above new max, lower min to max
              setMaxMeter(max);
              setMinMeter((prev) => (prev !== undefined && max !== undefined && prev > max ? max : prev));
              setPage(1);
            }}
            onIncludeUnknownChange={(val) => {
              setIncludeUnknown(val);
              setPage(1);
            }}
          />
        </div>
      </div>
    </AppPageLayout>
  );
};

// Helper to generate meter options with labels using native select
// device-native selects will be used via <select>
function generateMeterOptions(kind: 'min' | 'max', counterpart?: number) {
  // Range 6- through 17+
  const values = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  const opts: { value: number | undefined; label: string }[] = [];
  for (const v of values) {
    // Apply mutual restriction based on counterpart
    if (kind === 'min' && counterpart !== undefined && v > counterpart) continue;
    if (kind === 'max' && counterpart !== undefined && v < counterpart) continue;
    const label = v === 6 ? '6-' : v === 17 ? '17+' : String(v);
    opts.push({ value: v, label });
  }
  return opts;
}
