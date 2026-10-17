import { useAuth } from '@shared/contexts/AuthContext';
import { computeHighlight, type HighlightInfo } from '@shared/utils/rivalHighlight';

// Own and rival rows are marked the way the main site's leaderboards mark them (utils/rivalHighlight.tsx), so a
// player who knows one site reads the other: green with a user icon for yourself, red with swords for a rival.
export function useRowHighlight(userId: string): HighlightInfo {
  const { user } = useAuth();
  // The signed-in user object carries the ids of their rivals (see the profile page's RivalsSection).
  const rivalIds = (user as { rivalUserIds?: string[] } | null)?.rivalUserIds ?? [];
  return computeHighlight(user?.id, rivalIds, userId);
}
