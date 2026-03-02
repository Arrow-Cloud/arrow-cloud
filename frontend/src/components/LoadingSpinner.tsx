import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/80 via-secondary/60 to-accent/70">
      <div className="text-center">
        <div className="loading loading-spinner loading-lg text-primary mb-4"></div>
      </div>
    </div>
  );
};

export default LoadingSpinner;
