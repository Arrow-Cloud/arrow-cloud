import React from 'react';

type PageAccent = 'primary' | 'secondary' | 'accent' | 'info' | 'none';

const accentGradients: Record<PageAccent, string> = {
  primary: 'radial-gradient(ellipse 80% 50% at 50% 0%, oklch(from var(--color-primary) l c h / 0.12) 0%, transparent 70%)',
  secondary: 'radial-gradient(ellipse 80% 50% at 50% 0%, oklch(from var(--color-secondary) l c h / 0.10) 0%, transparent 70%)',
  accent: 'radial-gradient(ellipse 80% 50% at 50% 0%, oklch(from var(--color-accent) l c h / 0.08) 0%, transparent 70%)',
  info: 'radial-gradient(ellipse 80% 50% at 50% 0%, oklch(from var(--color-info) l c h / 0.10) 0%, transparent 70%)',
  none: 'none',
};

interface AppPageLayoutProps {
  children: React.ReactNode;
  className?: string;
  accent?: PageAccent;
}

const AppPageLayout: React.FC<AppPageLayoutProps> = ({ children, className = '', accent = 'primary' }) => {
  return (
    <div className={`pt-28 pb-16 relative ${className}`}>
      {accent !== 'none' && <div className="pointer-events-none absolute inset-0 -z-0" style={{ background: accentGradients[accent] }} />}
      <div className="relative z-0">{children}</div>
    </div>
  );
};

export default AppPageLayout;
