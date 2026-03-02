import React from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

interface ProgressBarProps {
  progress: number; // 0-100
  className?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, className = '', showPercentage = true, size = 'md' }) => {
  const { formatNumber } = useIntl();

  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  // Clamp progress between 0 and 100
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className={`space-y-2 ${className}`}>
      {showPercentage && (
        <div className="flex justify-between items-center">
          <span className={`font-medium text-base-content ${textSizeClasses[size]}`}>
            <FormattedMessage defaultMessage="Uploading..." id="w69Aiw" description="Label for progress" />
          </span>
          <span className={`font-mono text-base-content/70 ${textSizeClasses[size]}`}>{formatNumber(clampedProgress / 100, { style: 'percent' })}</span>
        </div>
      )}
      <div className={`w-full bg-base-300 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <div className="h-full bg-primary transition-all duration-300 ease-out" style={{ width: `${clampedProgress}%` }} />
      </div>
    </div>
  );
};

export default ProgressBar;
