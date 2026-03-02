import React from 'react';

interface DifficultyChipProps {
  stepsType?: string | null;
  difficulty?: string | null;
  meter?: number | null;
  size?: 'sm' | 'lg';
  className?: string;
}

/**
 * Maps stepsType to a short abbreviation
 * S = dance-single, D = dance-double, PS = pump-single, PD = pump-double
 * DC = dance-couple, DR = dance-routine, LC = lights-cabinet
 */
const getStepsTypeAbbrev = (stepsType?: string | null): string => {
  switch (stepsType?.toLowerCase()) {
    case 'dance-single':
      return 'S';
    case 'dance-double':
      return 'D';
    case 'pump-single':
      return 'PS';
    case 'pump-double':
      return 'PD';
    case 'dance-couple':
      return 'DC';
    case 'dance-routine':
      return 'DR';
    case 'lights-cabinet':
      return 'LC';
    default:
      // Try to create abbreviation from unknown types
      if (stepsType) {
        const parts = stepsType.split('-');
        if (parts.length >= 2) {
          return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return stepsType.slice(0, 2).toUpperCase();
      }
      return '?';
  }
};

/**
 * Maps difficulty to a single-letter abbreviation
 * B = beginner, E = easy, M = medium, H = hard, X = challenge/expert, Ed = edit
 */
const getDifficultyAbbrev = (difficulty?: string | null): string => {
  switch (difficulty?.toLowerCase()) {
    case 'beginner':
      return 'B';
    case 'easy':
      return 'E';
    case 'medium':
      return 'M';
    case 'hard':
      return 'H';
    case 'challenge':
    case 'expert':
      return 'X';
    case 'edit':
      return 'Ed';
    default:
      return difficulty?.[0]?.toUpperCase() || '?';
  }
};

/**
 * Get background color based on difficulty level
 */
const getDifficultyColor = (difficulty?: string | null): string => {
  switch (difficulty?.toLowerCase()) {
    case 'beginner':
      return '#2563EB'; // blue-600
    case 'easy':
      return '#16A34A'; // green-600
    case 'medium':
      return '#CA8A04'; // yellow-600
    case 'hard':
      return '#EA580C'; // orange-600
    case 'challenge':
    case 'expert':
      return '#DC2626'; // red-600
    case 'edit':
      return '#7C3AED'; // violet-600
    default:
      return '#4B5563'; // gray-600
  }
};

/**
 * A compact chip displaying stepsType + difficulty + meter
 * Example: "SH 10" = dance-single hard 10
 */
export const DifficultyChip: React.FC<DifficultyChipProps> = ({ stepsType, difficulty, meter, size = 'lg', className = '' }) => {
  // Hide chip if all values are unknown
  if (!stepsType && !difficulty && meter == null) {
    return null;
  }

  const stepsAbbrev = getStepsTypeAbbrev(stepsType);
  const diffAbbrev = getDifficultyAbbrev(difficulty);
  const bgColor = getDifficultyColor(difficulty);

  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm';

  return (
    <span className={`inline-flex items-center rounded font-bold text-white shadow-md ${sizeClasses} ${className}`} style={{ backgroundColor: bgColor }}>
      {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx -- abbreviations not translatable */}
      {`${stepsAbbrev}${diffAbbrev} ${meter ?? '?'}`}
    </span>
  );
};

export default DifficultyChip;
