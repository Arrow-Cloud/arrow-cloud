import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Calendar, Loader2, Hash, User, Award, Trophy, Search } from 'lucide-react';
import { AppPageLayout, Alert, GradeImage, DifficultyChip, Pagination, InteractiveCard } from '../../components';
import { LeaderboardToggle } from '../../components/leaderboards/LeaderboardToggle';
import { useLeaderboardView } from '../../contexts/LeaderboardViewContext';
import { useAuth } from '../../contexts/AuthContext';
import { BannerImage } from '../../components/ui';
import { getChart, getChartLeaderboards } from '../../services/api';
import { getStoredUser, computeHighlight, HighlightedAlias } from '../../utils/rivalHighlight';
import { ChartDetails as ApiChartDetails, ChartLeaderboardResponse } from '../../schemas/apiSchemas';
import { FormattedMessage, FormattedDate, useIntl } from 'react-intl';
import { isPhase1Active } from '../../utils/blueshift';
import { useChartRecentPlays, useDebounce } from '../../hooks';

const ChartMetadataCard: React.FC<{ chart: ApiChartDetails }> = ({ chart }) => {
  const { formatDate, formatMessage } = useIntl();

  // Get the first simfile for primary display, or fall back to chart metadata
  const primarySimfile = chart.simfiles[0]?.simfile;
  const title = primarySimfile?.title || chart.songName || 'Unknown Title';

  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body">
        <div className="mb-4">
          <BannerImage
            bannerVariants={chart.bannerVariants}
            mdBannerUrl={chart.mdBannerUrl}
            smBannerUrl={chart.smBannerUrl}
            bannerUrl={chart.bannerUrl || primarySimfile?.bannerUrl}
            alt={`${title} banner`}
            className="w-full rounded-lg shadow-lg"
            style={{ aspectRatio: '2.56' }}
            sizePreference="original"
            loading="eager"
          />
        </div>
        <div className="space-y-3 text-sm mb-6">
          <h1 className="text-4xl font-bold text-base-content mb-2">{title}</h1>
          <div className="text-lg text-base-content/70">
            {chart.simfiles[0]?.simfile.artist ||
              chart.artist ||
              formatMessage({ defaultMessage: 'Unknown Artist', id: 'v9EcKC', description: 'Fallback artist name when none is provided' })}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <DifficultyChip stepsType={chart.stepsType} difficulty={chart.difficulty} meter={chart.meter} size="sm" />
            {chart.description && <span className="badge badge-xs badge-ghost">{chart.description}</span>}
          </div>
        </div>
        <div className="space-y-3 text-sm mb-6">
          <div className="flex items-center gap-2">
            <Hash size={16} className="text-base-content/60" />
            <span>
              <FormattedMessage
                defaultMessage="Hash: {hash}"
                id="0OpKH3"
                description="Label for the chart hash"
                values={{ hash: <span className="font-mono text-xs">{chart.hash}</span> }}
              />
            </span>
          </div>
          {(chart.stepartist || chart.credit) && (
            <div className="flex items-center gap-2">
              <User size={16} className="text-base-content/60" />
              <span>
                <FormattedMessage
                  defaultMessage="Stepartist: {stepartist}"
                  id="CqHJWf"
                  description="Label for the chart stepartist or credit"
                  values={{ stepartist: <span className="font-medium">{chart.stepartist || chart.credit}</span> }}
                />
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-base-content/60" />
            <span>
              <FormattedMessage
                defaultMessage="Added: {date}"
                id="tApE2N"
                description="Label for the chart added date"
                values={{ date: <span className="font-medium">{formatDate(new Date(chart.createdAt))}</span> }}
              />
            </span>
          </div>
        </div>

        {/* Associated Simfiles */}
        {chart.simfiles.length > 0 && (
          <div>
            <h4 className="font-semibold text-base-content mb-3">
              <FormattedMessage defaultMessage="Associated Simfiles" id="TV0vc/" description="Heading for the associated simfiles section" />
            </h4>
            <div className="space-y-3">
              {chart.simfiles.map((simfileRelation, index) => (
                <div key={index} className="bg-base-200/30 rounded-lg p-3 border border-base-content/10">
                  <div className="flex gap-3">
                    {/* Pack Banner */}
                    <div className="w-50 flex-shrink-0">
                      <Link to={`/pack/${simfileRelation.simfile.pack.id}`} className="block hover:opacity-80 transition-opacity">
                        <BannerImage
                          bannerVariants={simfileRelation.simfile.pack.bannerVariants}
                          mdBannerUrl={simfileRelation.simfile.pack.mdBannerUrl}
                          smBannerUrl={simfileRelation.simfile.pack.smBannerUrl}
                          bannerUrl={simfileRelation.simfile.pack.bannerUrl}
                          alt={`${simfileRelation.simfile.pack.name} pack banner`}
                          className="w-full rounded shadow-md hover:shadow-lg transition-shadow"
                          style={{ aspectRatio: '2.56' }}
                          iconSize={16}
                        />
                      </Link>
                    </div>

                    {/* Content Container */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row gap-3">
                        {/* Small Simfile Banner */}
                        <div className="w-full sm:w-33 flex-shrink-0">
                          <BannerImage
                            bannerVariants={simfileRelation.simfile.bannerVariants}
                            mdBannerUrl={simfileRelation.simfile.mdBannerUrl}
                            smBannerUrl={simfileRelation.simfile.smBannerUrl}
                            bannerUrl={simfileRelation.simfile.bannerUrl}
                            alt={`${simfileRelation.simfile.title} banner`}
                            className="w-full rounded shadow-sm"
                            style={{ aspectRatio: '2.56' }}
                            iconSize={10}
                          />
                        </div>

                        {/* Simfile Info */}
                        <div className="flex-1 min-w-0">
                          <div className="mb-1">
                            <div className="font-medium text-sm text-base-content truncate">{simfileRelation.simfile.title}</div>
                            {simfileRelation.simfile.subtitle && (
                              <div className="text-xs text-base-content/70 truncate">{simfileRelation.simfile.subtitle}</div>
                            )}
                            <div className="text-xs text-base-content/60 truncate">{simfileRelation.simfile.artist}</div>
                          </div>

                          <div className="flex flex-wrap gap-1 mb-1">
                            <DifficultyChip
                              stepsType={simfileRelation.stepsType}
                              difficulty={simfileRelation.difficulty}
                              meter={simfileRelation.meter}
                              size="sm"
                            />
                          </div>

                          <div className="text-xs text-base-content/50">
                            <Link to={`/pack/${simfileRelation.simfile.pack.id}`} className="font-medium hover:text-primary transition-colors">
                              {simfileRelation.simfile.pack.name}
                            </Link>
                            {simfileRelation.credit && <span className="ml-2">{simfileRelation.credit}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface RecentScoresSectionProps {
  chartHash: string;
  initialRecentPlays?: ChartRecentPlay[];
}

const SCORES_FILTER_LS_KEY = 'recentScoresFilter';

type ScoresFilter = 'all' | 'my' | 'rivals' | 'my+rivals';

const RecentScoresSection: React.FC<RecentScoresSectionProps> = ({ chartHash, initialRecentPlays }) => {
  const { activeLeaderboard } = useLeaderboardView();
  const activeTab = activeLeaderboard;
  const { user } = useAuth();
  const storedUser = getStoredUser();
  const rivalIds = useMemo(() => storedUser?.rivalUserIds || [], [storedUser?.rivalUserIds]);
  const { formatNumber, formatMessage } = useIntl();
  const [searchInput, setSearchInput] = useState('');
  const [scoresFilter, setScoresFilter] = useState<ScoresFilter>(() => {
    try {
      const stored = localStorage.getItem(SCORES_FILTER_LS_KEY);
      if (stored === 'all' || stored === 'my' || stored === 'rivals' || stored === 'my+rivals') {
        return stored;
      }
    } catch {}
    return 'all';
  });
  const debouncedSearch = useDebounce(searchInput, 300);

  const { recentPlays, meta, loading, error, setSearch, setPage, setUserIds } = useChartRecentPlays({
    chartHash,
    initialRecentPlays,
  });

  useEffect(() => {
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch]);

  // Build userIds based on filter selection
  useEffect(() => {
    if (!user) {
      setUserIds(undefined);
      return;
    }

    let userIds: string[] | undefined;
    switch (scoresFilter) {
      case 'my':
        userIds = [user.id];
        break;
      case 'rivals':
        userIds = rivalIds.length > 0 ? rivalIds : undefined;
        break;
      case 'my+rivals':
        userIds = [user.id, ...rivalIds];
        break;
      case 'all':
      default:
        userIds = undefined;
    }
    setUserIds(userIds);
  }, [scoresFilter, user, rivalIds, setUserIds]);

  // Persist filter to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SCORES_FILTER_LS_KEY, scoresFilter);
    } catch {}
  }, [scoresFilter]);

  // Derived state for checkboxes
  const showAllScores = scoresFilter === 'all';
  const showMyScores = scoresFilter === 'my' || scoresFilter === 'my+rivals';
  const showRivalsScores = scoresFilter === 'rivals' || scoresFilter === 'my+rivals';

  const handleAllScoresChange = (checked: boolean) => {
    if (checked) {
      setScoresFilter('all');
    }
  };

  const handleMyScoresChange = (checked: boolean) => {
    if (checked) {
      setScoresFilter(showRivalsScores ? 'my+rivals' : 'my');
    } else {
      setScoresFilter(showRivalsScores ? 'rivals' : 'all');
    }
  };

  const handleRivalsScoresChange = (checked: boolean) => {
    if (checked) {
      setScoresFilter(showMyScores ? 'my+rivals' : 'rivals');
    } else {
      setScoresFilter(showMyScores ? 'my' : 'all');
    }
  };

  const filteredScores = recentPlays.filter((score) => score.leaderboards.some((lb) => lb.leaderboard === activeTab));

  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body">
        <h3 className="card-title text-lg mb-4">
          <FormattedMessage defaultMessage="Recent Scores" id="VyKUu+" description="Title for the recent scores section" />
        </h3>

        {/* Global Leaderboard Toggle */}
        <div className="mb-6">
          <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />
        </div>

        {/* Search and Filter Controls */}
        <div className="mb-6 flex flex-col gap-4">
          <div className="relative max-w-md">
            <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50" />
            <input
              type="text"
              placeholder={formatMessage({
                defaultMessage: 'Search by player...',
                id: 'anoRJU',
                description: 'Placeholder text for the search input in the chart recent scores section',
              })}
              className="input input-bordered w-full pl-10 bg-base-100/60 focus:outline-none"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              disabled={!showAllScores}
            />
            {loading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <span className="loading loading-spinner loading-sm"></span>
              </div>
            )}
          </div>
          {user && (
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-sm"
                  checked={showAllScores}
                  onChange={(e) => handleAllScoresChange(e.target.checked)}
                />
                <span className="text-sm">
                  <FormattedMessage defaultMessage="All Scores" id="FbtN0h" description="Toggle to show all scores" />
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-sm"
                  checked={showMyScores}
                  onChange={(e) => handleMyScoresChange(e.target.checked)}
                />
                <span className="text-sm">
                  <FormattedMessage defaultMessage="My Scores" id="H4R3Dg" description="Toggle to show only the current user's scores" />
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-sm"
                  checked={showRivalsScores}
                  onChange={(e) => handleRivalsScoresChange(e.target.checked)}
                  disabled={rivalIds.length === 0}
                />
                <span className={`text-sm ${rivalIds.length === 0 ? 'text-base-content/50' : ''}`}>
                  <FormattedMessage defaultMessage="Rivals' Scores" id="eLMJOK" description="Toggle to show rivals' scores" />
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Scores Table - Desktop */}
        <div className="hidden md:block overflow-x-auto">
          {filteredScores.length > 0 ? (
            <table className="table w-full">
              <thead>
                <tr className="border-base-content/10">
                  <th className="bg-base-200/50 font-semibold text-base-content">
                    <FormattedMessage defaultMessage="Player" id="QTkpuD" description="Table header for the player column" />
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content text-center">
                    <FormattedMessage defaultMessage="Grade" id="VDiUbH" description="Table header for the grade column" />
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content text-center">
                    <FormattedMessage defaultMessage="Score" id="DUbBkQ" description="Table header for the score column" />
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content text-center">
                    <FormattedMessage defaultMessage="Date" id="rbGD0/" description="Table header for the date column" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredScores.map((score, index) => {
                  const leaderboard = score.leaderboards.find((lb) => lb.leaderboard === activeTab);
                  if (!leaderboard) return null;

                  const grade = leaderboard.data.grade;
                  const highlight = computeHighlight(storedUser?.id, rivalIds, score.user.id);
                  return (
                    <tr key={index} className={`hover:brightness-110 transition-colors border-base-content/5 ${highlight.rowGradientClass}`}>
                      <td className="py-4">
                        <Link
                          to={`/user/${score.user.id}`}
                          className={`font-medium hover:text-primary transition-colors inline-flex items-center gap-1 ${highlight.playerTextClass}`}
                        >
                          <HighlightedAlias alias={score.user.alias} highlight={highlight} />
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
                            {formatNumber(parseFloat(leaderboard.data.score) / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Link>
                        ) : (
                          <div className={`font-bold text-lg ${highlight.scoreColorClass}`}>
                            {formatNumber(parseFloat(leaderboard.data.score) / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </td>
                      <td className="py-4 text-center">
                        <div className="text-sm text-base-content/70">
                          <FormattedDate value={new Date(score.createdAt)} year="numeric" month="short" day="numeric" />
                        </div>
                        <div className="text-xs text-base-content/50">
                          <FormattedDate value={new Date(score.createdAt)} hour="2-digit" minute="2-digit" />
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
        <div className="md:hidden space-y-4">
          {filteredScores.length > 0
            ? filteredScores.map((score, index) => {
                const leaderboard = score.leaderboards.find((lb) => lb.leaderboard === activeTab);
                if (!leaderboard) return null;

                const grade = leaderboard.data.grade;
                const highlight = computeHighlight(storedUser?.id, rivalIds, score.user.id);
                return (
                  <div key={index} className={`rounded-lg p-4 border border-base-content/10 ${highlight.rowGradientClass || 'bg-base-200/30'}`}>
                    {/* Score, Player and Date Info */}
                    <div className="space-y-2">
                      {/* Player and Score */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-base-content/60">
                            <GradeImage grade={grade} className="w-8 h-8 object-contain" />
                          </div>
                          <div className={`font-medium text-sm ${highlight.playerTextClass}`}>
                            <Link
                              to={`/user/${score.user.id}`}
                              className={`hover:text-primary transition-colors inline-flex items-center gap-1 ${highlight.playerTextClass}`}
                            >
                              <HighlightedAlias alias={score.user.alias} highlight={highlight} />
                            </Link>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-base-content/60">
                            <FormattedMessage defaultMessage="Score" id="oGL1Ha" description="label for the score a user earned on a particular chart" />
                          </div>
                          {typeof score.playId === 'number' ? (
                            <Link to={`/play/${score.playId}`} className={`font-bold text-lg ${highlight.scoreColorClass}`}>
                              {formatNumber(parseFloat(leaderboard.data.score) / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Link>
                          ) : (
                            <div className={`font-bold text-lg ${highlight.scoreColorClass}`}>
                              {formatNumber(parseFloat(leaderboard.data.score) / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
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
                            <FormattedDate value={new Date(score.createdAt)} year="numeric" month="short" day="numeric" />
                          </span>
                          <span className="text-base-content/50 ml-2">
                            <FormattedDate value={new Date(score.createdAt)} hour="2-digit" minute="2-digit" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            : null}
        </div>

        {/* Error message */}
        {error && (
          <Alert variant="error">
            <FormattedMessage defaultMessage="Failed to load recent scores" id="Lgs0xB" description="Error message when recent scores fail to load" />
          </Alert>
        )}

        {/* No scores message */}
        {!loading && !error && filteredScores.length === 0 && (
          <div className="text-center py-12 text-base-content/50">
            <Award size={48} className="mx-auto mb-4 text-base-content/30" />
            <div className="text-lg font-medium mb-2">
              <FormattedMessage defaultMessage="No recent scores" id="nWbnaE" description="Message displayed when there are no recent scores" />
            </div>
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && recentPlays.length > 0 && meta && (
          <div className="mt-6">
            <Pagination meta={meta} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
};

const LeaderboardSection: React.FC<{
  chartHash: string;
  initialData?: ChartLeaderboardResponse | null;
}> = ({ chartHash, initialData = null }) => {
  const [leaderboards, setLeaderboards] = useState<ChartLeaderboardResponse | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const { activeLeaderboard: globalLb } = useLeaderboardView();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPage = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
  const [page, setPage] = useState<number>(initialPage);
  const { formatNumber } = useIntl();

  // Keep URL in sync when page changes
  useEffect(() => {
    const current = searchParams.get('page');
    const next = String(page);
    if (current !== next) {
      const sp = new URLSearchParams(searchParams);
      if (page > 1) sp.set('page', next);
      else sp.delete('page');
      setSearchParams(sp, { replace: true });
    }
  }, [page]);

  const storedUser = getStoredUser();
  const rivalIds: string[] = storedUser?.rivalUserIds || [];
  // activeTab state removed; using global context selection instead

  useEffect(() => {
    // If we have initial data and we're on page 1, don't fetch
    if (initialData && page === 1) {
      setLeaderboards(initialData);
      setLoading(false);
      return;
    }

    const fetchLeaderboards = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getChartLeaderboards(chartHash, page);
        setLeaderboards(data);
      } catch (err) {
        console.error('Error fetching leaderboards:', err);
        setError(err instanceof Error ? err.message : 'Failed to load leaderboards');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboards();
  }, [chartHash, page, initialData]);

  if (loading) {
    return (
      <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
        <div className="card-body">
          <h3 className="card-title text-lg mb-4">
            <FormattedMessage defaultMessage="Leaderboards" id="9tw8mS" description="Heading for the leaderboards section" />
          </h3>
          <div className="flex justify-center items-center py-12">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
        <div className="card-body">
          <h3 className="card-title text-lg mb-4">
            <FormattedMessage defaultMessage="Leaderboards" id="9tw8mS" description="Heading for the leaderboards section" />
          </h3>
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        </div>
      </div>
    );
  }

  if (!leaderboards) {
    return null;
  }

  const activeLeaderboard = leaderboards.leaderboards.find((lb) => lb.type === globalLb);
  const activePage = typeof activeLeaderboard?.page === 'number' ? activeLeaderboard.page : page;
  const hasNext = !!activeLeaderboard?.hasNext;

  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body">
        <h3 className="card-title text-lg mb-4 flex items-center gap-2">
          <Trophy size={20} className="text-primary" />
          <FormattedMessage defaultMessage="Leaderboards" id="9tw8mS" description="Heading for the leaderboards section" />
        </h3>

        <div className="mb-6">
          <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />
        </div>

        {/* Leaderboard Table - Desktop */}
        <div className="hidden md:block overflow-x-auto">
          {activeLeaderboard && activeLeaderboard.scores.length > 0 ? (
            <table className="table w-full">
              <thead>
                <tr className="border-base-content/10">
                  <th className="bg-base-200/50 font-semibold text-base-content text-center">
                    <FormattedMessage defaultMessage="Rank" id="Bt+/uG" description="Table header for the rank column" />
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content">
                    <FormattedMessage defaultMessage="Player" id="QTkpuD" description="Table header for the player column" />
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content text-center">
                    <FormattedMessage defaultMessage="Grade" id="VDiUbH" description="Table header for the grade column" />
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content text-center">
                    <FormattedMessage defaultMessage="Score" id="DUbBkQ" description="Table header for the score column" />
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content text-center">
                    <FormattedMessage defaultMessage="Date" id="rbGD0/" description="Table header for the date column" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeLeaderboard.scores.map((score, index) => {
                  const highlight = computeHighlight(storedUser?.id, rivalIds, score.userId);
                  return (
                    <tr key={index} className={`hover:brightness-110 transition-colors border-base-content/5 ${highlight.rowGradientClass}`}>
                      <td className="py-4 text-center">
                        <div className={`font-bold text-lg ${highlight.rankColorClass}`}>
                          <FormattedMessage
                            defaultMessage="#{rank,number}"
                            id="tn3SH1"
                            description="stat indicating a user's overall rank in an event"
                            values={{ rank: score.rank }}
                          />
                        </div>
                      </td>
                      <td className="py-4">
                        <Link
                          to={`/user/${score.userId}`}
                          className={`font-medium hover:text-primary transition-colors inline-flex items-center gap-1 ${highlight.playerTextClass}`}
                        >
                          <HighlightedAlias alias={score.alias} highlight={highlight} />
                        </Link>
                      </td>
                      <td className="py-4 text-center">
                        <div className="flex items-center justify-center">
                          <GradeImage grade={score.grade} className="w-8 h-8 object-contain" />
                        </div>
                      </td>
                      <td className="py-4 text-center">
                        {typeof (score as any).playId === 'number' ? (
                          <Link to={`/play/${(score as any).playId}`} className={`font-bold text-lg ${highlight.scoreColorClass}`}>
                            {formatNumber(parseFloat(score.score) / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Link>
                        ) : (
                          <div className={`font-bold text-lg ${highlight.scoreColorClass}`}>
                            {formatNumber(parseFloat(score.score) / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </td>
                      <td className="py-4 text-center">
                        <div className="text-sm text-base-content/70">
                          <FormattedDate value={new Date(score.date)} month="short" day="numeric" year="numeric" />
                        </div>
                        <div className="text-xs text-base-content/50">
                          <FormattedDate value={new Date(score.date)} hour="2-digit" minute="2-digit" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>

        {/* Leaderboard Cards - Mobile */}
        <div className="md:hidden space-y-4">
          {activeLeaderboard && activeLeaderboard.scores.length > 0
            ? activeLeaderboard.scores.map((score, index) => {
                const highlight = computeHighlight(storedUser?.id, rivalIds, score.userId);
                return (
                  <div key={index} className={`rounded-lg p-4 border border-base-content/10 ${highlight.rowGradientClass || 'bg-base-200/30'}`}>
                    <div className="space-y-2">
                      {/* Rank and Score */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-base-content/60">
                            <FormattedMessage defaultMessage="Rank" id="HO0K0o" description="Label for the rank of a score" />
                          </div>
                          <div className={`font-bold text-lg ${highlight.rankColorClass}`}>
                            <FormattedMessage
                              defaultMessage="#{rank,number}"
                              id="dQfrc/"
                              values={{ rank: score.rank }}
                              description="stat indicating a user's rank"
                            />
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-base-content/60">
                            <FormattedMessage defaultMessage="Score" id="8+OFcD" description="Label for the score of a score" />
                          </div>
                          {typeof (score as any).playId === 'number' ? (
                            <Link to={`/play/${(score as any).playId}`} className={`font-bold text-lg ${highlight.scoreColorClass}`}>
                              {formatNumber(parseFloat(score.score) / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Link>
                          ) : (
                            <div className={`font-bold text-lg ${highlight.scoreColorClass}`}>
                              {formatNumber(parseFloat(score.score) / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Player and Grade */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-base-content/60">
                            <FormattedMessage defaultMessage="Player" id="iZ8ydz" description="Label for the player of a score" />
                          </div>
                          <Link
                            to={`/user/${score.userId}`}
                            className={`font-medium text-sm hover:text-primary transition-colors inline-flex items-center gap-1 ${highlight.playerTextClass}`}
                          >
                            <HighlightedAlias alias={score.alias} highlight={highlight} />
                          </Link>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-base-content/60">
                            <FormattedMessage defaultMessage="Grade" id="C4dqyM" description="Label for the grade of a score" />
                          </div>
                          <div className="flex justify-end">
                            <GradeImage grade={score.grade} className="w-8 h-8 object-contain" />
                          </div>
                        </div>
                      </div>

                      {/* Date */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-base-content/60">
                            <FormattedMessage defaultMessage="Date" id="byn6nd" description="Label for the date of a score" />
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-base-content/70">
                            <FormattedDate value={new Date(score.date)} year="numeric" month="short" day="numeric" />
                            <span className="text-base-content/50 ml-2">
                              <FormattedDate value={new Date(score.date)} hour="2-digit" minute="2-digit" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            : null}
        </div>

        {/* No scores message */}
        {!activeLeaderboard || activeLeaderboard.scores.length === 0 ? (
          <div className="text-center py-12 text-base-content/50">
            <Trophy size={48} className="mx-auto mb-4 text-base-content/30" />
            <div className="text-lg font-medium mb-2">
              <FormattedMessage defaultMessage="No scores yet" id="VOJppc" description="Message displayed when there are no scores for a chart" />
            </div>
            <div className="text-sm">
              <FormattedMessage
                defaultMessage="Be the first to set a score on this chart!"
                id="Zs0LJZ"
                description="Encouragement message when no scores exist for a chart"
              />
            </div>
          </div>
        ) : null}

        {/* Pagination Controls - unified component */}
        {activeLeaderboard && activeLeaderboard.scores.length > 0 ? (
          <Pagination
            meta={{
              page: activePage,
              limit: activeLeaderboard.perPage ?? 25,
              total: activeLeaderboard.total ?? activePage * (activeLeaderboard.perPage ?? 25),
              totalPages: activeLeaderboard.totalPages ?? activePage + (hasNext ? 1 : 0),
              hasNextPage: hasNext,
              hasPreviousPage: activePage > 1,
            }}
            onPageChange={(p) => setPage(Math.max(1, p))}
          />
        ) : null}
      </div>
    </div>
  );
};

const BlueShiftLeaderboardSection: React.FC<{
  blueShiftLeaderboards?: ChartLeaderboardResponse['blueShiftLeaderboards'];
}> = ({ blueShiftLeaderboards }) => {
  const { activeLeaderboard } = useLeaderboardView();
  const { hasPermission } = useAuth();
  const { formatNumber } = useIntl();
  const { formatMessage } = useIntl();
  const storedUser = getStoredUser();
  const rivalIds: string[] = storedUser?.rivalUserIds || [];

  // Check for preview permission or if Phase 1 has started
  if (!isPhase1Active() && !hasPermission('blue-shift.preview')) {
    return null;
  }

  if (!blueShiftLeaderboards || Object.keys(blueShiftLeaderboards).length === 0) {
    return null;
  }

  // Dynamically map active leaderboard to blue shift leaderboard name
  // Try to find any phase's leaderboard matching the active type
  const leaderboardMapping: { [key: string]: string } = {};
  const availableKeys = Object.keys(blueShiftLeaderboards);

  // For each standard leaderboard type, find a matching Blue Shift leaderboard
  if (activeLeaderboard === 'HardEX') {
    leaderboardMapping['HardEX'] = availableKeys.find((k) => k.includes('HardEX')) || '';
  } else if (activeLeaderboard === 'EX') {
    leaderboardMapping['EX'] = availableKeys.find((k) => k.includes(' EX') && !k.includes('HardEX')) || '';
  } else if (activeLeaderboard === 'ITG' || activeLeaderboard === 'Money') {
    const moneyKey = availableKeys.find((k) => k.includes('Money')) || '';
    leaderboardMapping['ITG'] = moneyKey;
    leaderboardMapping['Money'] = moneyKey;
  }

  const selectedLeaderboardType = leaderboardMapping[activeLeaderboard] || availableKeys[0];
  const selectedLeaderboard = blueShiftLeaderboards[selectedLeaderboardType];

  if (!selectedLeaderboard?.scores || selectedLeaderboard.scores.length === 0) {
    return null;
  }

  const displayScores = selectedLeaderboard.scores;

  return (
    <InteractiveCard>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <img
              src="https://assets.arrowcloud.dance/logos/20250725/blue shift-t big.png"
              alt={formatMessage({ defaultMessage: 'Blue Shift', id: 'M/hUW7', description: 'Alt text for the Blue Shift logo' })}
              className="w-48 h-auto object-contain"
            />
          </div>
          <div className="flex items-center gap-3">
            <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />
          </div>
        </div>

        <div className="max-h-[600px] overflow-y-auto space-y-3 pr-2">
          {displayScores.map((entry) => {
            const highlight = computeHighlight(storedUser?.id, rivalIds, entry.userId);

            return (
              <div
                key={entry.userId}
                className={`flex items-center justify-between p-3 rounded-lg ${highlight.rowGradientClass || 'bg-base-200/30 hover:bg-base-200/50'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 min-w-[2rem]">
                    <span className="text-sm font-mono text-base-content/60">
                      <FormattedMessage defaultMessage="#{rank,number}" id="dQfrc/" description="stat indicating a user's rank" values={{ rank: entry.rank }} />
                    </span>
                  </div>
                  <Link
                    to={`/user/${entry.userId}`}
                    className={`font-medium hover:text-primary transition-colors inline-flex items-center gap-1 ${highlight.playerTextClass}`}
                  >
                    <HighlightedAlias alias={entry.alias} highlight={highlight} />
                  </Link>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div className="flex items-center gap-2">
                    <GradeImage grade={entry.grade} className="w-6 h-6" />
                    {entry.playId ? (
                      <Link
                        to={`/play/${entry.playId}`}
                        className={`font-bold text-lg ${highlight.scoreColorClass || 'text-base-content hover:text-primary transition-colors'}`}
                      >
                        {formatNumber(parseFloat(entry.score.replace(/,/g, '')) / 100, {
                          style: 'percent',
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Link>
                    ) : (
                      <span className={`font-bold text-lg ${highlight.scoreColorClass || 'text-base-content'}`}>
                        {formatNumber(parseFloat(entry.score.replace(/,/g, '')) / 100, {
                          style: 'percent',
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 pl-4">
                    <div className="px-2 py-1 rounded-md bg-secondary/10">
                      <span className="text-lg font-bold text-secondary">{entry.points.toLocaleString()}</span>
                      <span className="text-xs ml-1 text-secondary/70">
                        <FormattedMessage defaultMessage="pts" id="4XbcYZ" description="Abbreviation for points" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </InteractiveCard>
  );
};

const LeaderboardSectionWithBlueShift: React.FC<{ chartHash: string }> = ({ chartHash }) => {
  const [leaderboards, setLeaderboards] = useState<ChartLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaderboards = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getChartLeaderboards(chartHash, 1);
        setLeaderboards(data);
      } catch (err) {
        console.error('Error fetching leaderboards:', err);
        setError(err instanceof Error ? err.message : 'Failed to load leaderboards');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboards();
  }, [chartHash]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
          <div className="card-body">
            <h3 className="card-title text-lg mb-4">
              <FormattedMessage defaultMessage="Leaderboards" id="bb7dGv" description="Title for the leaderboards section" />
            </h3>
            <div className="flex justify-center items-center py-12">
              <Loader2 size={32} className="animate-spin text-primary" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
          <div className="card-body">
            <h3 className="card-title text-lg mb-4">
              <FormattedMessage defaultMessage="Leaderboards" id="bb7dGv" description="Title for the leaderboards section" />
            </h3>
            <Alert variant="error" className="mb-4">
              {error}
            </Alert>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Blue Shift Leaderboards - Show first if available */}
      {leaderboards?.blueShiftLeaderboards && <BlueShiftLeaderboardSection blueShiftLeaderboards={leaderboards.blueShiftLeaderboards} />}

      {/* Regular Leaderboards - Pass data to avoid duplicate fetch */}
      <LeaderboardSection chartHash={chartHash} initialData={leaderboards} />
    </div>
  );
};

export const ChartPage: React.FC = () => {
  const { chartHash } = useParams<{ chartHash: string }>();
  const [chart, setChart] = useState<ApiChartDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChart = async () => {
      if (!chartHash) {
        setError('Chart hash is required');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const chartData = await getChart(chartHash);
        setChart(chartData);
      } catch (err) {
        console.error('Error fetching chart:', err);
        setError(err instanceof Error ? err.message : 'Failed to load chart');
      } finally {
        setLoading(false);
      }
    };

    fetchChart();
  }, [chartHash]);

  if (loading) {
    return (
      <AppPageLayout accent="accent">
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-center items-center py-20">
            <Loader2 size={48} className="animate-spin text-primary" />
          </div>
        </div>
      </AppPageLayout>
    );
  }

  if (error) {
    return (
      <AppPageLayout accent="accent">
        <div className="container mx-auto px-4 py-8">
          <Alert variant="error" className="mb-8">
            {error}
          </Alert>
        </div>
      </AppPageLayout>
    );
  }

  if (!chart) {
    return (
      <AppPageLayout accent="accent">
        <div className="container mx-auto px-4 py-8">
          <Alert variant="error" className="mb-8">
            <FormattedMessage defaultMessage="Chart not found" id="fpEyF4" description="Error message when a chart is not found" />
          </Alert>
        </div>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout accent="accent">
      <div className="container mx-auto px-4">
        <div className="space-y-8 my-8">
          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column - Chart Info */}
            <div>
              <ChartMetadataCard chart={chart} />
            </div>

            {/* Right Column - Recent Scores */}
            <div>
              <RecentScoresSection chartHash={chart.hash} initialRecentPlays={chart.recentPlays} />
            </div>
          </div>

          {/* Leaderboard Section - Full Width */}
          <LeaderboardSectionWithBlueShift chartHash={chart.hash} />
        </div>
      </div>
    </AppPageLayout>
  );
};
