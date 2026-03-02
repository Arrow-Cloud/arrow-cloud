import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Calendar, Music, Loader2, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { getStoredUser, computeHighlight, HighlightedAlias } from '../../utils/rivalHighlight';
import { AppPageLayout, Alert, Pagination, GradeImage, DifficultyChip } from '../../components';
import { LeaderboardToggle } from '../../components/leaderboards/LeaderboardToggle';
import { useLeaderboardView } from '../../contexts/LeaderboardViewContext';
import { BannerImage } from '../../components/ui';
import { getPack } from '../../services/api';
import { PackDetails as ApiPackDetails, SimfileListItem } from '../../schemas/apiSchemas';
import { useSimfileList, useDebounce, usePackRecentPlays } from '../../hooks';
import { FormattedDate, FormattedMessage, FormattedNumber, useIntl } from 'react-intl';

interface Chart {
  hash: string;
  stepsType: string | null;
  difficulty?: string | null;
  meter: number | null;
  simfile: {
    bannerUrl: string | null;
    mdBannerUrl?: string | null;
    smBannerUrl?: string | null;
    bannerVariants?: any;
    title: string;
    artist: string;
  };
}

const PackMetadataCard: React.FC<{ pack: ApiPackDetails }> = ({ pack }) => {
  const { formatDate } = useIntl();

  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body">
        <div className="mb-4">
          <BannerImage
            bannerVariants={pack.bannerVariants}
            mdBannerUrl={pack.mdBannerUrl}
            smBannerUrl={pack.smBannerUrl}
            bannerUrl={pack.bannerUrl}
            alt={`${pack.name} banner`}
            className="w-full rounded-lg shadow-lg"
            style={{ aspectRatio: '2.56' }}
            sizePreference="original"
          />
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-base-content/60" />
            <span>
              <FormattedMessage
                defaultMessage="Added: {date}"
                id="TeiEDu"
                description="Label for the date a pack was added"
                values={{ date: <span className="font-medium">{formatDate(new Date(pack.createdAt))}</span> }}
              />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ChartDisplayProps {
  chart: Chart;
}

const ChartDisplay: React.FC<ChartDisplayProps> = ({ chart }) => {
  return (
    <Link to={`/chart/${chart.hash}`} className="block hover:bg-base-100/20 -m-2 p-2 rounded transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <BannerImage
          bannerVariants={chart.simfile.bannerVariants}
          mdBannerUrl={chart.simfile.mdBannerUrl}
          smBannerUrl={chart.simfile.smBannerUrl}
          bannerUrl={chart.simfile.bannerUrl}
          alt={`${chart.simfile.title} banner`}
          className="w-[128px] object-cover rounded shadow-sm"
          style={{ aspectRatio: '2.56' }}
          iconSize={16}
        />
        <div className="flex-1">
          <div className="font-medium text-base-content">{chart.simfile.title}</div>
          <div className="text-sm text-base-content/60">{chart.simfile.artist}</div>
          <div className="flex items-center gap-2 mt-1">
            <DifficultyChip stepsType={chart.stepsType} difficulty={chart.difficulty} meter={chart.meter} size="sm" />
          </div>
        </div>
      </div>
    </Link>
  );
};

interface RecentScoresSectionProps {
  packId: number;
}

const RecentScoresSection: React.FC<RecentScoresSectionProps> = ({ packId }) => {
  const { activeLeaderboard } = useLeaderboardView();
  const activeTab = activeLeaderboard;
  const storedUser = getStoredUser();
  const rivalIds: string[] = storedUser?.rivalUserIds || [];
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);
  const { formatMessage } = useIntl();

  const { recentPlays, meta, loading, error, setSearch, setPage } = usePackRecentPlays({ packId });

  useEffect(() => {
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch]);

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

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50" />
            <input
              type="text"
              placeholder={formatMessage({
                defaultMessage: 'Search by song, artist, or player...',
                id: 'AxjkbD',
                description: 'Placeholder text for the search input in the recent scores section',
              })}
              className="input input-bordered w-full pl-10 bg-base-100/60 focus:outline-none"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {loading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <span className="loading loading-spinner loading-sm"></span>
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
                    <FormattedMessage defaultMessage="Chart" id="PGAlRw" description="Table header for the chart column" />
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
                {filteredScores.map((score, index) => {
                  const leaderboard = score.leaderboards.find((lb) => lb.leaderboard === activeTab);
                  if (!leaderboard) return null;

                  const grade = leaderboard.data.grade;
                  const highlight = computeHighlight(storedUser?.id, rivalIds, score.user.id);
                  return (
                    <tr key={index} className={`hover:brightness-110 transition-colors border-base-content/5 ${highlight.rowGradientClass}`}>
                      <td className="py-4">
                        <ChartDisplay
                          chart={{
                            hash: score.chart.hash,
                            stepsType: score.chart.stepsType,
                            difficulty: score.chart.difficulty,
                            meter: score.chart.meter,
                            simfile: {
                              bannerUrl: score.chart.bannerUrl,
                              bannerVariants: score.chart.bannerVariants,
                              smBannerUrl: score.chart.smBannerUrl,
                              mdBannerUrl: score.chart.mdBannerUrl,
                              title: score.chart.title,
                              artist: score.chart.artist,
                            },
                          }}
                        />
                      </td>
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
                            <FormattedNumber
                              value={parseFloat(leaderboard.data.score) / 100}
                              style="percent"
                              minimumFractionDigits={2}
                              maximumFractionDigits={2}
                            />
                          </Link>
                        ) : (
                          <div className={`font-bold text-lg ${highlight.scoreColorClass}`}>
                            <FormattedNumber
                              value={parseFloat(leaderboard.data.score) / 100}
                              style="percent"
                              minimumFractionDigits={2}
                              maximumFractionDigits={2}
                            />
                          </div>
                        )}
                      </td>
                      <td className="py-4 text-center">
                        <div className="text-sm text-base-content/70">
                          <FormattedDate value={new Date(score.createdAt)} month="short" day="numeric" year="numeric" />
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
                          className="w-full object-contain rounded shadow-sm"
                          style={{ aspectRatio: '2.56', minHeight: '3rem' }}
                          iconSize={20}
                        />
                      </div>

                      {/* Title and Artist */}
                      <div className="mb-2">
                        <div className="font-medium text-base-content text-sm truncate">{score.chart.title}</div>
                        <div className="text-xs text-base-content/60 truncate">{score.chart.artist}</div>
                      </div>

                      {/* Difficulty Badge */}
                      <div>
                        <DifficultyChip stepsType={score.chart.stepsType} difficulty={score.chart.difficulty} meter={score.chart.meter} size="sm" />
                      </div>
                    </Link>

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
                              <FormattedNumber
                                value={parseFloat(leaderboard.data.score) / 100}
                                style="percent"
                                minimumFractionDigits={2}
                                maximumFractionDigits={2}
                              />
                            </Link>
                          ) : (
                            <div className={`font-bold text-lg ${highlight.scoreColorClass}`}>
                              <FormattedNumber
                                value={parseFloat(leaderboard.data.score) / 100}
                                style="percent"
                                minimumFractionDigits={2}
                                maximumFractionDigits={2}
                              />
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
                            <FormattedDate value={new Date(score.createdAt)} year="numeric" month="short" day="2-digit" />
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
          <div className="alert alert-error mb-4">
            <span>
              <FormattedMessage
                defaultMessage="Error loading recent scores: {error}"
                id="GVb3Zo"
                description="Error message displayed when recent scores fail to load"
                values={{ error }}
              />
            </span>
          </div>
        )}

        {/* No scores message */}
        {!loading && !error && filteredScores.length === 0 && (
          <div className="text-center py-12 text-base-content/50">
            <Music size={48} className="mx-auto mb-4 text-base-content/30" />
            <div className="text-lg font-medium mb-2">
              <FormattedMessage defaultMessage="No recent scores" id="nWbnaE" description="Message displayed when there are no recent scores" />
            </div>
          </div>
        )}

        {/* Pagination */}
        {meta && <Pagination meta={meta} onPageChange={setPage} />}
      </div>
    </div>
  );
};

interface SimfileTableHeaderProps {
  label: string;
  sortKey: string;
  currentOrderBy: string;
  currentDirection: 'asc' | 'desc';
  onSort: (orderBy: string, direction: 'asc' | 'desc') => void;
}

const SimfileTableHeader: React.FC<SimfileTableHeaderProps> = ({ label, sortKey, currentOrderBy, currentDirection, onSort }) => {
  const isActive = currentOrderBy === sortKey;
  const nextDirection = isActive && currentDirection === 'asc' ? 'desc' : 'asc';

  return (
    <th className="cursor-pointer hover:bg-base-300/50 transition-colors select-none px-4 py-3" onClick={() => onSort(sortKey, nextDirection)}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-base-content">{label}</span>
        <div className="flex flex-col">
          <ChevronUp size={12} className={`${isActive && currentDirection === 'asc' ? 'text-primary' : 'text-base-content/30'}`} />
          <ChevronDown size={12} className={`${isActive && currentDirection === 'desc' ? 'text-primary' : 'text-base-content/30'} -mt-1`} />
        </div>
      </div>
    </th>
  );
};

interface SimfileRowProps {
  simfile: SimfileListItem;
}

const LinkedDifficultyChip: React.FC<{ chart: { hash: string; stepsType: string | null; difficulty: string | null; meter: number | null } }> = ({ chart }) => {
  return (
    <Link to={`/chart/${chart.hash}`} className="inline-block mr-1 hover:opacity-80 transition-opacity duration-200">
      <DifficultyChip stepsType={chart.stepsType} difficulty={chart.difficulty} meter={chart.meter} size="sm" />
    </Link>
  );
};

const SimfileRow: React.FC<SimfileRowProps> = ({ simfile }) => {
  const orderedDifficulties = simfile.charts.sort((a, b) => {
    const difficultyOrder = ['beginner', 'easy', 'medium', 'hard', 'challenge', 'edit'];
    const aDifficulty = a.difficulty?.toLowerCase() || 'unknown';
    const bDifficulty = b.difficulty?.toLowerCase() || 'unknown';
    return difficultyOrder.indexOf(aDifficulty) - difficultyOrder.indexOf(bDifficulty);
  });

  return (
    <tr className="hover:bg-base-200/50 transition-colors">
      <td className="px-4 py-5">
        <div className="flex items-center gap-4">
          <BannerImage
            bannerVariants={simfile.bannerVariants}
            mdBannerUrl={simfile.mdBannerUrl}
            smBannerUrl={simfile.smBannerUrl}
            bannerUrl={simfile.bannerUrl}
            alt={`${simfile.title} banner`}
            className="w-[128px] object-cover rounded-lg shadow-sm"
            style={{ aspectRatio: '2.56' }}
            iconSize={16}
          />
          <div className="flex-1">
            <div className="font-medium text-base-content text-lg">{simfile.title}</div>
            {simfile.subtitle && <div className="text-sm text-base-content/60">{simfile.subtitle}</div>}
          </div>
        </div>
      </td>
      <td className="px-4 py-5">
        <span className="font-medium text-base-content">{simfile.artist}</span>
      </td>
      <td className="px-4 py-5 text-center">
        {orderedDifficulties.map((chart, index) => (
          <LinkedDifficultyChip key={index} chart={chart} />
        ))}
      </td>
    </tr>
  );
};

interface SimfilesTableProps {
  packId: number;
}

const SimfilesTable: React.FC<SimfilesTableProps> = React.memo(({ packId }) => {
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);
  const [searchCallCounter, setSearchCallCounter] = useState(0);
  const { formatMessage } = useIntl();

  const { simfiles, meta, filters, loading, error, setSearch, setOrderBy, setOrderDirection, setPage } = useSimfileList({ packId });

  useEffect(() => {
    // Skip the initial render when search is empty to avoid a redundant API call
    if (debouncedSearch.trim() === '' && searchCallCounter === 0) {
      setSearchCallCounter((prev) => prev + 1);
      return;
    }
    setSearch(debouncedSearch);
  }, [debouncedSearch]);

  const handleSort = (orderBy: string, direction: 'asc' | 'desc') => {
    setOrderBy(orderBy);
    setOrderDirection(direction);
  };

  if (error) {
    return (
      <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
        <div className="card-body">
          <div className="alert alert-error">
            <span>
              <FormattedMessage
                defaultMessage="Error loading simfiles: {error}"
                id="AL/as5"
                description="Error message displayed when simfiles fail to load"
                values={{ error }}
              />
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
      <div className="card-body">
        <h3 className="card-title text-xl mb-6">
          <FormattedMessage defaultMessage="Simfiles" id="1y8iSP" description="Title for the simfiles section" />
        </h3>

        {/* Search and Filters */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative flex-grow max-w-md">
              <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50" />
              <input
                type="text"
                placeholder={formatMessage({
                  defaultMessage: 'Search songs...',
                  id: 'DNaobF',
                  description: 'Placeholder text for the search input in the simfiles table',
                })}
                className="input input-bordered w-full pl-10 bg-base-100/60 focus:outline-none"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              {loading && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <span className="loading loading-spinner loading-sm"></span>
                </div>
              )}
            </div>

            {meta && (
              <div className="text-sm text-base-content/70">
                <FormattedMessage
                  defaultMessage="Showing {shown,number} of {total,number} songs"
                  id="FaknjP"
                  description="Shows the number of songs displayed out of the total"
                  values={{ shown: simfiles.length, total: meta.total }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg">
          <table className="table table-zebra w-full bg-base-100 border border-base-content/10">
            <thead className="bg-base-200/80">
              <tr>
                <SimfileTableHeader
                  label={formatMessage({ defaultMessage: 'Title', id: 'YhyBsx', description: 'Label for the title column in the simfiles table' })}
                  sortKey="title"
                  currentOrderBy={filters?.orderBy || 'title'}
                  currentDirection={(filters?.orderDirection as 'asc' | 'desc') || 'asc'}
                  onSort={handleSort}
                />
                <SimfileTableHeader
                  label={formatMessage({ defaultMessage: 'Artist', id: 'KCXDwp', description: 'Label for the artist column in the simfiles table' })}
                  sortKey="artist"
                  currentOrderBy={filters?.orderBy || 'title'}
                  currentDirection={(filters?.orderDirection as 'asc' | 'desc') || 'asc'}
                  onSort={handleSort}
                />
                <th className="px-4 py-3 text-center">
                  <span className="font-semibold text-base-content">
                    <FormattedMessage defaultMessage="Charts" id="VARle9" description="Label for the charts column in the simfiles table" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className={loading ? 'opacity-50' : ''}>
              {simfiles.length === 0 && !loading ? (
                <tr>
                  <td colSpan={3} className="text-center py-12 text-base-content/50">
                    {filters?.search ? (
                      <FormattedMessage defaultMessage="No songs found" id="xl7GRC" description="Message displayed when no songs match the search query" />
                    ) : (
                      <FormattedMessage
                        defaultMessage="No songs available in this pack"
                        id="6mzOc6"
                        description="Message displayed when there are no songs in the pack"
                      />
                    )}
                  </td>
                </tr>
              ) : (
                simfiles.map((simfile) => <SimfileRow key={simfile.id} simfile={simfile} />)
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && <Pagination meta={meta} onPageChange={setPage} />}
      </div>
    </div>
  );
});

export const PackPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [pack, setPack] = useState<ApiPackDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { formatMessage } = useIntl();

  useEffect(() => {
    const fetchPackData = async () => {
      if (!id) {
        setError('Pack ID is required');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const packId = parseInt(id, 10);
        if (isNaN(packId)) {
          setError('Invalid pack ID');
          setLoading(false);
          return;
        }

        const packData = await getPack(packId);
        setPack(packData);
      } catch (err) {
        console.error('Failed to fetch pack data:', err);
        setError(
          err instanceof Error
            ? err.message
            : formatMessage({ defaultMessage: 'Failed to load pack data', id: 'ieFeXy', description: 'Error message displayed when pack data fails to load' }),
        );
      } finally {
        setLoading(false);
      }
    };

    fetchPackData();
  }, [id, formatMessage]);

  if (loading) {
    return (
      <AppPageLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-96">
            <div className="text-center">
              <Loader2 size={48} className="mx-auto mb-4 text-primary animate-spin" />
              <div className="text-lg font-medium mb-2">
                <FormattedMessage defaultMessage="Loading pack..." id="66nTwC" description="Message displayed while the pack data is loading" />
              </div>
              <div className="text-sm text-base-content/60">
                <FormattedMessage
                  defaultMessage="Please wait while we fetch the pack data"
                  id="+h2LEI"
                  description="Message displayed while waiting for the pack data to load"
                />
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
        <div className="container mx-auto px-4 py-8">
          <Alert variant="error" className="mb-8">
            {error}
          </Alert>
        </div>
      </AppPageLayout>
    );
  }

  if (!pack) {
    return (
      <AppPageLayout>
        <div className="container mx-auto px-4 py-8">
          <Alert variant="error" className="mb-8">
            <FormattedMessage defaultMessage="Pack not found" id="sL/xaE" description="Message displayed when the pack is not found" />
          </Alert>
        </div>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout>
      <div className="container mx-auto px-4 py-20">
        {/* Header with Pack Banner */}
        <div className="text-center my-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">{pack.name}</h1>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Pack Metadata */}
          <div className="lg:col-span-1">
            <PackMetadataCard pack={pack} />
          </div>

          {/* Right Column - Recent Scores */}
          <div className="lg:col-span-2">
            <RecentScoresSection packId={pack.id} />
          </div>
        </div>

        {/* Simfiles Table - Full Width */}
        <div className="mt-6">
          <SimfilesTable packId={pack.id} />
        </div>
      </div>
    </AppPageLayout>
  );
};
