import { Link } from 'react-router-dom';
import { useLeaderboard } from '../services/eventStateApi';
import { Trophy, Loader2 } from 'lucide-react';
import { FormattedMessage, FormattedNumber } from 'react-intl';
import { getStoredUser, computeHighlight, HighlightedAlias } from '@shared/utils/rivalHighlight';

export default function LeaderboardPage() {
  const { data, loading, loadingMore, error, hasMore, loadMore } = useLeaderboard();
  const storedUser = getStoredUser();
  const currentUserId = storedUser?.id;
  const rivalIds = storedUser?.rivalUserIds ?? [];

  return (
    <div className="pt-24 pb-16 px-4">
      <div className="container mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold tracking-tight">
              <FormattedMessage defaultMessage="Leaderboard" id="ZzPt+i" description="Leaderboard page heading" />
            </h1>
          </div>
          <p className="text-sm text-base-content/50">
            <FormattedMessage defaultMessage="Ranked by total points across all event charts" id="/Z2ODS" description="Leaderboard subtitle" />
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && data.length === 0 && (
          <p className="text-center text-base-content/50 py-12">
            <FormattedMessage defaultMessage="No scores submitted yet" id="myXKrj" description="Empty leaderboard message" />
          </p>
        )}

        {!loading && !error && data.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr className="border-base-content/10">
                    {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx */}
                    <th className="bg-base-200/50 font-semibold text-base-content w-12 text-center">{'#'}</th>
                    <th className="bg-base-200/50 font-semibold text-base-content">
                      <FormattedMessage defaultMessage="Player" id="VzU8H9" description="table header for player column" />
                    </th>
                    <th className="bg-base-200/50 font-semibold text-base-content text-right">
                      <FormattedMessage defaultMessage="Points" id="1pefsG" description="table header for points column" />
                    </th>
                    <th className="bg-base-200/50 font-semibold text-base-content text-center">
                      <FormattedMessage defaultMessage="Charts" id="9Q4zvI" description="table header for charts played column" />
                    </th>
                    <th className="bg-base-200/50 font-semibold text-base-content text-center">
                      <FormattedMessage defaultMessage="Plays" id="wDZiN4" description="table header for total plays column" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((entry, i) => {
                    const userId = entry.userId || entry.pk?.replace('USER#', '') || '';
                    const hl = computeHighlight(currentUserId, rivalIds, userId);
                    return (
                      <tr key={userId} className={`border-base-content/5 hover:bg-base-200/30 ${hl.rowGradientClass}`}>
                        <td className="text-center tabular-nums font-semibold text-base-content/60">{i + 1}</td>
                        <td>
                          <Link to={`/user/${userId}`} className={`font-medium hover:text-accent transition-colors ${hl.playerTextClass}`}>
                            <HighlightedAlias alias={entry.playerAlias} highlight={hl} />
                          </Link>
                        </td>
                        <td className="text-right tabular-nums font-bold text-accent">
                          <FormattedNumber value={entry.totalPoints} />
                        </td>
                        <td className="text-center tabular-nums text-base-content/60">{entry.chartsPlayed}</td>
                        <td className="text-center tabular-nums text-base-content/60">{entry.totalPlays}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="flex justify-center mt-6">
                <button className="btn btn-ghost btn-sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FormattedMessage defaultMessage="Load More" id="8abn1D" description="Load more button" />
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
