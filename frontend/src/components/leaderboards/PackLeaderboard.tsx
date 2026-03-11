import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { ProfileAvatar, Pagination } from '../ui';
import { LeaderboardToggle } from '../leaderboards/LeaderboardToggle';
import { useLeaderboardView } from '../../contexts/LeaderboardViewContext';
import { FormattedMessage, FormattedNumber } from 'react-intl';
import { getStoredUser, computeHighlight, HighlightedAlias } from '../../utils/rivalHighlight';
import type { PackLeaderboardData } from '../../schemas/apiSchemas';

const PAGE_SIZE = 10;
const DIFFICULTY_LS_KEY = 'pack-leaderboard-difficulty';

// ---------------------------------------------------------------------------
// Difficulty tabs
// ---------------------------------------------------------------------------

const DIFFICULTY_TABS = [
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
  { key: 'challenge', label: 'Challenge' },
] as const;

/** Matches the DifficultyChip color palette. */
const DIFFICULTY_COLORS: Record<string, string> = {
  medium: '#CA8A04', // yellow-600
  hard: '#EA580C', // orange-600
  challenge: '#DC2626', // red-600
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
  if (rank === 1) return <Trophy size={16} className="text-yellow-400" />;
  return <span className="text-base-content/60 font-medium tabular-nums">{rank}</span>;
};

interface LeaderboardTableProps {
  leaderboard: PackLeaderboardData['leaderboards'][string][string];
  users: PackLeaderboardData['users'];
  page: number;
  onPageChange: (page: number) => void;
}

const LeaderboardTable: React.FC<LeaderboardTableProps> = ({ leaderboard, users, page, onPageChange }) => {
  const storedUser = getStoredUser();
  const rivalIds: string[] = storedUser?.rivalUserIds || [];

  const total = leaderboard.rankings.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRankings = leaderboard.rankings.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (total === 0) {
    return (
      <div className="text-center py-8 text-base-content/50">
        <Trophy size={32} className="mx-auto mb-2 text-base-content/30" />
        <FormattedMessage defaultMessage="No scores yet" id="jGmBu3" description="Message when pack leaderboard has no scores" />
      </div>
    );
  }

  const paginationMeta = {
    page: safePage,
    limit: PAGE_SIZE,
    total,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1,
  };

  return (
    <>
      {/* Rankings list */}
      <div className="space-y-1">
        {paginatedRankings.map((entry) => {
          const user = users[entry.userId];
          const highlight = computeHighlight(storedUser?.id, rivalIds, entry.userId);
          return (
            <Link
              key={entry.userId}
              to={`/user/${entry.userId}`}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-base-200/50 transition-colors group ${highlight.rowGradientClass}`}
            >
              <div className="w-7 text-center shrink-0">
                <RankBadge rank={entry.rank} />
              </div>
              <ProfileAvatar profileImageUrl={user?.profileImageUrl} alias={user?.alias ?? '?'} size="sm" />
              <div className="flex-1 min-w-0">
                <span className={`font-medium text-sm truncate block group-hover:text-primary transition-colors ${highlight.playerTextClass}`}>
                  <HighlightedAlias alias={user?.alias ?? entry.userId} highlight={highlight} />
                </span>
              </div>
              <div className="tooltip tooltip-left" data-tip={`${entry.chartsPlayed} charts played`}>
                <span className={`font-bold text-sm tabular-nums ${highlight.scoreColorClass}`}>
                  <FormattedNumber value={Math.floor(entry.totalScore)} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      {totalPages > 1 && <Pagination meta={paginationMeta} onPageChange={onPageChange} className="mt-4" />}
    </>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PackLeaderboardProps {
  data?: PackLeaderboardData | null;
}

export const PackLeaderboard: React.FC<PackLeaderboardProps> = ({ data }) => {
  const { activeLeaderboard } = useLeaderboardView();
  const [activeDifficulty, setActiveDifficultyState] = useState<string>(() => localStorage.getItem(DIFFICULTY_LS_KEY) || 'challenge');
  const [page, setPage] = useState(1);

  const setActiveDifficulty = (d: string) => {
    setActiveDifficultyState(d);
    localStorage.setItem(DIFFICULTY_LS_KEY, d);
  };

  // Reset page when difficulty or scoring system changes
  const currentLeaderboard = useMemo(() => {
    setPage(1);
    return data?.leaderboards[activeDifficulty]?.[activeLeaderboard];
  }, [data, activeDifficulty, activeLeaderboard]);

  if (!data) return null;

  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body">
        {/* Header with beta badge */}
        <div className="flex items-center gap-3 mb-4">
          <h3 className="card-title text-lg">
            <Trophy size={20} className="text-primary" />
            <FormattedMessage defaultMessage="Pack Leaderboard" id="M/FX2E" description="Title for the pack leaderboard section" />
          </h3>
          <span className="badge badge-primary badge-xs">
            <FormattedMessage defaultMessage="Beta" description="Badge label indicating a feature is in beta" id="NvFvI1" />
          </span>
        </div>

        {/* Difficulty tabs */}
        <div className="flex gap-2 mb-4">
          {DIFFICULTY_TABS.map(({ key, label }) => {
            const color = DIFFICULTY_COLORS[key];
            const isActive = activeDifficulty === key;
            return (
              <button
                key={key}
                className={`btn btn-sm transition-all duration-200 ${isActive ? 'shadow-lg text-white' : 'btn-outline hover:shadow-md'}`}
                style={isActive ? { backgroundColor: color, borderColor: color } : { borderColor: color, color }}
                onClick={() => setActiveDifficulty(key)}
              >
                <span className="font-medium">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Scoring system toggle */}
        <div className="mb-4">
          <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />
        </div>

        {/* Leaderboard content */}
        {currentLeaderboard ? (
          <LeaderboardTable leaderboard={currentLeaderboard} users={data.users} page={page} onPageChange={setPage} />
        ) : (
          <div className="text-center py-8 text-base-content/50">
            <Trophy size={32} className="mx-auto mb-2 text-base-content/30" />
            <FormattedMessage defaultMessage="No leaderboard data available" id="y3vXzI" description="Message when no pack leaderboard data exists" />
          </div>
        )}
      </div>
    </div>
  );
};
