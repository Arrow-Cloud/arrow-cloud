import React, { useEffect, useMemo } from 'react';
import { useLeaderboardView } from '../../contexts/LeaderboardViewContext';
import { useAuth } from '../../contexts/AuthContext';
import { ALL_LEADERBOARD_IDS, LEADERBOARD_ID_TO_KEY, LEADERBOARD_LABELS, LeaderboardId } from '../../types/leaderboards';
import { useIntl } from 'react-intl';

interface LeaderboardToggleProps {
  options?: LeaderboardId[];
  className?: string;
  size?: 'sm' | 'md';
  onChange?: (id: LeaderboardId) => void;
}

export const LeaderboardToggle: React.FC<LeaderboardToggleProps> = ({ options = ALL_LEADERBOARD_IDS, className = '', size = 'sm', onChange }) => {
  const { formatMessage } = useIntl();
  const { activeLeaderboard, setActiveLeaderboard } = useLeaderboardView();
  const { user } = useAuth();

  // Narrow this page's leaderboard options down to what the user has chosen on their Website
  // leaderboard preferences (profile settings), and figure out which option should become active
  // if the current selection isn't one of the visible ones.
  const { visibleOptions, defaultOption } = useMemo(() => {
    const preferredIds = (user as any)?.preferredLeaderboardsWebsite as number[] | undefined;
    const preferredKeys = new Set((preferredIds ?? []).map((id) => LEADERBOARD_ID_TO_KEY[id]).filter(Boolean));
    const filtered = options.filter((id) => preferredKeys.has(id));
    if (filtered.length > 0) {
      return { visibleOptions: filtered, defaultOption: filtered[0] };
    }
    // No preferred leaderboard applies on this page - either the user hasn't configured any, or
    // none of their preferences are supported here (e.g. they only prefer rate-eligible
    // leaderboards, which aren't available on this page yet). Show everything this page supports,
    // but default to EX specifically rather than an arbitrary first option.
    return { visibleOptions: options, defaultOption: options.includes('EX') ? 'EX' : options[0] };
  }, [options, user]);

  // If the currently active leaderboard isn't among the visible options (e.g. on mount, the
  // shared selection came from a page with a wider set, or the user's preferences just changed),
  // snap to the computed default so the toggle's highlighted state and rendered buttons agree.
  // Deliberately does NOT depend on `activeLeaderboard`: a click on this toggle can only ever
  // select something already in `visibleOptions`, so re-validating on every active-leaderboard
  // change would immediately fight the click that just set it.
  useEffect(() => {
    if (defaultOption && !visibleOptions.includes(activeLeaderboard)) {
      setActiveLeaderboard(defaultOption);
    }
  }, [visibleOptions.join('|'), defaultOption]);

  const handleClick = (id: LeaderboardId) => {
    if (id === activeLeaderboard) return;
    setActiveLeaderboard(id);
    onChange?.(id);
  };

  return (
    <div
      role="tablist"
      aria-label={formatMessage({
        defaultMessage: 'Leaderboard Toggle',
        id: 'j6SWIB',
        description: 'aria label for a group of buttons that toggle between the different leaderboard types',
      })}
      className={`flex gap-2 ${className}`}
    >
      {visibleOptions.map((id) => {
        const active = id === activeLeaderboard;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            aria-pressed={active}
            className={`btn btn-${size} transition-all duration-200 ${active ? 'btn-primary shadow-lg' : 'btn-outline hover:btn-primary hover:shadow-md'}`}
            onClick={() => handleClick(id)}
          >
            <span className="font-medium">{LEADERBOARD_LABELS[id]}</span>
          </button>
        );
      })}
    </div>
  );
};
