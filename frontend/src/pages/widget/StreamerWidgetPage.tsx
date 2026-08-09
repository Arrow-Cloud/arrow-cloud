import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getWidgetData } from '../../services/api';
import type { WidgetDataResponse } from '../../schemas/apiSchemas';
import { useWebSocket } from '../../hooks/useWebSocket';
import {
  decodeWidgetConfig,
  getWidgetDimensions,
  type WidgetConfig,
  type LeaderboardKey,
  PANEL_WIDTH,
  PANEL_HEIGHT,
  PROFILE_HEADER_H,
} from '../../utils/widgetConfig';
import { ProfileStatsPanel } from './panels/ProfileStatsPanel';
import { RecentPlaysPanel } from './panels/RecentPlaysPanel';
import { PackLeaderboardPanel } from './panels/PackLeaderboardPanel';
import { SessionPanel } from './panels/SessionPanel';

const WIDGET_KEYFRAMES = `
  html, body, #root { background: transparent !important; background-color: transparent !important; }
  @keyframes widgetFadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes aliasMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
`;

export const StreamerWidgetPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [widgetData, setWidgetData] = useState<WidgetDataResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const userIdParam = searchParams.get('userId');
  const themeParam = searchParams.get('theme');
  const configParam = searchParams.get('config');
  const compatMode = searchParams.get('compat') === 'true';

  const config: WidgetConfig | null = configParam ? decodeWidgetConfig(configParam) : null;
  const { width: totalWidth, height: totalHeight } = config ? getWidgetDimensions(config) : { width: PANEL_WIDTH, height: PANEL_HEIGHT + PROFILE_HEADER_H };

  const WS_URL = (import.meta as any).env?.VITE_WEBSOCKET_URL || '';
  const { isConnected: wsConnected, lastMessage } = useWebSocket({
    url: WS_URL,
    userId: userIdParam || undefined,
    autoConnect: !!WS_URL,
  });

  const fetchData = async () => {
    if (!userIdParam) {
      setLoading(false);
      return;
    }
    try {
      const data = await getWidgetData(userIdParam, configParam || undefined);
      setWidgetData(data);
    } catch (error) {
      console.error('Failed to fetch widget data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userIdParam, configParam]);

  useEffect(() => {
    if (!lastMessage || !userIdParam) return;
    const isRelevantEvent =
      lastMessage.type === 'playSubmitted' || // play written — refresh recent plays
      lastMessage.type === 'sessionUpdate' || // session written — refresh session panel
      lastMessage.type === 'refresh' || // generic refresh (e.g. pack leaderboard)
      lastMessage.type === 'widgetUpdate';
    if (isRelevantEvent) {
      const messageUserId = (lastMessage as any).userId ?? (lastMessage as any).data?.userId;
      if (!messageUserId || messageUserId === userIdParam) {
        getWidgetData(userIdParam, configParam || undefined)
          .then((data) => setWidgetData(data))
          .catch((error) => console.error('[Widget] Failed to refresh data:', error));
      }
    }
  }, [lastMessage, userIdParam, configParam]);

  useEffect(() => {
    if (compatMode) {
      const style = document.createElement('style');
      style.id = 'compat-mode-colors';
      style.textContent = `
        * {
          --primary: 59 130 246 !important;
          --primary-content: 255 255 255 !important;
          --accent: 245 158 11 !important;
          --accent-content: 255 255 255 !important;
          --base-100: 31 41 55 !important;
          --base-200: 17 24 39 !important;
          --base-300: 15 23 42 !important;
          --base-content: 229 231 235 !important;
          --success: 16 185 129 !important;
          --error: 239 68 68 !important;
        }
        .bg-primary { background-color: rgb(59 130 246) !important; }
        .text-primary { color: rgb(59 130 246) !important; }
        .bg-accent { background-color: rgb(245 158 11) !important; }
        .text-accent { color: rgb(245 158 11) !important; }
        .bg-base-100 { background-color: rgb(31 41 55) !important; }
        .bg-base-200 { background-color: rgb(17 24 39) !important; }
        .bg-base-300 { background-color: rgb(15 23 42) !important; }
        .text-base-content { color: rgb(229 231 235) !important; }
        .border-base-content { border-color: rgb(229 231 235) !important; }
        .bg-primary\\/5 { background-color: rgba(59, 130, 246, 0.05) !important; }
        .bg-primary\\/10 { background-color: rgba(59, 130, 246, 0.1) !important; }
        .bg-primary\\/20 { background-color: rgba(59, 130, 246, 0.2) !important; }
        .bg-accent\\/5 { background-color: rgba(245, 158, 11, 0.05) !important; }
        .bg-accent\\/10 { background-color: rgba(245, 158, 11, 0.1) !important; }
        .bg-accent\\/20 { background-color: rgba(245, 158, 11, 0.2) !important; }
        .bg-base-200\\/50 { background-color: rgba(17, 24, 39, 0.5) !important; }
        .bg-base-300\\/30 { background-color: rgba(15, 23, 42, 0.3) !important; }
        .text-base-content\\/60 { color: rgba(229, 231, 235, 0.6) !important; }
        .text-base-content\\/70 { color: rgba(229, 231, 235, 0.9) !important; }
        .border-base-content\\/10 { border-color: rgba(229, 231, 235, 0.1) !important; }
        .border-primary\\/40 { border-color: rgba(59, 130, 246, 0.4) !important; }
        .from-base-200 { --tw-gradient-from: rgb(17 24 39) !important; }
        .via-base-300 { --tw-gradient-via: rgb(15 23 42) !important; }
        .to-base-200 { --tw-gradient-to: rgb(17 24 39) !important; }
        .from-primary\\/5 { --tw-gradient-from: rgba(59, 130, 246, 0.05) !important; }
        .to-accent\\/5 { --tw-gradient-to: rgba(245, 158, 11, 0.05) !important; }
        .shadow-success\\/50 { --tw-shadow-color: rgba(16, 185, 129, 0.5) !important; }
        .shadow-error\\/50 { --tw-shadow-color: rgba(239, 68, 68, 0.5) !important; }
        .bg-success { background-color: rgb(16 185 129) !important; }
        .bg-error { background-color: rgb(239 68 68) !important; }
      `;
      document.head.appendChild(style);
      document.documentElement.removeAttribute('data-theme');
      return () => {
        document.getElementById('compat-mode-colors')?.remove();
      };
    } else {
      document.documentElement.setAttribute('data-theme', themeParam || 'arrow-blue');
    }
    // Strip the bg-base-200 class that index.html puts on #root, then force all
    // ancestor elements to transparent so the OBS scene shows through on any theme.
    const makeTransparent = (el: HTMLElement) => {
      el.style.setProperty('background', 'transparent', 'important');
      el.style.setProperty('background-color', 'transparent', 'important');
    };
    const clearTransparent = (el: HTMLElement) => {
      el.style.removeProperty('background');
      el.style.removeProperty('background-color');
    };
    makeTransparent(document.body);
    makeTransparent(document.documentElement);
    const rootEl = document.getElementById('root');
    if (rootEl) {
      rootEl.classList.remove('bg-base-200');
      makeTransparent(rootEl);
    }
    return () => {
      clearTransparent(document.body);
      clearTransparent(document.documentElement);
      if (rootEl) {
        rootEl.classList.add('bg-base-200');
        clearTransparent(rootEl);
      }
    };
  }, [themeParam, compatMode]);

  if (loading) {
    return (
      <div className="w-full h-screen bg-transparent flex items-center justify-center">
        <style>{WIDGET_KEYFRAMES}</style>
        <div style={{ width: totalWidth, height: totalHeight }} className="bg-base-200 flex items-center justify-center">
          <div className="loading loading-spinner loading-lg text-primary" />
        </div>
      </div>
    );
  }

  if (!widgetData) return null;

  const orientation = config?.orientation ?? 'horizontal';
  const isHorizontal = orientation === 'horizontal';

  // Strip legacy 'profile' entries from old encoded configs — profile is now always-on at the top
  const rawFeatures = config?.features ?? [];
  const filteredFeatures = rawFeatures.filter((f) => (f as any).type !== 'profile');
  const activeFeatures =
    filteredFeatures.length > 0
      ? filteredFeatures
      : [{ type: 'currentSession' as const }, { type: 'recentPlays' as const, leaderboards: ['EX' as LeaderboardKey] }];

  return (
    <div className="w-full h-screen flex items-center justify-center p-0 bg-transparent">
      <style>{WIDGET_KEYFRAMES}</style>
      {/* WebSocket status dot — only visible when WS is configured */}
      {WS_URL && (
        <div className="fixed top-2 right-2 z-50">
          <div
            className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-success shadow-lg shadow-success/50' : 'bg-error shadow-lg shadow-error/50'} animate-pulse`}
          />
        </div>
      )}

      <div style={{ width: totalWidth, height: totalHeight, backgroundColor: 'transparent' }} className="flex flex-col overflow-hidden">
        {/* Profile is always rendered at the top, full width, transparent */}
        <ProfileStatsPanel user={widgetData.user} />

        {/* Feature panels below — side by side (horizontal) or stacked (vertical) */}
        <div className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} flex-1 overflow-hidden`}>
          {activeFeatures.map((feature, i) => {
            if (feature.type === 'recentPlays') {
              return <RecentPlaysPanel key={i} plays={widgetData.recentPlays ?? []} leaderboards={feature.leaderboards} orientation={orientation} />;
            }
            if (feature.type === 'packLeaderboard') {
              const packData = widgetData.packLeaderboards?.[feature.packId];
              if (!packData) return null;
              return (
                <PackLeaderboardPanel
                  key={i}
                  packName={feature.packName}
                  bannerUrl={feature.bannerUrl}
                  difficulty={feature.difficulty}
                  data={packData}
                  leaderboards={feature.leaderboards}
                  orientation={orientation}
                />
              );
            }
            if (feature.type === 'currentSession') {
              return <SessionPanel key={i} session={widgetData.currentSession} orientation={orientation} />;
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
};
