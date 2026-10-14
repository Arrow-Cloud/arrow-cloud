import { useState, type ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import ProfileAvatar from '@shared/components/ui/ProfileAvatar';
import { useRowHighlight } from '../lib/useRowHighlight';
import ParDelta from './ParDelta';
import PlayerName from './PlayerName';

// One row of a course or hole leaderboard, as the leaderboard endpoints return it - rank comes from the
// server so tie handling lives in one place, not in each client.
export interface LeaderboardEntry {
  userId: string;
  alias: string;
  profileImageUrl?: string | null;
  rank: number;
  /** Raw integer strokes (course total, or the hole's best); /1000 for display, like the HUD. */
  totalStrokes: number;
  /** Course boards only. A round in progress can't be measured against the full course par. */
  holesCompleted?: number;
  complete?: boolean;
}

const PAGE_SIZE = 8;

// Medal colours for ranks 1-3. Fixed pastels with dark text rather than theme colours, so gold
// reads as gold in every theme.
const MEDAL: Record<number, string> = {
  1: 'bg-yellow-200 text-yellow-900',
  2: 'bg-slate-200 text-slate-700',
  3: 'bg-orange-200 text-orange-900',
};

// A finished round is measured against par. One in progress has only played some holes, so par for the whole
// course would make it look far better than it is: show its raw strokes and how far through it is instead.
function Score({ entry, par, size }: { entry: LeaderboardEntry; par: number; size: 'sm' | 'md' }) {
  const { formatNumber } = useIntl();
  if (entry.complete === false && entry.holesCompleted !== undefined) {
    return (
      <span className="font-display inline-flex items-center gap-2 self-start rounded-full bg-base-content/10 px-2 py-0.5 text-sm tabular-nums text-base-content/80">
        {formatNumber(entry.totalStrokes / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        <span className="text-xs text-base-content/60">
          <FormattedMessage
            defaultMessage="thru {done}"
            id="bmlZ+F"
            description="Leaderboard row: golf's 'thru N' - how many holes of the course an unfinished round has played"
            values={{ done: entry.holesCompleted }}
          />
        </span>
      </span>
    );
  }
  return <ParDelta totalStrokes={entry.totalStrokes} par={par} size={size} />;
}

function PodiumRow({ entry, par }: { entry: LeaderboardEntry; par: number }) {
  const { rowGradientClass } = useRowHighlight(entry.userId);
  return (
    <li className={`flex items-center gap-3 rounded-xl px-2 py-1.5 -mx-2 ${rowGradientClass}`}>
      <span className={`w-10 h-12 shrink-0 rounded-lg grid place-items-center font-display text-2xl font-bold ${MEDAL[entry.rank] ?? 'bg-base-content/5'}`}>
        {entry.rank}
      </span>
      <ProfileAvatar profileImageUrl={entry.profileImageUrl} alias={entry.alias} size="md" />
      <div className="flex flex-col min-w-0">
        <PlayerName userId={entry.userId} alias={entry.alias} className="font-display text-xl font-semibold" />
        <Score entry={entry} par={par} size="md" />
      </div>
    </li>
  );
}

function CompactRow({ entry, par }: { entry: LeaderboardEntry; par: number }) {
  const { rowGradientClass } = useRowHighlight(entry.userId);
  return (
    <li className={`flex items-center gap-2.5 text-base rounded-lg px-2 py-1 -mx-2 ${rowGradientClass}`}>
      <span className="min-w-8 h-8 px-1 shrink-0 rounded-lg grid place-items-center font-display font-semibold bg-base-content/5">{entry.rank}</span>
      <ProfileAvatar profileImageUrl={entry.profileImageUrl} alias={entry.alias} size="sm" />
      <PlayerName userId={entry.userId} alias={entry.alias} className="flex-1 font-display font-medium" />
      <Score entry={entry} par={par} size="sm" />
    </li>
  );
}

// Always 7 slots once there are more than 7 pages - first, last, and the current page with its
// neighbours, gaps elided - so the bar's width doesn't jump around as you page.
function pageItems(page: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const start = Math.max(2, Math.min(page - 1, total - 4));
  const end = Math.min(total - 1, Math.max(page + 1, 5));
  const items: (number | 'gap')[] = [1];
  if (start > 2) items.push('gap');
  for (let p = start; p <= end; p++) items.push(p);
  if (end < total - 1) items.push('gap');
  items.push(total);
  return items;
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  const { formatMessage } = useIntl();
  return (
    <nav
      className="flex items-center justify-center gap-1"
      aria-label={formatMessage({ defaultMessage: 'Leaderboard pages', id: 'rTeivu', description: 'Accessible label for the leaderboard page switcher' })}
    >
      <button
        type="button"
        className="btn btn-xs btn-ghost btn-square"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        aria-label={formatMessage({ defaultMessage: 'Previous page', id: 'jNCSqQ', description: 'Leaderboard page switcher: previous page button' })}
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
      <div className="join">
        {pageItems(page, totalPages).map((item, i) =>
          item === 'gap' ? (
            <span key={`gap-${i}`} className="join-item btn btn-xs btn-disabled" aria-hidden>
              <FormattedMessage defaultMessage="…" id="CzhnGq" description="Leaderboard page switcher: marks skipped page numbers" />
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`join-item btn btn-xs ${item === page ? 'btn-active' : ''}`}
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onChange(item)}
            >
              {item}
            </button>
          ),
        )}
      </div>
      <button
        type="button"
        className="btn btn-xs btn-ghost btn-square"
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        aria-label={formatMessage({ defaultMessage: 'Next page', id: 'WHbedW', description: 'Leaderboard page switcher: next page button' })}
      >
        <ArrowRight className="w-4 h-4" />
      </button>
    </nav>
  );
}

const GLASS_SURFACE = 'card pop-card p-5';

interface LeaderboardProps {
  /** Already ranked and sorted, best first. */
  entries: LeaderboardEntry[];
  /** Course par (sum of its holes) or the hole's par - deltas are measured from this. */
  par: number;
  scope: 'course' | 'hole';
  /** Defaults to "Leaderboard". */
  title?: ReactNode;
  /** Card surface classes, padding included; defaults to a pop-card. Pass `card` for a block nested in another card. */
  surfaceClassName?: string;
  className?: string;
}

// A course or hole leaderboard: 8 players a page, with ranks 1-3 emphasised on the first page only.
export default function Leaderboard({ entries, par, scope, title, surfaceClassName = GLASS_SURFACE, className = '' }: LeaderboardProps) {
  const [requestedPage, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  // Clamp rather than reset in an effect: if new entries shrink the board, show its last page.
  const page = Math.min(requestedPage, totalPages);
  const rows = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const podiumCount = page === 1 ? 3 : 0;

  return (
    <section className={`${surfaceClassName} flex flex-col gap-4 w-full ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">
          {title ?? <FormattedMessage defaultMessage="Leaderboard" id="3UiB/1" description="Course section: heading of the course leaderboard" />}
        </h2>
        <span className="text-sm text-base-content/60 shrink-0">
          {scope === 'course' ? (
            <FormattedMessage defaultMessage="Course par {par}" id="1QV7dO" description="Leaderboard header: the course's total par" values={{ par }} />
          ) : (
            <FormattedMessage defaultMessage="Par {par}" id="UeycJr" description="Leaderboard header: the hole's par" values={{ par }} />
          )}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-base-content/60">
          <FormattedMessage defaultMessage="No scores yet." id="JlONAg" description="Leaderboard: shown when no one has a score yet" />
        </p>
      ) : (
        <>
          {podiumCount > 0 && (
            <ol className="flex flex-col gap-3">
              {rows.slice(0, podiumCount).map((entry) => (
                <PodiumRow key={entry.userId} entry={entry} par={par} />
              ))}
            </ol>
          )}
          {rows.length > podiumCount && (
            <ol className="flex flex-col gap-2">
              {rows.slice(podiumCount).map((entry) => (
                <CompactRow key={entry.userId} entry={entry} par={par} />
              ))}
            </ol>
          )}
          {totalPages > 1 && <Pager page={page} totalPages={totalPages} onChange={setPage} />}
        </>
      )}
    </section>
  );
}
