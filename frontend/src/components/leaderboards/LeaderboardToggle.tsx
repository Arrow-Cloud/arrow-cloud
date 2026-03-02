import React from 'react';
import { useLeaderboardView } from '../../contexts/LeaderboardViewContext';
import { ALL_LEADERBOARD_IDS, LEADERBOARD_LABELS, LeaderboardId } from '../../types/leaderboards';
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
      {options.map((id) => {
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
