import React from 'react';
import { useIntl } from 'react-intl';

interface GradeImageProps {
  grade: string | undefined | null;
  className?: string;
  alt?: string;
}

const getGradeImage = (grade: string): string => {
  const baseUrl = 'https://assets.arrowcloud.dance/grades/';

  switch (grade.toLowerCase()) {
    case 'sex':
    case 'sext':
    case 'hex':
      return `${baseUrl}6star.png`;
    case 'quint':
      return `${baseUrl}5star.png`;
    case 'quad':
      return `${baseUrl}4star.png`;
    case 'tristar':
      return `${baseUrl}3star.png`;
    case 'twostar':
      return `${baseUrl}2star.png`;
    case 'star':
      return `${baseUrl}star.png`;
    case 's+':
      return `${baseUrl}s-plus.png`;
    case 's':
      return `${baseUrl}s.png`;
    case 's-':
      return `${baseUrl}s-minus.png`;
    case 'a+':
      return `${baseUrl}a-plus.png`;
    case 'a':
      return `${baseUrl}a.png`;
    case 'a-':
      return `${baseUrl}a-minus.png`;
    case 'b+':
      return `${baseUrl}b-plus.png`;
    case 'b':
      return `${baseUrl}b.png`;
    case 'b-':
      return `${baseUrl}b-minus.png`;
    case 'c+':
      return `${baseUrl}c-plus.png`;
    case 'c':
      return `${baseUrl}c.png`;
    case 'c-':
      return `${baseUrl}c-minus.png`;
    case 'd':
      return `${baseUrl}d.png`;
    case 'f':
      return `${baseUrl}f.png`;
    default:
      return `${baseUrl}d.png`; // Default to D grade
  }
};

export const GradeImage: React.FC<GradeImageProps> = ({ grade, className = 'w-6 h-6', alt }) => {
  const { formatMessage } = useIntl();
  if (!grade || grade === 'n/a') {
    return (
      <span className="text-base-content/60">
        {formatMessage({ defaultMessage: 'N/A', id: '1My/zA', description: 'placeholder for when no grade is awarded for a score' })}
      </span>
    );
  }
  return (
    <img
      src={getGradeImage(grade)}
      alt={
        alt || formatMessage({ defaultMessage: '{grade} grade', id: 'ybp4xd', description: 'alt text for the image representing an earned grade' }, { grade })
      }
      className={className}
    />
  );
};
