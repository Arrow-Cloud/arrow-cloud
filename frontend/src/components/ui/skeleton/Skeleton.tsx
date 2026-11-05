import React from 'react';

interface SkeletonProps {
  /** Size and shape, e.g. `h-4 w-24` or `w-8 h-8 rounded-full`. */
  className?: string;
}

/**
 * One placeholder block. Wraps daisyUI's `skeleton` so every loading state shares one themed look.
 * Hidden from assistive technology; `LoadingLabel` announces loading instead.
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = 'h-4 w-full' }) => <div aria-hidden="true" className={`skeleton ${className}`} />;
