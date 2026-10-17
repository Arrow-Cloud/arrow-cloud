const GLASS_SURFACE = 'card pop-card';

// Stand-in for a home page block that hasn't been built yet - the same glass treatment as the live
// site's sections (HomePage.tsx), so the skeleton reads like the real layout. Pass
// `surfaceClassName` for a block nested inside another card.
export default function PlaceholderCard({
  title,
  children,
  className = '',
  surfaceClassName = GLASS_SURFACE,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  surfaceClassName?: string;
}) {
  return (
    <div className={`${surfaceClassName} p-6 flex flex-col gap-3 ${className}`}>
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="flex-1 min-h-24 rounded-box border-[3px] border-dashed border-primary/25 bg-primary/5 flex items-center justify-center p-4 text-sm text-base-content/50 text-center">
        {children}
      </div>
    </div>
  );
}
