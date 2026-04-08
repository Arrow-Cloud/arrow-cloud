/* eslint-disable formatjs/no-literal-string-in-jsx */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, User, Star, Music, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppPageLayout, ProfileAvatar, Pagination, DifficultyBadge, GradeImage } from '../../components';
import type { PaginationMeta } from '../../components/ui/Pagination';
import { LeaderboardToggle } from '../../components/leaderboards/LeaderboardToggle';
import { useLeaderboardView } from '../../contexts/LeaderboardViewContext';
import { useAuth } from '../../contexts/AuthContext';
import { getBlueShiftOverallSummary } from '../../services/api';
import type { BlueShiftOverallSummary } from '../../schemas/apiSchemas';
import { getStoredUser, computeHighlight, HighlightedAlias } from '../../utils/rivalHighlight';
import { FormattedMessage, useIntl } from 'react-intl';

const HeroTitle: React.FC = () => {
  const { formatMessage } = useIntl();
  return (
    <div className="mb-12 text-center flex justify-center">
      <div className="max-w-4xl">
        <img
          src="https://assets.arrowcloud.dance/logos/20250725/blue shift-t big.png"
          alt={formatMessage({ defaultMessage: 'Blue Shift Logo', id: '+a1gOU', description: 'alt text for the blue shift logo image' })}
          className="w-full max-w-[600px] mx-auto mb-6"
        />
        <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent mb-4">
          <FormattedMessage defaultMessage="Final Results" id="k20lzD" description="Blue Shift results page title" />
        </h2>
      </div>
    </div>
  );
};

/**
 * Returns weight label based on weight value
 */
function getWeightLabel(weight: number): string {
  if (weight === 0.6) return 'Best Phase';
  if (weight === 0.3) return '2nd Best Phase';
  if (weight === 0.1) return 'Worst Phase';
  return '';
}

/**
 * Strips [##] prefix from song names (e.g., "[10] Song Name" -> "Song Name")
 */
function cleanSongName(name: string | undefined): string {
  if (!name) return 'Unknown Song';
  return name.replace(/^\[\d+\]\s*/, '');
}

interface OverallRankingsSectionProps {
  summaryData: BlueShiftOverallSummary;
  activeLeaderboard: 'HardEX' | 'EX' | 'Money';
  page: number;
  onPageChange: (page: number) => void;
}

const PAGE_SIZE = 10;

const OverallRankingsSection: React.FC<OverallRankingsSectionProps> = ({ summaryData, activeLeaderboard, page, onPageChange }) => {
  const { formatNumber } = useIntl();
  const { user } = useAuth();
  const storedUser = getStoredUser();
  const rivalIds: string[] = storedUser?.rivalUserIds || [];

  const overallData = summaryData.overall[activeLeaderboard]?.rankings || [];
  const total = overallData.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const startIndex = (page - 1) * PAGE_SIZE;
  const displayData = overallData.slice(startIndex, startIndex + PAGE_SIZE);

  const paginationMeta: PaginationMeta = {
    page,
    limit: PAGE_SIZE,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };

  // Find current user's placement
  const currentUserRankIndex = user ? overallData.findIndex((e) => e.userId === user.id) : -1;
  const currentUserEntry = currentUserRankIndex >= 0 ? overallData[currentUserRankIndex] : null;
  const currentUserRank = currentUserRankIndex >= 0 ? currentUserRankIndex + 1 : null;
  const currentUserInfo = currentUserEntry ? summaryData.users[currentUserEntry.userId] : null;

  return (
    <div className="card bg-base-100/80 backdrop-blur-sm shadow-xl border border-base-content/10">
      <div className="card-body p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h3 className="card-title text-xl flex items-center gap-2">
            <Trophy className="text-primary" size={24} />
            <FormattedMessage defaultMessage="Overall Rankings" id="OolH+a" description="Overall leaderboard section title" />
          </h3>
          <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />
        </div>

        {/* Current User Placement */}
        {user && currentUserEntry && currentUserRank && currentUserInfo && (
          <div className="mb-6 p-4 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 rounded-lg border border-primary/20">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-primary">
                  <User size={18} />
                  <span className="font-semibold text-sm">
                    <FormattedMessage defaultMessage="Your Placement" id="Tdcwjh" description="Label for user's placement" />
                  </span>
                </div>
                <ProfileAvatar profileImageUrl={currentUserInfo.profileImageUrl} alias={currentUserInfo.alias} size="sm" />
                <span className="font-bold text-2xl text-primary">#{currentUserRank}</span>
                <span className="text-base-content/60 text-sm">
                  <FormattedMessage defaultMessage="of {total}" id="xJMUKT" description="Out of total participants" values={{ total: overallData.length }} />
                </span>
              </div>
              <div className="sm:ml-auto flex flex-col gap-1 text-sm">
                <div className={currentUserEntry.phaseRanks.phase1 > 0 ? '' : 'text-base-content/30'}>
                  <span className="font-semibold">Phase 1:</span>{' '}
                  {currentUserEntry.phaseRanks.phase1 > 0 ? (
                    <>
                      #{currentUserEntry.phaseRanks.phase1}{' '}
                      <span className="text-base-content/60">
                        ({getWeightLabel(currentUserEntry.phaseWeights.phase1)}:{' '}
                        {formatNumber(Math.round(currentUserEntry.phasePoints.phase1 * currentUserEntry.phaseWeights.phase1))} pts)
                      </span>
                    </>
                  ) : (
                    'Did not participate'
                  )}
                </div>
                <div className={currentUserEntry.phaseRanks.phase2 > 0 ? '' : 'text-base-content/30'}>
                  <span className="font-semibold">Phase 2:</span>{' '}
                  {currentUserEntry.phaseRanks.phase2 > 0 ? (
                    <>
                      #{currentUserEntry.phaseRanks.phase2}{' '}
                      <span className="text-base-content/60">
                        ({getWeightLabel(currentUserEntry.phaseWeights.phase2)}:{' '}
                        {formatNumber(Math.round(currentUserEntry.phasePoints.phase2 * currentUserEntry.phaseWeights.phase2))} pts)
                      </span>
                    </>
                  ) : (
                    'Did not participate'
                  )}
                </div>
                <div className={currentUserEntry.phaseRanks.phase3 > 0 ? '' : 'text-base-content/30'}>
                  <span className="font-semibold">Phase 3:</span>{' '}
                  {currentUserEntry.phaseRanks.phase3 > 0 ? (
                    <>
                      #{currentUserEntry.phaseRanks.phase3}{' '}
                      <span className="text-base-content/60">
                        ({getWeightLabel(currentUserEntry.phaseWeights.phase3)}:{' '}
                        {formatNumber(Math.round(currentUserEntry.phasePoints.phase3 * currentUserEntry.phaseWeights.phase3))} pts)
                      </span>
                    </>
                  ) : (
                    'Did not participate'
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard Table */}
        <div className="overflow-x-auto md:overflow-x-hidden">
          <table className="table w-full">
            <thead>
              <tr className="border-base-content/10">
                <th className="bg-base-200/50 font-semibold text-base-content text-center w-12">
                  <FormattedMessage defaultMessage="Rank" id="up/yoE" description="table column header for player rank" />
                </th>
                <th className="bg-base-200/50 font-semibold text-base-content w-24">
                  <FormattedMessage defaultMessage="Player" id="G6Bo2J" description="table column header for player" />
                </th>
                <th className="bg-base-200/50 font-semibold text-base-content text-center w-16">
                  <FormattedMessage defaultMessage="Phase 1" id="7ivPDh" description="Phase 1 column header" />
                </th>
                <th className="bg-base-200/50 font-semibold text-base-content text-center w-16">
                  <FormattedMessage defaultMessage="Phase 2" id="K0gQHa" description="Phase 2 column header" />
                </th>
                <th className="bg-base-200/50 font-semibold text-base-content text-center w-16">
                  <FormattedMessage defaultMessage="Phase 3" id="QnWYrL" description="Phase 3 column header" />
                </th>
              </tr>
            </thead>
            <tbody>
              {displayData.map((entry, index) => {
                const rank = startIndex + index + 1;
                const userInfo = summaryData.users[entry.userId];
                const highlight = computeHighlight(storedUser?.id, rivalIds, entry.userId);

                // Calculate weighted points for tooltips
                const p1WeightedPts = Math.round(entry.phasePoints.phase1 * entry.phaseWeights.phase1);
                const p2WeightedPts = Math.round(entry.phasePoints.phase2 * entry.phaseWeights.phase2);
                const p3WeightedPts = Math.round(entry.phasePoints.phase3 * entry.phaseWeights.phase3);

                const p1Label = getWeightLabel(entry.phaseWeights.phase1);
                const p2Label = getWeightLabel(entry.phaseWeights.phase2);
                const p3Label = getWeightLabel(entry.phaseWeights.phase3);

                return (
                  <tr key={entry.userId} className={`border-base-content/5 ${highlight.rowGradientClass}`}>
                    <td className="py-3 text-center">
                      <div className={`font-bold text-lg ${highlight.rankColorClass}`}>#{rank}</div>
                    </td>
                    <td className="py-3">
                      <Link
                        to={`/user/${entry.userId}`}
                        className={`font-medium hover:text-primary transition-colors flex items-center gap-3 ${highlight.playerTextClass}`}
                      >
                        <ProfileAvatar profileImageUrl={userInfo?.profileImageUrl} alias={userInfo?.alias || 'Unknown'} size="sm" />
                        <HighlightedAlias alias={userInfo?.alias || 'Unknown'} highlight={highlight} />
                      </Link>
                    </td>
                    {/* Phase 1 Rank */}
                    <td className="py-3 text-center">
                      <div
                        className="tooltip cursor-help"
                        data-tip={entry.phaseRanks.phase1 > 0 ? `${p1Label}: ${formatNumber(p1WeightedPts)} pts` : 'Did not participate'}
                      >
                        <span className={entry.phaseRanks.phase1 > 0 ? 'text-base-content' : 'text-base-content/30'}>
                          {entry.phaseRanks.phase1 > 0 ? `#${entry.phaseRanks.phase1}` : '—'}
                        </span>
                      </div>
                    </td>
                    {/* Phase 2 Rank */}
                    <td className="py-3 text-center">
                      <div
                        className="tooltip cursor-help"
                        data-tip={entry.phaseRanks.phase2 > 0 ? `${p2Label}: ${formatNumber(p2WeightedPts)} pts` : 'Did not participate'}
                      >
                        <span className={entry.phaseRanks.phase2 > 0 ? 'text-base-content' : 'text-base-content/30'}>
                          {entry.phaseRanks.phase2 > 0 ? `#${entry.phaseRanks.phase2}` : '—'}
                        </span>
                      </div>
                    </td>
                    {/* Phase 3 Rank */}
                    <td className="py-3 text-center">
                      <div
                        className="tooltip cursor-help"
                        data-tip={entry.phaseRanks.phase3 > 0 ? `${p3Label}: ${formatNumber(p3WeightedPts)} pts` : 'Did not participate'}
                      >
                        <span className={entry.phaseRanks.phase3 > 0 ? 'text-base-content' : 'text-base-content/30'}>
                          {entry.phaseRanks.phase3 > 0 ? `#${entry.phaseRanks.phase3}` : '—'}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {displayData.length === 0 && (
          <div className="text-center py-8 text-base-content/60">
            <FormattedMessage defaultMessage="No data available" id="zXp6Z2" description="Empty state message" />
          </div>
        )}

        {/* Pagination */}
        <Pagination meta={paginationMeta} onPageChange={onPageChange} />
      </div>
    </div>
  );
};

type PhaseKey = 'phase1' | 'phase2' | 'phase3';

interface PhaseRankingsSectionProps {
  summaryData: BlueShiftOverallSummary;
  activeLeaderboard: 'HardEX' | 'EX' | 'Money';
  selectedPhase: PhaseKey;
  onPhaseChange: (phase: PhaseKey) => void;
  page: number;
  onPageChange: (page: number) => void;
}

const PhaseRankingsSection: React.FC<PhaseRankingsSectionProps> = ({ summaryData, activeLeaderboard, selectedPhase, onPhaseChange, page, onPageChange }) => {
  const { formatNumber } = useIntl();
  const { user } = useAuth();
  const storedUser = getStoredUser();
  const rivalIds: string[] = storedUser?.rivalUserIds || [];

  const phaseData = summaryData.phases[selectedPhase];
  const rankings = phaseData?.leaderboards[activeLeaderboard]?.rankings || [];
  const total = rankings.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const startIndex = (page - 1) * PAGE_SIZE;
  const displayData = rankings.slice(startIndex, startIndex + PAGE_SIZE);

  const paginationMeta: PaginationMeta = {
    page,
    limit: PAGE_SIZE,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };

  const phases: { key: PhaseKey; number: number }[] = [
    { key: 'phase1', number: 1 },
    { key: 'phase2', number: 2 },
    { key: 'phase3', number: 3 },
  ];

  // Find current user's placement in this phase
  const currentUserRankIndex = user ? rankings.findIndex((e) => e.userId === user.id) : -1;
  const currentUserEntry = currentUserRankIndex >= 0 ? rankings[currentUserRankIndex] : null;
  const currentUserRank = currentUserRankIndex >= 0 ? currentUserRankIndex + 1 : null;
  const currentUserInfo = currentUserEntry ? summaryData.users[currentUserEntry.userId] : null;

  return (
    <div className="card bg-base-100/80 backdrop-blur-sm shadow-xl border border-base-content/10">
      <div className="card-body p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h3 className="card-title text-xl flex items-center gap-2">
            <Star className="text-secondary" size={24} />
            <FormattedMessage defaultMessage="Phase Rankings" id="Pnpb2O" description="Phase leaderboard section title" />
          </h3>
          <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />
        </div>

        {/* Phase Selector Tabs */}
        <div className="mb-6">
          <div className="flex justify-center">
            <div className="inline-flex gap-3 p-1 bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20 rounded-xl shadow-lg backdrop-blur-sm border border-primary/30">
              {phases.map((phase) => (
                <button
                  key={phase.key}
                  className={`
                    relative px-6 py-2 rounded-lg font-bold text-base transition-all duration-300 cursor-pointer
                    ${
                      selectedPhase === phase.key
                        ? 'bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-xl'
                        : 'bg-base-100/50 text-base-content/70 hover:bg-base-100/80 hover:text-base-content'
                    }
                  `}
                  onClick={() => onPhaseChange(phase.key)}
                >
                  <span className="relative z-10">
                    <FormattedMessage
                      defaultMessage="Phase {phaseNumber}"
                      description="Label for Blue Shift event phase tab"
                      id="ecAIWs"
                      values={{ phaseNumber: phase.number }}
                    />
                  </span>
                  {selectedPhase === phase.key && (
                    <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/50 via-secondary/50 to-accent/50 blur-xl"></span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Current User Placement */}
        {user && currentUserEntry && currentUserRank && currentUserInfo && (
          <div className="mb-6 p-4 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 rounded-lg border border-primary/20">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-primary">
                  <User size={18} />
                  <span className="font-semibold text-sm">
                    <FormattedMessage defaultMessage="Your Placement" id="Tdcwjh" description="Label for user's placement" />
                  </span>
                </div>
                <ProfileAvatar profileImageUrl={currentUserInfo.profileImageUrl} alias={currentUserInfo.alias} size="sm" />
                <span className="font-bold text-2xl text-primary">#{currentUserRank}</span>
                <span className="text-base-content/60 text-sm">
                  <FormattedMessage defaultMessage="of {total}" id="xJMUKT" description="Out of total participants" values={{ total: rankings.length }} />
                </span>
              </div>
              <div className="sm:ml-auto flex items-center gap-4 text-sm">
                <div>
                  <span className="font-semibold">{formatNumber(Math.round(currentUserEntry.totalPoints))}</span>{' '}
                  <span className="text-base-content/60">pts</span>
                </div>
                <div>
                  <span className="font-semibold">{currentUserEntry.chartsPlayed}</span> <span className="text-base-content/60">charts</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard Table */}
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr className="border-base-content/10">
                <th className="bg-base-200/50 font-semibold text-base-content text-center">
                  <FormattedMessage defaultMessage="Rank" id="up/yoE" description="table column header for player rank" />
                </th>
                <th className="bg-base-200/50 font-semibold text-base-content">
                  <FormattedMessage defaultMessage="Player" id="G6Bo2J" description="table column header for player" />
                </th>
                <th className="bg-base-200/50 font-semibold text-base-content text-right">
                  <FormattedMessage defaultMessage="Points" id="epvAVc" description="Points column header" />
                </th>
                <th className="bg-base-200/50 font-semibold text-base-content text-center">
                  <FormattedMessage defaultMessage="Charts" id="E4mZwn" description="Charts played column header" />
                </th>
              </tr>
            </thead>
            <tbody>
              {displayData.map((entry, index) => {
                const rank = startIndex + index + 1;
                const userInfo = summaryData.users[entry.userId];
                const highlight = computeHighlight(storedUser?.id, rivalIds, entry.userId);

                return (
                  <tr key={entry.userId} className={`border-base-content/5 ${highlight.rowGradientClass}`}>
                    <td className="py-3 text-center">
                      <div className={`font-bold text-lg ${highlight.rankColorClass}`}>#{rank}</div>
                    </td>
                    <td className="py-3">
                      <Link
                        to={`/user/${entry.userId}`}
                        className={`font-medium hover:text-primary transition-colors flex items-center gap-3 ${highlight.playerTextClass}`}
                      >
                        <ProfileAvatar profileImageUrl={userInfo?.profileImageUrl} alias={userInfo?.alias || 'Unknown'} size="sm" />
                        <HighlightedAlias alias={userInfo?.alias || 'Unknown'} highlight={highlight} />
                      </Link>
                    </td>
                    <td className="py-3 text-right font-semibold">{formatNumber(Math.round(entry.totalPoints))}</td>
                    <td className="py-3 text-center text-base-content/70">{entry.chartsPlayed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {displayData.length === 0 && (
          <div className="text-center py-8 text-base-content/60">
            <FormattedMessage defaultMessage="No data available" id="zXp6Z2" description="Empty state message" />
          </div>
        )}

        {/* Pagination */}
        <Pagination meta={paginationMeta} onPageChange={onPageChange} />
      </div>
    </div>
  );
};

interface ChartScoresSectionProps {
  summaryData: BlueShiftOverallSummary;
  activeLeaderboard: 'HardEX' | 'EX' | 'Money';
  selectedPhase: PhaseKey;
  onPhaseChange: (phase: PhaseKey) => void;
  chartIndex: number;
  onChartIndexChange: (index: number) => void;
}

const ChartScoresSection: React.FC<ChartScoresSectionProps> = ({
  summaryData,
  activeLeaderboard,
  selectedPhase,
  onPhaseChange,
  chartIndex,
  onChartIndexChange,
}) => {
  const { formatNumber } = useIntl();
  const storedUser = getStoredUser();
  const rivalIds: string[] = storedUser?.rivalUserIds || [];

  const phases: { key: PhaseKey; number: number }[] = [
    { key: 'phase1', number: 1 },
    { key: 'phase2', number: 2 },
    { key: 'phase3', number: 3 },
  ];

  // Get chart hashes for selected phase, sorted by difficulty then alphabetically by cleaned song name
  const rawChartHashes = summaryData.phases[selectedPhase]?.chartHashes || [];
  const chartHashes = [...rawChartHashes].sort((a, b) => {
    const chartA = summaryData.charts[a];
    const chartB = summaryData.charts[b];
    // Sort by meter (difficulty) first
    const meterA = chartA?.meter ?? 0;
    const meterB = chartB?.meter ?? 0;
    if (meterA !== meterB) {
      return meterA - meterB;
    }
    // Then sort alphabetically by cleaned song name
    const nameA = cleanSongName(chartA?.songName);
    const nameB = cleanSongName(chartB?.songName);
    return nameA.localeCompare(nameB);
  });
  const totalCharts = chartHashes.length;
  const currentChartHash = chartHashes[chartIndex];
  const currentChart = currentChartHash ? summaryData.charts[currentChartHash] : null;

  // Get leaderboard for current chart
  const leaderboard = currentChart?.leaderboards?.[activeLeaderboard] || [];

  const handlePrevChart = () => {
    if (chartIndex > 0) {
      onChartIndexChange(chartIndex - 1);
    }
  };

  const handleNextChart = () => {
    if (chartIndex < totalCharts - 1) {
      onChartIndexChange(chartIndex + 1);
    }
  };

  return (
    <div className="card bg-base-100/80 backdrop-blur-sm shadow-xl border border-base-content/10">
      <div className="card-body p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h3 className="card-title text-xl flex items-center gap-2">
            <Music className="text-accent" size={24} />
            <FormattedMessage defaultMessage="Chart Scores" id="YORqn2" description="Chart scores section title" />
          </h3>
          <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />
        </div>

        {/* Phase Selector Tabs */}
        <div className="mb-6">
          <div className="flex justify-center">
            <div className="inline-flex gap-3 p-1 bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20 rounded-xl shadow-lg backdrop-blur-sm border border-primary/30">
              {phases.map((phase) => (
                <button
                  key={phase.key}
                  className={`
                    relative px-6 py-2 rounded-lg font-bold text-base transition-all duration-300 cursor-pointer
                    ${
                      selectedPhase === phase.key
                        ? 'bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-xl'
                        : 'bg-base-100/50 text-base-content/70 hover:bg-base-100/80 hover:text-base-content'
                    }
                  `}
                  onClick={() => onPhaseChange(phase.key)}
                >
                  <span className="relative z-10">
                    <FormattedMessage
                      defaultMessage="Phase {phaseNumber}"
                      description="Label for Blue Shift event phase tab"
                      id="ecAIWs"
                      values={{ phaseNumber: phase.number }}
                    />
                  </span>
                  {selectedPhase === phase.key && (
                    <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/50 via-secondary/50 to-accent/50 blur-xl"></span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart Navigation */}
        {currentChart && (
          <>
            <div className="flex items-center justify-between mb-4">
              <button className="btn btn-circle btn-ghost btn-sm" onClick={handlePrevChart} disabled={chartIndex === 0}>
                <ChevronLeft size={20} />
              </button>
              <span className="text-sm text-base-content/60">
                <FormattedMessage
                  defaultMessage="Chart {current} of {total}"
                  id="Dqs29A"
                  description="Chart navigation indicator"
                  values={{ current: chartIndex + 1, total: totalCharts }}
                />
              </span>
              <button className="btn btn-circle btn-ghost btn-sm" onClick={handleNextChart} disabled={chartIndex >= totalCharts - 1}>
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Chart Metadata */}
            <div className="flex gap-4 mb-6 p-4 bg-base-200/50 rounded-lg">
              {currentChart.bannerUrl && (
                <img src={currentChart.bannerUrl} alt={currentChart.songName || 'Chart banner'} className="h-20 w-auto object-contain rounded-lg" />
              )}
              <div className="flex flex-col justify-center">
                <Link to={`/chart/${currentChartHash}`} className="font-bold text-lg hover:text-primary transition-colors">
                  {cleanSongName(currentChart.songName)}
                </Link>
                <div className="text-sm text-base-content/70">{currentChart.artist || 'Unknown Artist'}</div>
                <div className="mt-1">
                  <DifficultyBadge difficulty={currentChart.difficulty} meter={currentChart.meter} />
                </div>
              </div>
            </div>

            {/* Leaderboard Table */}
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr className="border-base-content/10">
                    <th className="bg-base-200/50 font-semibold text-base-content text-center">
                      <FormattedMessage defaultMessage="Rank" id="up/yoE" description="table column header for player rank" />
                    </th>
                    <th className="bg-base-200/50 font-semibold text-base-content">
                      <FormattedMessage defaultMessage="Player" id="G6Bo2J" description="table column header for player" />
                    </th>
                    <th className="bg-base-200/50 font-semibold text-base-content text-center">
                      <FormattedMessage defaultMessage="Grade" id="zPreo/" description="Grade column header" />
                    </th>
                    <th className="bg-base-200/50 font-semibold text-base-content text-right">
                      <FormattedMessage defaultMessage="Score" id="pBUB3k" description="Score column header" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => {
                    const userInfo = summaryData.users[entry.userId];
                    const highlight = computeHighlight(storedUser?.id, rivalIds, entry.userId);

                    return (
                      <tr key={entry.userId} className={`border-base-content/5 ${highlight.rowGradientClass}`}>
                        <td className="py-3 text-center">
                          <div className={`font-bold text-lg ${highlight.rankColorClass}`}>#{entry.rank}</div>
                        </td>
                        <td className="py-3">
                          <Link
                            to={`/user/${entry.userId}`}
                            className={`font-medium hover:text-primary transition-colors flex items-center gap-3 ${highlight.playerTextClass}`}
                          >
                            <ProfileAvatar profileImageUrl={userInfo?.profileImageUrl} alias={userInfo?.alias || 'Unknown'} size="sm" />
                            <HighlightedAlias alias={userInfo?.alias || 'Unknown'} highlight={highlight} />
                          </Link>
                        </td>
                        <td className="py-3 text-center">
                          <GradeImage grade={entry.grade} className="h-6 mx-auto" />
                        </td>
                        <td className="py-3 text-right font-semibold">
                          {formatNumber(parseFloat(entry.score) / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {leaderboard.length === 0 && (
              <div className="text-center py-8 text-base-content/60">
                <FormattedMessage defaultMessage="No scores available" id="46fZTI" description="Empty state for chart scores" />
              </div>
            )}
          </>
        )}

        {!currentChart && (
          <div className="text-center py-8 text-base-content/60">
            <FormattedMessage defaultMessage="No charts available" id="4yGxz/" description="Empty state for no charts" />
          </div>
        )}
      </div>
    </div>
  );
};

export const BlueShiftResultsPage: React.FC = () => {
  const { activeLeaderboard } = useLeaderboardView();
  const [summaryData, setSummaryData] = useState<BlueShiftOverallSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedPhase, setSelectedPhase] = useState<PhaseKey>('phase1');
  const [phasePage, setPhasePage] = useState(1);
  const [chartPhase, setChartPhase] = useState<PhaseKey>('phase1');
  const [chartIndex, setChartIndex] = useState(0);

  const activeTab = (activeLeaderboard === 'ITG' ? 'Money' : activeLeaderboard) as 'HardEX' | 'EX' | 'Money';

  // Reset pages when leaderboard changes
  useEffect(() => {
    setPage(1);
    setPhasePage(1);
    setChartIndex(0);
  }, [activeLeaderboard]);

  // Reset phase page when phase changes
  useEffect(() => {
    setPhasePage(1);
  }, [selectedPhase]);

  // Reset chart index when chart phase changes
  useEffect(() => {
    setChartIndex(0);
  }, [chartPhase]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await getBlueShiftOverallSummary();
        setSummaryData(data);
      } catch (err) {
        console.error('Failed to fetch Blue Shift overall summary:', err);
        setError(err instanceof Error ? err.message : 'Failed to load results');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <AppPageLayout className="pb-0">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <HeroTitle />

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center py-20">
            <div className="loading loading-spinner loading-lg text-primary"></div>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="alert alert-error mb-8">
            <FormattedMessage
              defaultMessage="Failed to load results: {error}"
              id="i8w9+X"
              description="Error message for failed data load"
              values={{ error }}
            />
          </div>
        )}

        {/* Content */}
        {summaryData && !isLoading && (
          <div className="space-y-8">
            {/* Overall Rankings */}
            <OverallRankingsSection summaryData={summaryData} activeLeaderboard={activeTab} page={page} onPageChange={setPage} />

            {/* Phase Rankings */}
            <PhaseRankingsSection
              summaryData={summaryData}
              activeLeaderboard={activeTab}
              selectedPhase={selectedPhase}
              onPhaseChange={setSelectedPhase}
              page={phasePage}
              onPageChange={setPhasePage}
            />

            {/* Chart Scores */}
            <ChartScoresSection
              summaryData={summaryData}
              activeLeaderboard={activeTab}
              selectedPhase={chartPhase}
              onPhaseChange={setChartPhase}
              chartIndex={chartIndex}
              onChartIndexChange={setChartIndex}
            />
          </div>
        )}
      </div>
    </AppPageLayout>
  );
};
