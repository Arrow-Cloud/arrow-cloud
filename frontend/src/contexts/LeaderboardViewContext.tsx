import React, { createContext, useContext } from 'react';
import { LeaderboardId, ALL_LEADERBOARD_IDS, isValidLeaderboardId } from '../types/leaderboards';

interface LeaderboardViewContextType {
  activeLeaderboard: LeaderboardId;
  setActiveLeaderboard: (id: LeaderboardId) => void;
}

const LeaderboardViewContext = createContext<LeaderboardViewContextType | undefined>(undefined);
const LS_KEY = 'activeLeaderboard';
const DEFAULT: LeaderboardId = 'HardEX';

export const LeaderboardViewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initial = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const qp = params.get('lb');
      if (isValidLeaderboardId(qp)) return qp as LeaderboardId;
      const stored = localStorage.getItem(LS_KEY);
      if (isValidLeaderboardId(stored)) return stored as LeaderboardId;
    } catch {}
    return DEFAULT;
  })();

  const [active, setActive] = React.useState<LeaderboardId>(initial);

  React.useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, active);
    } catch {}
    window.dispatchEvent(new CustomEvent('leaderboard:change', { detail: active }));
  }, [active]);

  React.useEffect(() => {
    const handler = (e: StorageEvent | CustomEvent) => {
      const value = (e as StorageEvent).newValue ?? (e as any).detail;
      if (isValidLeaderboardId(value) && value !== active) setActive(value as LeaderboardId);
    };
    window.addEventListener('storage', handler as any);
    window.addEventListener('leaderboard:change', handler as any);
    return () => {
      window.removeEventListener('storage', handler as any);
      window.removeEventListener('leaderboard:change', handler as any);
    };
  }, [active]);

  return <LeaderboardViewContext.Provider value={{ activeLeaderboard: active, setActiveLeaderboard: setActive }}>{children}</LeaderboardViewContext.Provider>;
};

export const useLeaderboardView = () => {
  const ctx = useContext(LeaderboardViewContext);
  if (!ctx) throw new Error('useLeaderboardView must be used within LeaderboardViewProvider');
  return ctx;
};

export { ALL_LEADERBOARD_IDS };
