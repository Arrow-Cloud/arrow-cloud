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
  type GlobalRecentScore,
  type GetGlobalRecentScoresResponse,
  type SessionSummary,
  type GetRecentSessionsResponse,
} from '../../services/api';
import { type PackListItem, type UserRecentPlay } from '../../schemas/apiSchemas';

import { WelcomeBackCard, AboutCard, UserRecentScoresCard, GlobalActivityCard, RecentPacksCard, SetupAndSupportCards } from './components';

const PAGE_SIZE = 10;
const MAX_PAGES = 10;
const PACKS_PAGE_SIZE = 5;
const RIVALS_ONLY_LS_KEY = 'homeRivalsOnly';

export const HomePageNew: React.FC = () => {
  const { user } = useAuth();
  const { activeLeaderboard } = useLeaderboardView();
  const [recentScores, setRecentScores] = useState<GlobalRecentScore[]>([]);
  const [meta, setMeta] = useState<GetGlobalRecentScoresResponse['meta'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [recentPacks, setRecentPacks] = useState<PackListItem[]>([]);
  const [packsMeta, setPacksMeta] = useState<PaginationMeta | null>(null);
  const [packsLoading, setPacksLoading] = useState(true);
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
  const [globalSessions, setGlobalSessions] = useState<SessionSummary[]>([]);
  const [globalSessionsLoading, setGlobalSessionsLoading] = useState(true);
  const [globalSessionsMeta, setGlobalSessionsMeta] = useState<GetRecentSessionsResponse['meta'] | null>(null);
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
  useEffect(() => {
    const fetchScores = async () => {
      try {
        setIsLoading(true);
        const response = await getGlobalRecentScores({ page, limit: PAGE_SIZE, rivalsOnly: rivalsOnly && !!user });
        setRecentScores(response.data);
        setMeta(response.meta);
      } catch (error) {
        console.error('Failed to fetch recent scores:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchScores();
  }, [page, rivalsOnly, user]);

  // Fetch recent packs
  useEffect(() => {
    const fetchPacks = async () => {
      try {
        setPacksLoading(true);
        const response = await listPacks({
          page: packsPage,
          limit: PACKS_PAGE_SIZE,
          orderBy: 'createdAt',
          orderDirection: 'desc',
        });
        setRecentPacks(response.data);
        setPacksMeta({
          page: response.meta.page,
          limit: response.meta.limit,
          total: response.meta.total,
          totalPages: Math.min(response.meta.totalPages, MAX_PAGES),
          hasNextPage: response.meta.page < Math.min(response.meta.totalPages, MAX_PAGES),
          hasPreviousPage: response.meta.hasPreviousPage,
        });
      } catch (error) {
        console.error('Failed to fetch recent packs:', error);
      } finally {
        setPacksLoading(false);
      }
    };

    fetchPacks();
  }, [packsPage]);

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
  useEffect(() => {
    const fetchGlobalSessions = async () => {
      try {
        setGlobalSessionsLoading(true);
        const response = await getRecentSessions({ page: sessionsPage, limit: PAGE_SIZE, rivalsOnly: rivalsOnly && !!user });
        setGlobalSessions(response.data);
        setGlobalSessionsMeta(response.meta);
      } catch (error) {
        console.error('Failed to fetch global sessions:', error);
      } finally {
        setGlobalSessionsLoading(false);
      }
    };

    fetchGlobalSessions();
  }, [sessionsPage, rivalsOnly, user]);

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
    <AppPageLayout className="pb-0 !min-h-0">
      <div className="min-h-[calc(100vh-theme(spacing.16)-40px)] pt-20 bg-gradient-to-b from-base-100 via-primary-200/50 to-base/100">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-5xl mx-auto">
            {/* Welcome Back Card - Only show for logged in users */}
            {user && <WelcomeBackCard user={user} />}

            {/* About Card - Only show for logged out users */}
            {!user && <AboutCard />}

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
              isLoading={isLoading}
              paginationMeta={paginationMeta}
              onPageChange={setPage}
              activeLeaderboard={activeLeaderboard}
              user={user}
              rivalsOnly={rivalsOnly}
              onRivalsOnlyChange={setRivalsOnly}
              sessions={globalSessions}
              sessionsLoading={globalSessionsLoading}
              sessionsPaginationMeta={sessionsPaginationMeta}
              onSessionsPageChange={setSessionsPage}
            />

            {/* Recent Packs Card */}
            <RecentPacksCard packs={recentPacks} isLoading={packsLoading} paginationMeta={packsMeta} onPageChange={setPacksPage} />

            {/* Setup and Support Cards - Side by Side - Only show for logged out users */}
            {!user && <SetupAndSupportCards />}
          </div>
        </div>
      </div>
    </AppPageLayout>
  );
};
