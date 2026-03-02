import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronUp, ChevronDown, Filter, X } from 'lucide-react';
import { useChartList, useDebounce } from '../../hooks';
import { ChartListItem } from '../../schemas/apiSchemas';
import { AppPageLayout, Pagination, DifficultyChip } from '../../components';
import { BannerImage } from '../../components/ui';
import { FormattedDate, FormattedMessage, useIntl } from 'react-intl';

interface ChartTableHeaderProps {
  label: string;
  sortKey: string;
  currentOrderBy: string;
  currentDirection: 'asc' | 'desc';
  onSort: (orderBy: string, direction: 'asc' | 'desc') => void;
}

const ChartTableHeader: React.FC<ChartTableHeaderProps> = ({ label, sortKey, currentOrderBy, currentDirection, onSort }) => {
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

interface ChartRowProps {
  chart: ChartListItem;
  onClick: (chartHash: string) => void;
}

const ChartRow: React.FC<ChartRowProps> = ({ chart, onClick }) => {
  const navigate = useNavigate();
  const title = chart.songName || 'Unknown Title';
  const artist = chart.artist || 'Unknown Artist';

  // Get all unique packs from simfiles, filtering out nulls
  const packs = chart.simfiles
    .map((simfile) => simfile.pack)
    .filter((pack): pack is NonNullable<typeof pack> => pack !== null)
    .filter((pack, index, self) => self.findIndex((p) => p.id === pack.id) === index);

  const handlePackClick = (e: React.MouseEvent, packId: number) => {
    e.stopPropagation(); // Prevent row click
    navigate(`/pack/${packId}`);
  };

  return (
    <tr className="hover:bg-base-200/50 transition-colors cursor-pointer" onClick={() => onClick(chart.hash)}>
      <td className="px-4 py-5">
        <div className="flex items-center gap-4">
          <BannerImage
            bannerVariants={chart.bannerVariants}
            mdBannerUrl={chart.mdBannerUrl}
            smBannerUrl={chart.smBannerUrl}
            bannerUrl={chart.bannerUrl}
            alt={`${title} banner`}
            className="w-[128px] object-cover rounded-lg shadow-sm"
            style={{ aspectRatio: '2.56' }}
            iconSize={16}
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-base-content text-lg truncate">{title}</div>
            <div className="text-sm text-base-content/70 truncate">{artist}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-5 text-center">
        <DifficultyChip stepsType={chart.stepsType} difficulty={chart.difficulty} meter={chart.meter} size="sm" />
      </td>
      <td className="px-4 py-5 text-sm text-base-content/70">
        {packs.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {packs.map((pack) => (
              <div key={pack.id}>
                <button
                  className="link link-hover text-xs bg-base-200/50 hover:bg-base-300/50 px-2 py-1 rounded transition-colors mr-1"
                  onClick={(e) => {
                    // Remove any existing tooltips before navigation
                    const existingTooltips = document.querySelectorAll('.pack-tooltip');
                    existingTooltips.forEach((tooltip) => tooltip.remove());
                    handlePackClick(e, pack.id);
                  }}
                  onMouseEnter={(e) => {
                    if (pack.bannerUrl) {
                      const tooltip = document.createElement('div');
                      tooltip.className = 'fixed z-50 pointer-events-none pack-tooltip';
                      tooltip.innerHTML = `
                        <div class="bg-base-100 border border-base-300 rounded-lg shadow-lg p-2">
                          <img src="${pack.bannerUrl}" alt="${pack.name}" class="w-32 h-12 object-cover rounded" style="aspect-ratio: 2.56" />
                        </div>
                      `;
                      document.body.appendChild(tooltip);

                      const updatePosition = (e: MouseEvent) => {
                        tooltip.style.left = `${e.clientX + 10}px`;
                        tooltip.style.top = `${e.clientY - 10}px`;
                      };

                      updatePosition(e as any);

                      const handleMouseMove = (e: MouseEvent) => updatePosition(e);
                      const handleMouseLeave = () => {
                        tooltip.remove();
                        e.currentTarget.removeEventListener('mousemove', handleMouseMove);
                        e.currentTarget.removeEventListener('mouseleave', handleMouseLeave);
                      };

                      e.currentTarget.addEventListener('mousemove', handleMouseMove);
                      e.currentTarget.addEventListener('mouseleave', handleMouseLeave);
                    }
                  }}
                >
                  {pack.name}
                </button>
              </div>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-5 text-sm text-base-content/70">{chart.stepartist || chart.credit}</td>
      <td className="px-4 py-5 text-sm text-base-content/70">
        <FormattedDate value={new Date(chart.createdAt)} />
      </td>
    </tr>
  );
};

interface FilterPanelProps {
  stepsType: string;
  difficulty: string;
  onStepsTypeChange: (value: string) => void;
  onClearFilters: () => void;
  isExpanded: boolean;
}

const FilterPanel: React.FC<FilterPanelProps> = ({ stepsType, difficulty, onStepsTypeChange, onClearFilters, isExpanded }) => {
  if (!isExpanded) return null;

  const hasActiveFilters = stepsType || difficulty;

  return (
    <div className="bg-base-200/50 rounded-lg p-4 mb-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex flex-col sm:flex-row gap-4 flex-grow">
          <div className="form-control">
            <label className="label">
              <span className="label-text text-sm font-medium">
                <FormattedMessage defaultMessage="Steps Type" description="Label for the steps type filter" id="9hrAn3" />
              </span>
            </label>
            <select
              className="select select-bordered select-sm w-full max-w-xs bg-base-100/60"
              value={stepsType}
              onChange={(e) => onStepsTypeChange(e.target.value)}
            >
              <option value="">
                <FormattedMessage defaultMessage="All Types" description="Option for all steps types in the filter" id="8bdZjb" />
              </option>
              <option value="dance-single">
                <FormattedMessage defaultMessage="Single" description="Option for single steps type in the filter" id="1qm9M9" />
              </option>
              <option value="dance-double">
                <FormattedMessage defaultMessage="Double" description="Option for double steps type in the filter" id="ZqrnQ+" />
              </option>
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <button className="btn btn-sm btn-ghost" onClick={onClearFilters}>
            <X size={16} />
            <FormattedMessage defaultMessage="Clear Filters" description="Button label to clear all active filters" id="OWbRXA" />
          </button>
        )}
      </div>
    </div>
  );
};

export const ChartsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);
  const [searchCallCounter, setSearchCallCounter] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const { formatMessage } = useIntl();

  const { charts, meta, filters, loading, error, setSearch, setStepsType, setDifficulty, setOrderBy, setOrderDirection, setPage, refresh } = useChartList();

  useEffect(() => {
    // this is a hack to prevent a second API call on first render
    // todo: figure out how to actually prevent that second API call
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

  const handleChartClick = (chartHash: string) => {
    navigate(`/chart/${chartHash}`);
  };

  const handleClearFilters = () => {
    setStepsType('');
    setDifficulty('');
  };

  if (error) {
    return (
      <AppPageLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="card bg-base-100/40 backdrop-blur-sm shadow-xl">
            <div className="card-body">
              <div className="alert alert-error">
                <span>
                  <FormattedMessage
                    defaultMessage="Error loading charts: {error}"
                    description="Message displayed when there is an error loading charts"
                    values={{ error }}
                    id="YrqEwQ"
                  />
                </span>
                <button className="btn btn-sm" onClick={refresh}>
                  <FormattedMessage defaultMessage="Retry" description="Button label to retry loading" id="80Vzt6" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout>
      <div className="container mx-auto px-4 pt-20">
        {/* Header */}
        <div className="text-center my-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            <FormattedMessage defaultMessage="Charts" description="Page title for the charts page" id="q0JHzH" />
          </h1>
        </div>

        {/* Main Content Card */}
        <div className="card bg-base-100/60 backdrop-blur-sm shadow-xl">
          <div className="card-body">
            {/* Search and Filters */}
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row gap-4 items-center mb-4">
                <div className="relative flex-grow max-w-md">
                  <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50" />
                  <input
                    type="text"
                    placeholder={formatMessage({
                      defaultMessage: 'Search charts...',
                      id: 'wvZ6ln',
                      description: 'Placeholder text for the search input on the charts page',
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

                <button className={`btn btn-outline ${showFilters ? 'btn-primary' : ''}`} onClick={() => setShowFilters(!showFilters)}>
                  <Filter size={16} />
                  <FormattedMessage defaultMessage="Filters" id="haBkmP" description="Label for the filters button on the charts page" />
                </button>

                {meta && (
                  <div className="text-sm text-base-content/70">
                    <FormattedMessage
                      defaultMessage="Showing {shown,number} of {total,number} charts"
                      id="cyaeNo"
                      description="Text showing the number of charts displayed out of the total available"
                      values={{ shown: charts.length, total: meta.total }}
                    />
                  </div>
                )}
              </div>

              <FilterPanel
                stepsType={filters?.stepsType || ''}
                difficulty={filters?.difficulty || ''}
                onStepsTypeChange={setStepsType}
                onClearFilters={handleClearFilters}
                isExpanded={showFilters}
              />
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg">
              <table className="table table-zebra w-full bg-base-100 border border-base-content/10">
                <thead className="bg-base-200/80">
                  <tr>
                    <ChartTableHeader
                      label={formatMessage({
                        defaultMessage: 'Song',
                        id: 'XBomKO',
                        description: 'Label for the song column',
                      })}
                      sortKey="songName"
                      currentOrderBy={filters?.orderBy || 'songName'}
                      currentDirection={(filters?.orderDirection as 'asc' | 'desc') || 'asc'}
                      onSort={handleSort}
                    />
                    <ChartTableHeader
                      label={formatMessage({
                        defaultMessage: 'Rating',
                        id: 'l8uwY9',
                        description: 'Label for the rating column',
                      })}
                      sortKey="rating"
                      currentOrderBy={filters?.orderBy || 'songName'}
                      currentDirection={(filters?.orderDirection as 'asc' | 'desc') || 'asc'}
                      onSort={handleSort}
                    />
                    <th className="px-4 py-3">
                      <span className="font-semibold text-base-content">
                        <FormattedMessage defaultMessage="Packs" id="M4B3y1" description="Label for the packs column" />
                      </span>
                    </th>
                    <th className="px-4 py-3">
                      <span className="font-semibold text-base-content">
                        <FormattedMessage defaultMessage="Stepartist" id="68hzlT" description="Label for the stepartist column" />
                      </span>
                    </th>
                    <ChartTableHeader
                      label={formatMessage({
                        defaultMessage: 'Added',
                        id: 'EnMoBC',
                        description: 'Label for the added date column',
                      })}
                      sortKey="createdAt"
                      currentOrderBy={filters?.orderBy || 'songName'}
                      currentDirection={(filters?.orderDirection as 'asc' | 'desc') || 'asc'}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody className={loading ? 'opacity-50' : ''}>
                  {charts.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-base-content/50">
                        {filters?.search ? (
                          <FormattedMessage
                            defaultMessage="No charts found."
                            description="Message displayed when no charts match the search criteria"
                            id="GXkfPe"
                          />
                        ) : (
                          <FormattedMessage
                            defaultMessage="No charts available."
                            description="Message displayed when there are no charts to show"
                            id="rHQoq4"
                          />
                        )}
                      </td>
                    </tr>
                  ) : (
                    charts.map((chart) => <ChartRow key={chart.hash} chart={chart} onClick={handleChartClick} />)
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {meta && <Pagination meta={meta} onPageChange={setPage} />}
          </div>
        </div>
      </div>
    </AppPageLayout>
  );
};
