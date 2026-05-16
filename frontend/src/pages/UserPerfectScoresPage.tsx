import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FormattedMessage, useIntl } from 'react-intl';
import { ChevronLeft, Globe, Loader2, Search, Swords, User as UserIcon, X } from 'lucide-react';
import { AppPageLayout, Alert, GradeImage, ProfileAvatar, DifficultyChip } from '../components';
import { BannerImage, Pagination, TabbedCard } from '../components/ui';
import type { Tab } from '../components/ui/TabbedCard';
import { getUserById, getUserPerfectScores } from '../services/api';
import type { PerfectScoreItem, PerfectScoresFilters } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { UserProfile } from '../schemas/apiSchemas';

type ScoreType = 'quads' | 'quints' | 'hexes';
type SortValue = 'date-desc' | 'date-asc' | 'meter-desc' | 'meter-asc';

const SCORE_TYPES: ScoreType[] = ['quads', 'quints', 'hexes'];

const GRADE_FOR_TYPE: Record<ScoreType, string> = {
  quads: 'quad',
  quints: 'quint',
  hexes: 'hex',
};

const LABEL_FOR_TYPE: Record<ScoreType, string> = {
  quads: 'Quads',
  quints: 'Quints',
  hexes: 'Hexes',
};

const COUNT_FOR_TYPE = (user: UserProfile, type: ScoreType): number => {
  if (type === 'quads') return user.stats?.quads ?? 0;
  if (type === 'quints') return user.stats?.quints ?? 0;
  return user.stats?.hexes ?? 0;
};

// Not a translatable string — it's a fixed numeric score display value
const PERFECT_SCORE_DISPLAY = '100.00%';

/** Maps a numeric meter value to a colour tier, matching the SessionPage chart palette. */
const getMeterColor = (meter: number): string => {
  if (meter <= 5) return '#36d399';
  if (meter <= 9) return '#3abff8';
  if (meter <= 12) return '#fbbd23';
  if (meter <= 15) return '#f87272';
  return '#d946ef';
};

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Skeleton rows while loading
// ---------------------------------------------------------------------------
const SkeletonRows: React.FC<{ count: number }> = ({ count }) => {
  if (count === 0) {
    return (
      <div className="py-8 flex justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }
  return (
    <>
      {/* Desktop skeleton */}
      <div className="hidden md:block -mx-6 overflow-x-auto">
        <table className="table w-full">
          <tbody>
            {Array.from({ length: Math.min(count, 5) }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-12.5 rounded-lg bg-base-300 shrink-0" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-base-300 rounded w-2/3" />
                      <div className="h-3 bg-base-300 rounded w-1/2" />
                      <div className="h-5 bg-base-300 rounded w-16" />
                    </div>
                  </div>
                </td>
                <td className="py-4 text-center">
                  <div className="w-8 h-8 rounded bg-base-300 mx-auto" />
                </td>
                <td className="py-4 text-center">
                  <div className="h-6 bg-base-300 rounded w-16 mx-auto" />
                </td>
                <td className="py-4 text-center">
                  <div className="h-4 bg-base-300 rounded w-20 mx-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile skeleton */}
      <div className="md:hidden space-y-4">
        {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
          <div key={i} className="bg-base-200/30 rounded-lg p-4 border border-base-content/10 animate-pulse space-y-3">
            <div className="w-full h-16 rounded-lg bg-base-300" />
            <div className="h-4 bg-base-300 rounded w-2/3" />
            <div className="h-3 bg-base-300 rounded w-1/2" />
            <div className="flex justify-between">
              <div className="w-8 h-8 rounded bg-base-300" />
              <div className="h-7 w-20 rounded bg-base-300" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
const EmptyState: React.FC<{ type: ScoreType }> = ({ type }) => (
  <div className="flex flex-col items-center justify-center py-16 text-base-content/50 gap-3">
    <GradeImage grade={GRADE_FOR_TYPE[type]} className="w-12 h-12 opacity-30" />
    <p className="text-sm">
      <FormattedMessage
        defaultMessage="No {type} yet"
        id="xROcFy"
        description="Empty state message for perfect scores list"
        values={{ type: LABEL_FOR_TYPE[type] }}
      />
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// Per-tab content
// ---------------------------------------------------------------------------
const TabContent: React.FC<{ user: UserProfile; type: ScoreType; userId: string; isActive: boolean }> = ({ user, type, userId, isActive }) => {
  const { formatDate, formatMessage } = useIntl();
  const count = COUNT_FOR_TYPE(user, type);
  const grade = GRADE_FOR_TYPE[type];

  // Data state
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [items, setItems] = useState<PerfectScoreItem[]>([]);
  const [meterStats, setMeterStats] = useState<{ meter: number; count: number }[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean } | null>(
    null,
  );

  // Filter / sort state
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [meterFilter, setMeterFilter] = useState<number | null>(null);
  const [sortValue, setSortValue] = useState<SortValue>('date-desc');
  const [page, setPage] = useState(1);

  // Debounce search input → search (also resets page)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch whenever active params change
  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    setIsLoading(true);
    const filters: PerfectScoresFilters = { sort: sortValue };
    if (search) filters.search = search;
    if (meterFilter !== null) filters.meter = meterFilter;
    getUserPerfectScores(userId, type, page, PAGE_SIZE, filters)
      .then((res) => {
        if (!cancelled) {
          setItems(res.items as PerfectScoreItem[]);
          setMeta(res.meta);
          // Only update meterStats on the first fetch or when type changes;
          // after that the breakdown is stable regardless of active search/filter
          if (!hasFetched || res.meterStats.length > 0) {
            setMeterStats(res.meterStats);
          }
          setHasFetched(true);
        }
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, type, isActive, page, search, meterFilter, sortValue]);

  const handleMeterFilter = (meter: number | null) => {
    setMeterFilter(meter);
    setPage(1);
    // Meter-based sort is meaningless when filtered to a single level
    if (meter !== null && (sortValue === 'meter-desc' || sortValue === 'meter-asc')) {
      setSortValue('date-desc');
    }
  };

  const handleSort = (v: SortValue) => {
    setSortValue(v);
    setPage(1);
  };

  const totalUnfiltered = meterStats.reduce((sum, s) => sum + s.count, 0);
  const isFiltered = search !== '' || meterFilter !== null;

  if (!hasFetched || (isLoading && items.length === 0)) {
    return <SkeletonRows count={count} />;
  }

  if (!isFiltered && count === 0) {
    return <EmptyState type={type} />;
  }

  return (
    <>
      {/* Difficulty breakdown / filter chips */}
      {meterStats.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-base-content/40 uppercase tracking-wider mb-3">
            <FormattedMessage
              defaultMessage="Difficulty breakdown"
              id="ZhWbwW"
              description="Section label for per-difficulty count chips on the perfect scores page"
            />
          </p>
          <div className="flex flex-wrap gap-2">
            {/* All chip */}
            <button
              className={`flex flex-col items-center justify-center min-w-14 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                meterFilter === null
                  ? 'bg-primary border-primary text-primary-content shadow-md'
                  : 'bg-base-200/50 border-base-300 hover:bg-base-200 hover:border-base-content/30 text-base-content'
              }`}
              onClick={() => handleMeterFilter(null)}
            >
              <span
                className={`text-[10px] font-semibold leading-none uppercase tracking-wide ${meterFilter === null ? 'text-primary-content/80' : 'text-base-content/50'}`}
              >
                <FormattedMessage defaultMessage="All" id="UdfRJp" description="Label for 'all items' filter chip" />
              </span>
              <span className={`text-base font-bold leading-none mt-1 tabular-nums ${meterFilter === null ? 'text-primary-content' : 'text-base-content'}`}>
                {totalUnfiltered.toLocaleString()}
              </span>
            </button>

            {/* Per-meter chips */}
            {meterStats.map(({ meter, count: cnt }) => {
              const color = getMeterColor(meter);
              const isActive = meterFilter === meter;
              return (
                <button
                  key={meter}
                  className={`flex flex-col items-center justify-center min-w-14 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                    isActive
                      ? 'border-transparent shadow-md'
                      : 'bg-base-200/50 border-base-300 hover:bg-base-200 hover:border-base-content/30 text-base-content'
                  }`}
                  style={isActive ? { backgroundColor: color, borderColor: color } : { borderTopColor: color, borderTopWidth: '3px' }}
                  onClick={() => handleMeterFilter(isActive ? null : meter)}
                >
                  <span className="text-[10px] font-semibold leading-none uppercase tracking-wide" style={{ color: isActive ? 'rgba(0,0,0,0.6)' : color }}>
                    {meter}
                  </span>
                  <span className="text-base font-bold leading-none mt-1 tabular-nums" style={{ color: isActive ? '#000' : undefined }}>
                    {cnt.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search + sort toolbar */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40 pointer-events-none" />
          <input
            type="text"
            className="input input-bordered input-sm w-full"
            placeholder={formatMessage({
              defaultMessage: 'Search by chart or artist…',
              id: 'bT6Uzj',
              description: 'Placeholder text for the search input on the perfect scores page',
            })}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {isLoading && hasFetched ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <span className="loading loading-spinner loading-xs" />
            </div>
          ) : searchInput ? (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content transition-colors"
              onClick={() => {
                setSearchInput('');
                setSearch('');
                setPage(1);
              }}
              aria-label={formatMessage({ defaultMessage: 'Clear search', id: 'cWP9Pr', description: 'Aria label for the clear search button' })}
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
        <select
          className="select select-bordered select-sm"
          value={sortValue}
          onChange={(e) => handleSort(e.target.value as SortValue)}
          aria-label={formatMessage({ defaultMessage: 'Sort order', id: '8ORM7W', description: 'Aria label for the sort order select' })}
        >
          <option value="date-desc">{formatMessage({ defaultMessage: 'Newest first', id: 'V0VFPr', description: 'Sort option: newest date first' })}</option>
          <option value="date-asc">{formatMessage({ defaultMessage: 'Oldest first', id: 'LuXelH', description: 'Sort option: oldest date first' })}</option>
          {meterFilter === null && (
            <>
              <option value="meter-desc">
                {formatMessage({ defaultMessage: 'Hardest first', id: 'TSXymG', description: 'Sort option: highest difficulty meter first' })}
              </option>
              <option value="meter-asc">
                {formatMessage({ defaultMessage: 'Easiest first', id: 'fM7QxL', description: 'Sort option: lowest difficulty meter first' })}
              </option>
            </>
          )}
        </select>
      </div>

      {/* Filtered results count */}
      {meta && isFiltered && (
        <p className="text-xs text-base-content/50 mb-3">
          <FormattedMessage
            defaultMessage="{n} of {total} results"
            id="4IpgEN"
            description="Showing X of Y results count when filters are active"
            values={{ n: meta.total.toLocaleString(), total: totalUnfiltered.toLocaleString() }}
          />
        </p>
      )}

      {/* No results after filtering */}
      {items.length === 0 && !isLoading && (
        <div className="py-12 text-center text-base-content/50 text-sm">
          <FormattedMessage defaultMessage="No charts match your search" id="UOWMPC" description="Empty state when search/filter returns no results" />
        </div>
      )}

      {items.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block -mx-6 overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="bg-base-200/50 font-semibold text-base-content">
                    {formatMessage({ defaultMessage: 'Chart', id: '0f75C1', description: 'table column header label for played charts' })}
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content text-center">
                    {formatMessage({ defaultMessage: 'Grade', id: 'bHsHBx', description: 'table column header for grade' })}
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content text-center">
                    {formatMessage({ defaultMessage: 'Score', id: '4lpK5r', description: 'table column header for perfect score' })}
                  </th>
                  <th className="bg-base-200/50 font-semibold text-base-content text-center">
                    {formatMessage({ defaultMessage: 'Date', id: '64BTNW', description: 'table column header for date' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.chartHash} className="hover:bg-base-100/30 transition-colors border-base-content/5">
                    <td className="py-4">
                      <Link to={`/chart/${item.chartHash}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                        <BannerImage
                          bannerVariants={item.bannerVariants}
                          mdBannerUrl={item.mdBannerUrl}
                          smBannerUrl={item.smBannerUrl}
                          bannerUrl={item.bannerUrl}
                          alt={item.title ?? ''}
                          className="rounded-lg shadow-lg w-32 shrink-0"
                          style={{ aspectRatio: '2.56' }}
                          loading="eager"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-base-content">{item.title}</div>
                          <div className="text-sm text-base-content/60">{item.artist}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <DifficultyChip stepsType={item.stepsType} difficulty={item.difficulty} meter={item.meter} size="sm" />
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="py-4 text-center">
                      <div className="flex items-center justify-center">
                        <GradeImage grade={grade} className="w-8 h-8 object-contain" />
                      </div>
                    </td>
                    <td className="py-4 text-center">
                      {item.playId ? (
                        <Link to={`/play/${item.playId}`} className="font-bold text-lg text-primary">
                          {PERFECT_SCORE_DISPLAY}
                        </Link>
                      ) : (
                        <div className="font-bold text-lg text-primary">{PERFECT_SCORE_DISPLAY}</div>
                      )}
                    </td>
                    <td className="py-4 text-center">
                      <div className="text-sm text-base-content/70">
                        {new Date(item.achievedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                      <div className="text-xs text-base-content/50">
                        {new Date(item.achievedAt).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-4">
            {items.map((item) => (
              <div key={item.chartHash} className="bg-base-200/30 rounded-lg p-4 border border-base-content/10">
                <Link to={`/chart/${item.chartHash}`} className="block mb-3 hover:opacity-80 transition-opacity">
                  <div className="mb-2">
                    <BannerImage
                      bannerVariants={item.bannerVariants}
                      mdBannerUrl={item.mdBannerUrl}
                      smBannerUrl={item.smBannerUrl}
                      bannerUrl={item.bannerUrl}
                      alt={item.title ?? ''}
                      className="w-full rounded-lg shadow-lg"
                      style={{ aspectRatio: '2.56' }}
                      loading="eager"
                    />
                  </div>
                  <div className="mb-2">
                    <div className="font-medium text-base-content text-sm truncate">{item.title}</div>
                    <div className="text-xs text-base-content/60 truncate">{item.artist}</div>
                  </div>
                  <div>
                    <DifficultyChip stepsType={item.stepsType} difficulty={item.difficulty} meter={item.meter} size="sm" />
                  </div>
                </Link>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <GradeImage grade={grade} className="w-8 h-8 object-contain" />
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-base-content/60">
                        {formatMessage({ defaultMessage: 'Grade', id: '7WVZE7', description: 'label for grade' })}
                      </div>
                      {item.playId ? (
                        <Link to={`/play/${item.playId}`} className="font-bold text-lg text-primary">
                          {PERFECT_SCORE_DISPLAY}
                        </Link>
                      ) : (
                        <div className="font-bold text-lg text-primary">{PERFECT_SCORE_DISPLAY}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-base-content/60">
                      <FormattedMessage defaultMessage="Date" id="/eiyYH" description="label for the date a user earned a particular score" />
                    </span>
                    <span className="text-base-content/70">{formatDate(item.achievedAt, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="mt-6 flex justify-center">
              <Pagination meta={meta} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export const UserPerfectScoresPage: React.FC = () => {
  const { userId, scoreType } = useParams<{ userId: string; scoreType: string }>();
  const { user: currentUser } = useAuth();
  const { formatDisplayName } = useIntl();

  const [activeType, setActiveType] = useState<ScoreType>(() => (SCORE_TYPES.includes(scoreType as ScoreType) ? (scoreType as ScoreType) : 'quads'));

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    getUserById(userId, { limit: 0 })
      .then((res) => setUser(res.user))
      .catch(() => setError('Failed to load user'))
      .finally(() => setLoading(false));
  }, [userId]);

  const isSelf = !!currentUser?.id && !!user?.id && currentUser.id === user.id;

  const isRival = React.useMemo(() => {
    if (!currentUser || !user?.id || isSelf) return false;
    const ids = (currentUser as any).rivalUserIds as string[] | undefined;
    return Array.isArray(ids) && ids.includes(user.id);
  }, [currentUser, isSelf, user?.id]);

  if (loading) {
    return (
      <AppPageLayout>
        <div className="container mx-auto px-4 py-8 flex justify-center">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      </AppPageLayout>
    );
  }

  if (error || !user) {
    return (
      <AppPageLayout>
        <div className="container mx-auto px-4 py-8">
          <Alert variant="error">
            {error ?? <FormattedMessage defaultMessage="User not found" id="JdsFR1" description="Error message when a user profile cannot be found" />}
          </Alert>
        </div>
      </AppPageLayout>
    );
  }

  const tabs: Tab[] = SCORE_TYPES.map((type) => {
    const cnt = COUNT_FOR_TYPE(user, type);
    return {
      id: type,
      label: cnt > 0 ? `${LABEL_FOR_TYPE[type]} (${cnt.toLocaleString()})` : LABEL_FOR_TYPE[type],
      labelNode: (
        <span className="flex items-center gap-2">
          {LABEL_FOR_TYPE[type]}
          {cnt > 0 && <span className="badge badge-sm badge-primary">{cnt.toLocaleString()}</span>}
        </span>
      ),
      content: <TabContent user={user} type={type} userId={userId!} isActive={type === activeType} />,
    };
  });

  const handleTabChange = (tabId: string) => {
    setActiveType(tabId as ScoreType);
    window.history.replaceState(null, '', `/user/${userId}/perfect-scores/${tabId}`);
  };

  return (
    <AppPageLayout>
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        {/* Back link */}
        <Link to={`/user/${userId}`} className="inline-flex items-center gap-1 text-sm text-base-content/60 hover:text-base-content transition-colors mb-6">
          <ChevronLeft size={16} />
          <FormattedMessage defaultMessage="Back to profile" id="wwr8Os" description="Back link on the perfect scores sub-page" />
        </Link>

        {/* Profile header */}
        <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg mb-6">
          <div className="card-body">
            <div className="flex items-center gap-4">
              <ProfileAvatar profileImageUrl={user.profileImageUrl ?? null} alias={user.alias} size="xl" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2">
                  <h2 className="text-2xl font-bold text-base-content truncate">{user.alias}</h2>
                  {isSelf && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/15 text-success text-xs font-semibold border border-success/40 shadow-sm">
                      <UserIcon className="w-3.5 h-3.5" />
                      <FormattedMessage defaultMessage="You" id="GLEWu9" description="chip indicating this profile belongs to the logged-in user" />
                    </span>
                  )}
                  {!isSelf && isRival && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error/15 text-error text-xs font-semibold border border-error/40 shadow-sm">
                      <Swords className="w-3.5 h-3.5" />
                      <FormattedMessage defaultMessage="Rival" id="CDJiXM" description="chip indicating this user is a rival of the logged-in user" />
                    </span>
                  )}
                </div>
                {user.country && (
                  <p className="text-sm text-base-content/60 flex items-center gap-1.5 mt-1">
                    <Globe size={14} className="text-base-content/50" />
                    {formatDisplayName(user.country.code, { type: 'region' })}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabbed card — quads / quints / hexes */}
        <TabbedCard tabs={tabs} defaultTab={activeType} onTabChange={handleTabChange} persistKey={`perfectScoresView_${userId}`} />
      </div>
    </AppPageLayout>
  );
};
