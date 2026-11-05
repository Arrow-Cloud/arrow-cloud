import React, { useState, useEffect } from 'react';
import { AppPageLayout } from '../../components';
import type { PaginationMeta } from '../../components/ui/Pagination';
import { useAuth } from '../../contexts/AuthContext';
import { useLeaderboardView } from '../../contexts/LeaderboardViewContext';
import {
  getGlobalRecentScores,
  getRecentSessions,
  getUserSessions,
  listPacks,
  getUserById,
  type SessionSummary,
  type ListPacksParams,
} from '../../services/api';
import { type UserRecentPlay } from '../../schemas/apiSchemas';
import { usePaginatedResource } from '../../hooks/usePaginatedResource';

import {
  WelcomeBackCard,
  AboutCard,
  UserRecentScoresCard,
  GlobalActivityCard,
  RecentPacksCard,
  SetupAndSupportCards,
  NewPackLeaderboardsCard,
} from './components';

const PAGE_SIZE = 10;
const MAX_PAGES = 10;
const PACKS_PAGE_SIZE = 5;
const RIVALS_ONLY_LS_KEY = 'homeRivalsOnly';

export const HomePageNew: React.FC = () => {
  const { user } = useAuth();
  const { activeLeaderboard } = useLeaderboardView();
  const [page, setPage] = useState(1);

  const [packsPage, setPacksPage] = useState(1);

  const [userScores, setUserScores] = useState<UserRecentPlay[]>([]);
  const [userScoresLoading, setUserScoresLoading] = useState(false);
  const [rivalsOnly, setRivalsOnly] = useState(() => {
    try {
      return localStorage.getItem(RIVALS_ONLY_LS_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Sessions state
  const [sessionsPage, setSessionsPage] = useState(1);
  const [userSessions, setUserSessions] = useState<SessionSummary[]>([]);
  const [userSessionsLoading, setUserSessionsLoading] = useState(false);

  // Persist rivalsOnly to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(RIVALS_ONLY_LS_KEY, rivalsOnly ? 'true' : 'false');
    } catch {}
  }, [rivalsOnly]);

  // Fetch global recent scores
  const scoresResource = usePaginatedResource({
    params: { page, limit: PAGE_SIZE, rivalsOnly: rivalsOnly && !!user },
    fetcher: getGlobalRecentScores,
    errorMessage: 'Failed to fetch recent scores',
  });
  const recentScores = scoresResource.data?.data ?? [];
  const meta = scoresResource.data?.meta ?? null;

  // Fetch recent packs
  const packsResource = usePaginatedResource({
    params: { page: packsPage, limit: PACKS_PAGE_SIZE, orderBy: 'createdAt', orderDirection: 'desc' } as ListPacksParams,
    fetcher: listPacks,
    errorMessage: 'Failed to fetch recent packs',
  });
  const recentPacks = packsResource.data?.data ?? [];
  const packsResponseMeta = packsResource.data?.meta;
  const packsMeta: PaginationMeta | null = packsResponseMeta
    ? {
        page: packsResponseMeta.page,
        limit: packsResponseMeta.limit,
        total: packsResponseMeta.total,
        totalPages: Math.min(packsResponseMeta.totalPages, MAX_PAGES),
        hasNextPage: packsResponseMeta.page < Math.min(packsResponseMeta.totalPages, MAX_PAGES),
        hasPreviousPage: packsResponseMeta.hasPreviousPage,
      }
    : null;

  // Fetch user's own recent scores when logged in
  useEffect(() => {
    const fetchUserScores = async () => {
      if (!user?.id) return;
      try {
        setUserScoresLoading(true);
        const response = await getUserById(user.id, {
          limit: 10,
          orderBy: 'date',
          orderDirection: 'desc',
        });
        setUserScores(response.user.recentPlays || []);
      } catch (error) {
        console.error('Failed to fetch user scores:', error);
      } finally {
        setUserScoresLoading(false);
      }
    };

    fetchUserScores();
  }, [user?.id]);

  // Fetch global recent sessions
  const sessionsResource = usePaginatedResource({
    params: { page: sessionsPage, limit: PAGE_SIZE, rivalsOnly: rivalsOnly && !!user },
    fetcher: getRecentSessions,
    errorMessage: 'Failed to fetch global sessions',
  });
  const globalSessions = sessionsResource.data?.data ?? [];
  const globalSessionsMeta = sessionsResource.data?.meta ?? null;

  // Fetch user's own recent sessions when logged in
  useEffect(() => {
    const fetchUserSessions = async () => {
      if (!user?.id) return;
      try {
        setUserSessionsLoading(true);
        const response = await getUserSessions(user.id, { limit: 5 });
        setUserSessions(response.data);
      } catch (error) {
        console.error('Failed to fetch user sessions:', error);
      } finally {
        setUserSessionsLoading(false);
      }
    };

    fetchUserSessions();
  }, [user?.id]);

  const paginationMeta: PaginationMeta | null = meta
    ? {
        page: meta.page,
        limit: meta.limit,
        total: meta.total,
        totalPages: Math.min(meta.totalPages, MAX_PAGES),
        hasNextPage: meta.page < Math.min(meta.totalPages, MAX_PAGES),
        hasPreviousPage: meta.hasPreviousPage,
      }
    : null;

  const sessionsPaginationMeta: PaginationMeta | null = globalSessionsMeta
    ? {
        page: globalSessionsMeta.page,
        limit: globalSessionsMeta.limit,
        total: globalSessionsMeta.total,
        totalPages: Math.min(globalSessionsMeta.totalPages, MAX_PAGES),
        hasNextPage: globalSessionsMeta.page < Math.min(globalSessionsMeta.totalPages, MAX_PAGES),
        hasPreviousPage: globalSessionsMeta.hasPreviousPage,
      }
    : null;

  return (
    <AppPageLayout className="pb-0">
      <div>
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            {/* Welcome Back Card - Only show for logged in users */}
            {user && <WelcomeBackCard user={user} />}

            {/* About Card - Only show for logged out users */}
            {!user && <AboutCard />}

            {/* New pack leaderboard announcement — self-expiring, see NewPackLeaderboardsCard's EXPIRY */}
            <NewPackLeaderboardsCard />

            {/* User's Own Recent Scores Card - Only show for logged in users */}
            {user && (
              <UserRecentScoresCard
                scores={userScores}
                isLoading={userScoresLoading}
                activeLeaderboard={activeLeaderboard}
                user={user}
                sessions={userSessions}
                sessionsLoading={userSessionsLoading}
              />
            )}

            {/* Recent Global Activity Card - Scores or Sessions */}
            <GlobalActivityCard
              scores={recentScores}
              loadState={scoresResource}
              paginationMeta={paginationMeta}
              onPageChange={setPage}
              activeLeaderboard={activeLeaderboard}
              user={user}
              rivalsOnly={rivalsOnly}
              onRivalsOnlyChange={setRivalsOnly}
              sessions={globalSessions}
              sessionsLoadState={sessionsResource}
              sessionsPaginationMeta={sessionsPaginationMeta}
              onSessionsPageChange={setSessionsPage}
            />

            {/* Recent Packs Card */}
            <RecentPacksCard packs={recentPacks} loadState={packsResource} paginationMeta={packsMeta} onPageChange={setPacksPage} />

            {/* Setup and Support Cards - Side by Side - Only show for logged out users */}
            {!user && <SetupAndSupportCards />}
          </div>
        </div>
      </div>
    </AppPageLayout>
  );
};
