import React from 'react';

interface AuthPageLayoutProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'accent';
  className?: string;
  /** When true, uses a plain background instead of gradients */
  eventMode?: boolean;
}

const AuthPageLayout: React.FC<AuthPageLayoutProps> = ({ children, variant = 'primary', className = '', eventMode = false }) => {
  const getGradientClasses = () => {
    switch (variant) {
      case 'secondary':
        return 'from-secondary/80 via-accent/60 to-primary/70';
      case 'accent':
        return 'from-accent/80 via-primary/60 to-secondary/70';
      default:
        return 'from-primary/80 via-secondary/60 to-accent/70';
    }
  };

  const getOverlayClasses = () => {
    switch (variant) {
      case 'secondary':
        return 'to-secondary/20';
      case 'accent':
        return 'to-accent/20';
      default:
        return 'to-primary/20';
    }
  };

  if (eventMode) {
    return (
      <div className={`min-h-screen bg-base-200 ${className}`}>
        <div className="min-h-screen flex items-center justify-center p-4">{children}</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${getGradientClasses()} ${className}`}>
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.1)_1px,transparent_0)] [background-size:20px_20px] opacity-20"></div>

      {/* Additional gradient overlay for more depth */}
      <div className={`absolute inset-0 bg-gradient-to-t from-base-200/30 via-transparent ${getOverlayClasses()}`}></div>

      {/* Content */}
      <div className="relative min-h-screen flex items-center justify-center p-4">{children}</div>
    </div>
  );
};

export default AuthPageLayout;
