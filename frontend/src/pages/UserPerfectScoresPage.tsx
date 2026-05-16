import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FormattedMessage, useIntl } from 'react-intl';
import { ChevronLeft, Globe, Loader2, Swords, User as UserIcon } from 'lucide-react';
import { AppPageLayout, Alert, GradeImage, ProfileAvatar, Pagination, DifficultyChip } from '../components';
import { BannerImage, TabbedCard } from '../components/ui';
import type { Tab } from '../components/ui/TabbedCard';
import { getUserById, getUserPerfectScores } from '../services/api';
import type { PerfectScoreItem } from '../services/api';
import type { PaginationMeta } from '../components/ui/Pagination';
import { useAuth } from '../contexts/AuthContext';
import type { UserProfile } from '../schemas/apiSchemas';

type ScoreType = 'quads' | 'quints' | 'hexes';

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
      <div className="hidden md:block -mx-6 -mt-6 overflow-x-auto">
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
// Per-tab content — lazy fetches when isActive=true
// ---------------------------------------------------------------------------
const TabContent: React.FC<{ user: UserProfile; type: ScoreType; userId: string; isActive: boolean }> = ({ user, type, userId, isActive }) => {
  const { formatDate, formatMessage } = useIntl();
  const count = COUNT_FOR_TYPE(user, type);
  const grade = GRADE_FOR_TYPE[type];

  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [items, setItems] = useState<PerfectScoreItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    setIsLoading(true);
    getUserPerfectScores(userId, type, page)
      .then((res) => {
        if (!cancelled) {
          setItems(res.items as PerfectScoreItem[]);
          setMeta(res.meta);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setMeta(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          setHasFetched(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, type, isActive, page]);

  if (!hasFetched || isLoading) {
    return <SkeletonRows count={count} />;
  }

  if (items.length === 0) {
    return <EmptyState type={type} />;
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block -mx-6 -mt-6 overflow-x-auto">
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
                  <div className="text-xs text-base-content/60">{formatMessage({ defaultMessage: 'Grade', id: '7WVZE7', description: 'label for grade' })}</div>
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
        <div className="mt-4">
          <Pagination meta={meta} onPageChange={setPage} />
        </div>
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

  const isRival = useMemo(() => {
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
    const count = COUNT_FOR_TYPE(user, type);
    return {
      id: type,
      label: count > 0 ? `${LABEL_FOR_TYPE[type]} (${count.toLocaleString()})` : LABEL_FOR_TYPE[type],
      labelNode: (
        <span className="flex items-center gap-2">
          {LABEL_FOR_TYPE[type]}
          {count > 0 && <span className="badge badge-sm badge-primary">{count.toLocaleString()}</span>}
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
