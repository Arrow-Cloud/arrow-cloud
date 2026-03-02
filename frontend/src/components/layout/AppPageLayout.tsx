import React from 'react';

interface AppPageLayoutProps {
  children: React.ReactNode;
  className?: string;
}

const AppPageLayout: React.FC<AppPageLayoutProps> = ({ children, className = '' }) => {
  const getBackgroundClasses = () => {
    return 'bg-gradient-to-br from-primary/60 via-accent/20 to-secondary/20';
  };

  return <div className={`min-h-screen ${getBackgroundClasses()} ${className ? className : 'pb-16'}`}>{children}</div>;
};

export default AppPageLayout;
