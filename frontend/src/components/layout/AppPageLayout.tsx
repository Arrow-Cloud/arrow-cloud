import React from 'react';

type PageAccent = 'primary' | 'secondary' | 'accent' | 'info' | 'none';

const accentGradients: Record<PageAccent, string> = {
  primary:
    'radial-gradient(ellipse 90% 60% at 50% 0%, oklch(from var(--color-primary) l c h / 0.25) 0%, transparent 65%), ' +
    'radial-gradient(circle at 20% 80%, oklch(from var(--color-primary) l c h / 0.06) 0%, transparent 50%)',
  secondary:
    'radial-gradient(ellipse 90% 60% at 50% 0%, oklch(from var(--color-secondary) l c h / 0.22) 0%, transparent 65%), ' +
    'radial-gradient(circle at 80% 70%, oklch(from var(--color-secondary) l c h / 0.06) 0%, transparent 50%)',
  accent:
    'radial-gradient(ellipse 90% 60% at 50% 0%, oklch(from var(--color-accent) l c h / 0.18) 0%, transparent 65%), ' +
    'radial-gradient(circle at 75% 75%, oklch(from var(--color-accent) l c h / 0.05) 0%, transparent 50%)',
  info:
    'radial-gradient(ellipse 90% 60% at 50% 0%, oklch(from var(--color-info) l c h / 0.22) 0%, transparent 65%), ' +
    'radial-gradient(circle at 25% 70%, oklch(from var(--color-info) l c h / 0.06) 0%, transparent 50%)',
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
