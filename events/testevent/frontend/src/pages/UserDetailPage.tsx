import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GradeImage } from '@shared/components/GradeImage';
import { DifficultyChip } from '@shared/components/DifficultyChip';
import { BannerImage } from '@shared/components/ui/BannerImage';
import { useUserDetail } from '../services/eventStateApi';
import type { PlayItem } from '../services/eventStateApi';
import { formatRelativeTimeAuto } from '@shared/utils/formatRelativeTime';
import { User, Loader2, ArrowUpDown, Search, ArrowLeftRight } from 'lucide-react';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';
import { getStoredUser } from '@shared/utils/rivalHighlight';

type BestSortKey = 'name' | 'rating' | 'score' | 'date';
type SortDir = 'asc' | 'desc';

function sortBests(bests: PlayItem[], key: BestSortKey, dir: SortDir) {
  return [...bests].sort((a, b) => {
    let cmp = 0;
    if (key === 'name') cmp = (a.songName || '').localeCompare(b.songName || '');
    else if (key === 'rating') cmp = a.difficultyRating - b.difficultyRating;
    else if (key === 'score') cmp = a.score - b.score;
    else cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return dir === 'desc' ? -cmp : cmp;
  });
}

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { summary, bests, loading, error } = useUserDetail(userId || '');
  const intl = useIntl();
  const [sortKey, setSortKey] = useState<BestSortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => sortBests(bests, sortKey, sortDir), [bests, sortKey, sortDir]);
  const storedUser = getStoredUser();
  const isOtherUser = storedUser?.id && storedUser.id.toString() !== userId;

  function toggleSort(key: BestSortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }

  if (!userId) return null;

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

        {!loading && !error && !summary && (
          <div className="text-center py-16">
            <Search className="w-10 h-10 text-base-content/20 mx-auto mb-4" />
            <p className="text-base-content/50">
              <FormattedMessage defaultMessage="No event scores found for this user yet" id="I5zajx" description="User has no event scores message" />
            </p>
            <p className="text-base-content/30 text-sm mt-1">
              <FormattedMessage defaultMessage="Scores will appear here once they play any of the event charts" id="B/f937" description="User no scores hint" />
            </p>
          </div>
        )}

        {!loading && !error && summary && (
          <>
            {/* User header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <User className="w-6 h-6 text-accent" />
                <h1 className="text-2xl font-bold tracking-tight">{summary.playerAlias}</h1>
                {isOtherUser && (
                  <Link to={`/compare/${storedUser!.id}/${userId}`} className="btn btn-ghost btn-sm gap-1.5 ml-auto">
                    <ArrowLeftRight className="w-4 h-4" />
                    <FormattedMessage defaultMessage="Compare" id="5qGOtz" description="Compare scores button on user detail page" />
                  </Link>
                )}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="bg-base-200 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-accent tabular-nums">
                    <FormattedNumber value={summary.totalPoints} />
                  </div>
                  <div className="text-xs text-base-content/50">
                    <FormattedMessage defaultMessage="Points" id="hTHtn8" description="Points stat label" />
                  </div>
                </div>
                <div className="bg-base-200 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold tabular-nums">{summary.chartsPlayed}</div>
                  <div className="text-xs text-base-content/50">
                    <FormattedMessage defaultMessage="Charts" id="Azholc" description="Charts stat label" />
                  </div>
                </div>
                <div className="bg-base-200 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold tabular-nums">{summary.totalPlays}</div>
                  <div className="text-xs text-base-content/50">
                    <FormattedMessage defaultMessage="Plays" id="njHAOU" description="Plays stat label" />
                  </div>
                </div>
                <div className="bg-base-200 rounded-xl p-3 text-center">
                  <div className="text-sm font-medium text-base-content/70">{formatRelativeTimeAuto(summary.lastPlayAt, intl)}</div>
                  <div className="text-xs text-base-content/50">
                    <FormattedMessage defaultMessage="Last Play" id="ap8eaY" description="Last play stat label" />
                  </div>
                </div>
              </div>
            </div>

            {/* Personal bests */}
            <div>
              <h2 className="text-lg font-semibold mb-4">
                <FormattedMessage defaultMessage="Personal Bests" id="EhDYsR" description="Personal bests section heading" />
              </h2>

              {bests.length === 0 ? (
                <p className="text-base-content/50 text-sm">
                  <FormattedMessage defaultMessage="No personal bests yet" id="29iUR2" description="Empty bests message" />
                </p>
              ) : (
                <div className="space-y-2">
                  {/* Sort controls */}
                  <div className="flex items-center gap-2 text-xs text-base-content/50 mb-3">
                    <span>
                      <FormattedMessage defaultMessage="Sort by:" id="KYLlCP" description="Sort by label" />
                    </span>
                    {(['name', 'rating', 'score', 'date'] as BestSortKey[]).map((key) => (
                      <button key={key} onClick={() => toggleSort(key)} className={`btn btn-xs ${sortKey === key ? 'btn-accent' : 'btn-ghost'}`}>
                        {key === 'name' && <FormattedMessage defaultMessage="Name" id="vmMgA0" description="Sort by name button" />}
                        {key === 'rating' && <FormattedMessage defaultMessage="Rating" id="bmeBEF" description="Sort by rating button" />}
                        {key === 'score' && <FormattedMessage defaultMessage="Score" id="25MuT/" description="Sort by score button" />}
                        {key === 'date' && <FormattedMessage defaultMessage="Date" id="cHck/q" description="Sort by date button" />}
                        {sortKey === key && <ArrowUpDown className="w-3 h-3 ml-0.5" />}
                      </button>
                    ))}
                  </div>

                  {/* Cards */}
                  {sorted.map((play) => (
                    <Link
                      key={play.chartHash}
                      to={`/chart/${play.chartHash}`}
                      className="flex items-center gap-3 rounded-xl bg-base-200 p-3 ring-1 ring-base-content/5 hover:ring-base-content/10 transition-all group"
                    >
                      {/* Banner thumbnail */}
                      <div className="w-20 shrink-0 rounded-lg overflow-hidden">
                        <BannerImage
                          bannerVariants={play.bannerVariants as any}
                          mdBannerUrl={play.mdBannerUrl}
                          smBannerUrl={play.smBannerUrl}
                          bannerUrl={play.bannerUrl}
                          alt=""
                          className="w-full object-cover"
                          style={{ aspectRatio: '2.56' }}
                          sizePreference="responsive"
                        />
                      </div>

                      {/* Song info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate group-hover:text-accent transition-colors">
                          {play.songName || <FormattedMessage defaultMessage="Unknown" id="Lppdo1" description="Fallback for unknown song name" />}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <DifficultyChip stepsType={null} difficulty={play.difficulty} meter={play.difficultyRating} size="sm" />
                          <span className="text-xs text-base-content/40">{formatRelativeTimeAuto(play.timestamp, intl)}</span>
                        </div>
                      </div>

                      {/* Score + Grade */}
                      <div className="text-right shrink-0">
                        <div className="flex items-center justify-end gap-2">
                          <GradeImage grade={play.grade} className="w-6 h-6" />
                          <span className="tabular-nums text-sm font-medium">
                            {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx */}
                            <FormattedNumber value={play.score} minimumFractionDigits={2} maximumFractionDigits={2} />
                            {'%'}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-accent tabular-nums mt-0.5">
                          <FormattedMessage
                            defaultMessage="{points} pt"
                            id="/z8+pG"
                            description="Points badge"
                            values={{ points: play.points.toLocaleString() }}
                          />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
