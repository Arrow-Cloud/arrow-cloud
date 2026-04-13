import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GradeImage } from '@shared/components/GradeImage';
import { BannerImage } from '@shared/components/ui/BannerImage';
import { useChartDetail } from '../services/eventStateApi';
import type { ChartSort } from '../services/eventStateApi';
import { formatRelativeTimeAuto } from '@shared/utils/formatRelativeTime';
import { Music, Loader2, ArrowUpDown } from 'lucide-react';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';

export default function ChartDetailPage() {
  const { chartHash } = useParams<{ chartHash: string }>();
  const [sort, setSort] = useState<ChartSort>('score');
  const { chart, scores, loading, loadingMore, error, hasMore, loadMore } = useChartDetail(chartHash || '', sort);
  const intl = useIntl();

  function toggleSort(key: ChartSort) {
    if (sort !== key) setSort(key);
  }

  if (!chartHash) return null;

  return (
    <div className="pt-24 pb-16 px-4">
      <div className="container mx-auto max-w-3xl">
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

        {!loading && !error && (
          <>
            {/* Chart header */}
            <div className="mb-8">
              {(chart?.bannerUrl || chart?.mdBannerUrl || chart?.smBannerUrl || chart?.bannerVariants) && (
                <div className="rounded-xl overflow-hidden mb-4">
                  <BannerImage
                    bannerVariants={chart.bannerVariants as any}
                    mdBannerUrl={chart.mdBannerUrl}
                    smBannerUrl={chart.smBannerUrl}
                    bannerUrl={chart.bannerUrl}
                    alt={chart.songName || ''}
                    className="w-full object-cover"
                    style={{ aspectRatio: '2.56' }}
                    sizePreference="responsive"
                  />
                </div>
              )}
              <div className="flex items-center gap-3 mb-1">
                <Music className="w-6 h-6 text-accent shrink-0" />
                <h1 className="text-2xl font-bold tracking-tight truncate">
                  {chart?.songName || <FormattedMessage defaultMessage="Unknown Chart" id="0wXlKc" description="Fallback for unknown chart name" />}
                </h1>
              </div>
              {chart && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/50 ml-9">
                  <span>{chart.artist || chart.stepartist}</span>
                  <span>{chart.difficulty} {chart.difficultyRating}</span>
                  {chart.maxPoints > 0 && (
                    <>
                      <span className="text-accent font-semibold">
                        <FormattedMessage
                          defaultMessage="{points} pt max"
                          id="e50rwo"
                          description="Max points for a chart"
                          values={{ points: chart.maxPoints.toLocaleString() }}
                        />
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Scores table — server-sorted by score desc */}
            {scores.length === 0 ? (
              <p className="text-center text-base-content/50 py-12">
                <FormattedMessage defaultMessage="No scores for this chart yet" id="sFDbvm" description="Empty chart detail message" />
              </p>
            ) : (
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
                        <th className="bg-base-200/50 font-semibold text-base-content text-center">
                          <FormattedMessage defaultMessage="Grade" id="DYQ8XL" description="table header for grade column" />
                        </th>
                        <th className="bg-base-200/50 font-semibold text-base-content text-right">
                          <button className="inline-flex items-center gap-1 hover:text-accent transition-colors" onClick={() => toggleSort('score')}>
                            <FormattedMessage defaultMessage="Score" id="x7nBF5" description="table header for score column" />
                            <ArrowUpDown className={`w-3 h-3 ${sort === 'score' ? 'text-accent' : 'opacity-40'}`} />
                          </button>
                        </th>
                        <th className="bg-base-200/50 font-semibold text-base-content text-right">
                          <FormattedMessage defaultMessage="Points" id="1pefsG" description="table header for points column" />
                        </th>
                        <th className="bg-base-200/50 font-semibold text-base-content text-right">
                          <button className="inline-flex items-center gap-1 hover:text-accent transition-colors" onClick={() => toggleSort('time')}>
                            <FormattedMessage defaultMessage="Time" id="S1Vv4x" description="table header for time column" />
                            <ArrowUpDown className={`w-3 h-3 ${sort === 'time' ? 'text-accent' : 'opacity-40'}`} />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {scores.map((play, i) => (
                        <tr key={play.userId || play.playId} className="border-base-content/5 hover:bg-base-200/30">
                          <td className="text-center tabular-nums font-semibold text-base-content/60">{i + 1}</td>
                          <td>
                            <Link to={`/user/${play.userId}`} className="font-medium hover:text-accent transition-colors">
                              {play.playerAlias}
                            </Link>
                          </td>
                          <td className="text-center">
                            <GradeImage grade={play.grade} className="w-6 h-6 inline-block" />
                          </td>
                          <td className="text-right tabular-nums">
                            {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx */}
                            <FormattedNumber value={play.score} minimumFractionDigits={2} maximumFractionDigits={2} />{'%'}
                          </td>
                          <td className="text-right tabular-nums font-semibold text-accent">{play.points.toLocaleString()}</td>
                          <td className="text-right text-xs text-base-content/50">
                            {formatRelativeTimeAuto(play.timestamp, intl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {hasMore && (
                  <div className="flex justify-center mt-6">
                    <button className="btn btn-ghost btn-sm" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <FormattedMessage defaultMessage="Load More" id="8abn1D" description="Load more button" />
                      }
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
