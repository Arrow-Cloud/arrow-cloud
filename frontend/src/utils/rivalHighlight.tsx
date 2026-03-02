import React from 'react';
import { Swords, User as UserIcon } from 'lucide-react';

export interface HighlightInfo {
  isSelf: boolean;
  isRival: boolean;
  rowGradientClass: string; // background gradient for table row
  playerTextClass: string; // class for player text styling
  rankColorClass: string; // class for rank element color
  scoreColorClass: string; // class for score element color
  Icon: React.ComponentType<any> | null; // icon component to render before alias
}

/**
 * Safely retrieve the stored authenticated user (and rivals) from localStorage.
 */
export function getStoredUser(): { id?: string; rivalUserIds?: string[] } | null {
  if (typeof window === 'undefined') return null;
  try {
    const json = localStorage.getItem('user');
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Compute highlighting information for a target user row.
 */
export function computeHighlight(currentUserId: string | undefined, rivalIds: string[], targetUserId: string): HighlightInfo {
  const isSelf = !!currentUserId && currentUserId === targetUserId;
  const isRival = !isSelf && rivalIds.includes(targetUserId);
  return {
    isSelf,
    isRival,
    rowGradientClass: isSelf
      ? 'bg-gradient-to-r from-success/20 via-success/10 to-transparent'
      : isRival
        ? 'bg-gradient-to-r from-error/20 via-error/10 to-transparent'
        : '',
    playerTextClass: isSelf ? 'text-success font-semibold' : isRival ? 'text-error font-semibold' : 'text-base-content',
    rankColorClass: isSelf ? 'text-success' : isRival ? 'text-error' : 'text-accent',
    scoreColorClass: isSelf ? 'text-success' : isRival ? 'text-error' : 'text-primary',
    Icon: isSelf ? UserIcon : isRival ? Swords : null,
  };
}

/**
 * Render the alias with optional icon (self / rival) in a reusable way.
 */
export const HighlightedAlias: React.FC<{ alias: string; highlight: HighlightInfo; className?: string }> = ({ alias, highlight, className }) => {
  const { Icon } = highlight;
  return (
    <span className={className ? className : 'inline-flex items-center gap-1'}>
      {Icon && <Icon className="w-4 h-4" />}
      {alias}
    </span>
  );
};
