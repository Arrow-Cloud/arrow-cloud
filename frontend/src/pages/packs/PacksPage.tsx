import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';
import { usePackList, useDebounce } from '../../hooks';
import { PackListItem } from '../../schemas/apiSchemas';
import { AppPageLayout, Pagination } from '../../components';
import { BannerImage } from '../../components/ui';
import { FormattedMessage, useIntl } from 'react-intl';

interface PopularityMeterProps {
  popularity: number;
  maxPopularity?: number;
}

const PopularityMeter: React.FC<PopularityMeterProps> = ({ popularity, maxPopularity = 100 }) => {
  // Calculate percentage (0-100)
  const percentage = Math.min(100, Math.max(0, (popularity / maxPopularity) * 100));

  // Determine color based on popularity level
  let meterColor = 'bg-gray-400'; // Default gray for no popularity
  if (percentage > 50) {
    meterColor = 'bg-green-500'; // High popularity = green
  } else if (percentage > 10) {
    meterColor = 'bg-yellow-500'; // Medium popularity = yellow
  }

  return (
    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
      <div className={`h-full transition-all duration-300 ${meterColor}`} style={{ width: `${percentage}%` }} />
    </div>
  );
};

interface PackTableHeaderProps {
  label: string;
  sortKey: string;
  currentOrderBy: string;
  currentDirection: 'asc' | 'desc';
  onSort: (orderBy: string, direction: 'asc' | 'desc') => void;
}

const PackTableHeader: React.FC<PackTableHeaderProps> = ({ label, sortKey, currentOrderBy, currentDirection, onSort }) => {
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

interface PackRowProps {
  pack: PackListItem;
  maxPopularity: number;
  onClick: (packId: number) => void;
}

const PackRow: React.FC<PackRowProps> = ({ pack, maxPopularity, onClick }) => {
  return (
    <tr className="hover:bg-base-200/50 transition-colors cursor-pointer" onClick={() => onClick(pack.id)}>
      <td className="px-4 py-5">
        <div className="flex items-center gap-5">
          <BannerImage
            bannerVariants={pack.bannerVariants}
            mdBannerUrl={pack.mdBannerUrl}
            smBannerUrl={pack.smBannerUrl}
            bannerUrl={pack.bannerUrl}
            alt={`${pack.name} banner`}
            className="w-32 h-12 object-cover rounded-lg shadow-sm"
            style={{ aspectRatio: '2.56' }}
            iconSize={24}
          />
          <span className="font-medium text-base-content text-lg">{pack.name}</span>
        </div>
      </td>
      <td className="px-4 py-5 text-center">
        <span className="badge badge-primary badge-outline font-medium">{pack.simfileCount}</span>
      </td>
      <td className="px-4 py-5 text-center">
        <PopularityMeter popularity={pack.popularity} maxPopularity={maxPopularity} />
      </td>
      <td className="px-4 py-5 text-sm text-base-content/70">{new Date(pack.createdAt).toLocaleDateString()}</td>
    </tr>
  );
};

export const PacksPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);
  const [searchCallCounter, setSearchCallCounter] = useState(0);
  const { formatMessage } = useIntl();

  const { packs, meta, filters, loading, error, setSearch, setOrderBy, setOrderDirection, setPage, refresh } = usePackList();

  // Use max popularity from the backend meta, fallback to 1 to avoid division by zero
  const maxPopularity = meta?.maxPopularity || 1;

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

  const handlePackClick = (packId: number) => {
    navigate(`/pack/${packId}`);
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
                    defaultMessage="Error loading packs: {error}"
                    id="M3DX4L"
                    description="Error message for when the packs page fails to load"
                    values={{ error }}
                  />
                </span>
                <button className="btn btn-sm" onClick={refresh}>
                  <FormattedMessage defaultMessage="Retry" id="80Vzt6" description="Button label to retry loading" />
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
            <FormattedMessage defaultMessage="Packs" id="eT8bPV" description="Title for the packs page" />
          </h1>
        </div>

        {/* Main Content Card */}
        <div className="card bg-base-100/60 backdrop-blur-sm shadow-xl">
          <div className="card-body">
            {/* Search and Filters */}
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="relative flex-grow max-w-md">
                  <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50" />
                  <input
                    type="text"
                    placeholder={formatMessage({
                      defaultMessage: 'Search packs...',
                      id: 'Cy/UbI',
                      description: 'Placeholder text for the search input on the packs page',
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
                      defaultMessage="Showing {shown,number} of {total,number} packs"
                      id="hFlOxo"
                      description="Text showing how many packs are currently displayed out of the total available"
                      values={{ shown: packs.length, total: meta.total }}
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
                    <PackTableHeader
                      label={formatMessage({ defaultMessage: 'Pack Name', id: 'qMbYfC', description: 'Table header for the name of a pack' })}
                      sortKey="name"
                      currentOrderBy={filters?.orderBy || 'popularity'}
                      currentDirection={(filters?.orderDirection as 'asc' | 'desc') || 'desc'}
                      onSort={handleSort}
                    />
                    <th className="px-4 py-3 text-center">
                      <span className="font-semibold text-base-content">
                        <FormattedMessage defaultMessage="Songs" id="0273Op" description="Table header for the number of songs" />
                      </span>
                    </th>
                    <PackTableHeader
                      label={formatMessage({ defaultMessage: 'Popularity', id: 'sxhZC7', description: 'Table header for the popularity of a pack' })}
                      sortKey="popularity"
                      currentOrderBy={filters?.orderBy || 'popularity'}
                      currentDirection={(filters?.orderDirection as 'asc' | 'desc') || 'desc'}
                      onSort={handleSort}
                    />
                    <PackTableHeader
                      label={formatMessage({ defaultMessage: 'Added', id: 'KBUN0h', description: 'Table header for the date a pack was added' })}
                      sortKey="createdAt"
                      currentOrderBy={filters?.orderBy || 'popularity'}
                      currentDirection={(filters?.orderDirection as 'asc' | 'desc') || 'desc'}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody className={loading ? 'opacity-50' : ''}>
                  {packs.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={4} className="text-center py-12 text-base-content/50">
                        {filters?.search
                          ? formatMessage(
                              {
                                defaultMessage: `No packs found matching "{search}"`,
                                id: 'acWNy9',
                                description: 'Displayed when no packs match the search query',
                              },
                              { search: filters.search },
                            )
                          : formatMessage({ defaultMessage: 'No packs available', id: 'rBoPpa', description: 'Displayed when there are no packs available' })}
                      </td>
                    </tr>
                  ) : (
                    packs.map((pack) => <PackRow key={pack.id} pack={pack} maxPopularity={maxPopularity} onClick={handlePackClick} />)
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
