import { useRowHighlight } from '../lib/useRowHighlight';

// A player's alias, with the self / rival icon and colour. Uses theme tones that stay readable on both the light
// and dark theme - the main site's own text classes (text-success) are too pale on this site's cream surfaces.
export default function PlayerName({ userId, alias, className = '' }: { userId: string; alias: string; className?: string }) {
  const { isSelf, isRival, Icon } = useRowHighlight(userId);
  const tone = isSelf ? 'text-primary' : isRival ? 'text-error' : '';
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${tone} ${className}`}>
      {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden />}
      <span className="truncate">{alias}</span>
    </span>
  );
}
