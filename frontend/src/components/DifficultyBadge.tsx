import React from 'react';
import { FormattedMessage } from 'react-intl';

interface DifficultyBadgeProps {
  difficulty?: string | null;
  meter?: number | null;
  className?: string;
}

const getDifficultyBadgeClass = (difficulty?: string | null) => {
  switch (difficulty?.toLowerCase()) {
    case 'beginner':
      return 'badge-neutral';
    case 'easy':
      return 'badge-success';
    case 'medium':
      return 'badge-info';
    case 'hard':
      return 'badge-warning';
    case 'challenge':
    case 'expert':
      return 'badge-error';
    case 'edit':
      return 'badge-ghost';
    default:
      return 'badge-outline';
  }
};

export const DifficultyBadge: React.FC<DifficultyBadgeProps> = ({ difficulty, meter, className = 'badge badge-xs' }) => {
  const badgeClass = getDifficultyBadgeClass(difficulty);

  return (
    <span className={`${className} ${badgeClass} min-w-18`}>
      {difficulty || <FormattedMessage defaultMessage="Unknown" description="Unknown difficulty for difficulty badge/chip" id="sU24/r" />}
      {meter}
    </span>
  );
};
