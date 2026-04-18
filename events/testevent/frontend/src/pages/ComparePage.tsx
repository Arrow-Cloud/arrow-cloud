import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { GradeImage } from '@shared/components/GradeImage';
import { BannerImage } from '@shared/components/ui/BannerImage';
import { DifficultyChip } from '@shared/components/DifficultyChip';
import { useLeaderboard, useEventChartsMeta, fetchUserBests } from '../services/eventStateApi';
import type { PlayItem, UserSummary } from '../services/eventStateApi';
import { ArrowLeftRight, Loader2, Minus, ChevronDown } from 'lucide-react';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';
import { getStoredUser } from '@shared/utils/rivalHighlight';

interface UserData {
  summary: UserSummary | null;
  bests: PlayItem[];
}

interface UserOption {
  id: string;
  alias: string;
}

function PlayerCombobox({
  value,
  onChange,
  options,
  placeholder,
  label,
}: {
  value: string;
  onChange: (id: string) => void;
  options: UserOption[];
  placeholder: string;
  label: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);
  const filtered = query ? options.filter((o) => o.alias.toLowerCase().includes(query.toLowerCase())) : options;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <label className="label text-sm font-medium pb-1">{label}</label>
      <div className="input input-bordered w-full flex items-center gap-1 cursor-text" onClick={() => setOpen(true)}>
        <input
          type="text"
          className="flex-1 bg-transparent outline-none min-w-0 text-sm"
          placeholder={selected ? selected.alias : placeholder}
          value={open ? query : (selected?.alias ?? '')}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
        />
        <ChevronDown className="w-4 h-4 text-base-content/40 shrink-0" />
      </div>
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-lg bg-base-200 shadow-lg ring-1 ring-base-content/10 py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-base-content/40">
              <FormattedMessage defaultMessage="No players found" id="C0qitE" description="No matching players in combobox" />
            </li>
          ) : (
            filtered.map((o) => (
              <li
                key={o.id}
                className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-base-content/10 ${o.id === value ? 'text-accent font-semibold' : ''}`}
                onMouseDown={() => {
                  onChange(o.id);
                  setQuery('');
                  setOpen(false);
                }}
              >
                {o.alias}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default function ComparePage() {
  const intl = useIntl();
  const { paramA, paramB } = useParams<{ paramA?: string; paramB?: string }>();
  const navigate = useNavigate();
  const { data: allUsers, loading: usersLoading, loadingMore: usersLoadingMore, hasMore: usersHasMore, loadMore: usersLoadMore } = useLeaderboard(100);
  const { data: charts, loading: chartsLoading } = useEventChartsMeta();
  const storedUser = getStoredUser();

  const [userIdA, setUserIdA] = useState(paramA || '');
  const [userIdB, setUserIdB] = useState(paramB || '');
  const [dataA, setDataA] = useState<UserData | null>(null);
  const [dataB, setDataB] = useState<UserData | null>(null);
  const [comparing, setComparing] = useState(false);

  const getUserId = (u: (typeof allUsers)[number]) => u.userId || u.pk?.replace('USER#', '') || '';

  // Sorted user options for comboboxes
  const userOptions = useMemo<UserOption[]>(
    () => allUsers.map((u) => ({ id: getUserId(u), alias: u.playerAlias })).sort((a, b) => a.alias.localeCompare(b.alias)),
    [allUsers],
  );

  // Auto-load all users for dropdown selection
  useEffect(() => {
    if (usersHasMore && !usersLoading && !usersLoadingMore) usersLoadMore();
  }, [usersHasMore, usersLoading, usersLoadingMore, usersLoadMore]);

  // Sync URL when selections change
  useEffect(() => {
    const path = userIdA && userIdB ? `/compare/${userIdA}/${userIdB}` : userIdA ? `/compare/${userIdA}` : '/compare';
    navigate(path, { replace: true });
  }, [userIdA, userIdB, navigate]);

  // Prefill user A with logged-in user once users are loaded (only if no URL params)
  useEffect(() => {
    if (paramA || !storedUser?.id || allUsers.length === 0 || userIdA) return;
    const uid = storedUser.id.toString();
    const found = allUsers.some((u) => getUserId(u) === uid);
    if (found) setUserIdA(uid);
  }, [allUsers, storedUser?.id]);

  // Fetch comparison data when both users selected
  useEffect(() => {
    if (!userIdA || !userIdB) {
      setDataA(null);
      setDataB(null);
      return;
    }
    let cancelled = false;
    setComparing(true);
    Promise.all([fetchUserBests(userIdA), fetchUserBests(userIdB)])
      .then(([a, b]) => {
        if (!cancelled) {
          setDataA(a);
          setDataB(b);
        }
      })
      .finally(() => {
        if (!cancelled) setComparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userIdA, userIdB]);

  // Build per-chart comparison sorted by difficulty rating
  const comparison = useMemo(() => {
    if (!dataA || !dataB || charts.length === 0) return [];
    const mapA = new Map(dataA.bests.map((b) => [b.chartHash, b]));
    const mapB = new Map(dataB.bests.map((b) => [b.chartHash, b]));
    return [...charts]
      .sort((a, b) => a.difficultyRating - b.difficultyRating)
      .map((chart) => ({
        chart,
        bestA: mapA.get(chart.chartHash) || null,
        bestB: mapB.get(chart.chartHash) || null,
      }));
  }, [dataA, dataB, charts]);

  // Win / loss / tie tally
  const tally = useMemo(() => {
    let winsA = 0,
      winsB = 0,
      ties = 0;
    for (const { bestA, bestB } of comparison) {
      if (!bestA && !bestB) continue;
      if (!bestA) {
        winsB++;
        continue;
      }
      if (!bestB) {
        winsA++;
        continue;
      }
      if (bestA.score > bestB.score) winsA++;
      else if (bestB.score > bestA.score) winsB++;
      else ties++;
    }
    return { winsA, winsB, ties };
  }, [comparison]);

  const aliasA = userOptions.find((o) => o.id === userIdA)?.alias;
  const aliasB = userOptions.find((o) => o.id === userIdB)?.alias;

  const loading = usersLoading || chartsLoading;

  const selectPlaceholder = intl.formatMessage({
    defaultMessage: '— Select player —',
    id: 'PcXTv2',
    description: 'Compare page player select placeholder',
  });

  return (
    <div className="pt-24 pb-16 px-4">
      <div className="container mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <ArrowLeftRight className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold tracking-tight">
              <FormattedMessage defaultMessage="Compare Scores" id="80S5t2" description="Compare page heading" />
            </h1>
          </div>
          <p className="text-sm text-base-content/50">
            <FormattedMessage
              defaultMessage="Select two players to compare their best scores across all event charts"
              id="w+DzWh"
              description="Compare page subtitle"
            />
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        )}

        {!loading && (
          <>
            {/* User selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <PlayerCombobox
                value={userIdA}
                onChange={setUserIdA}
                options={userOptions}
                placeholder={selectPlaceholder}
                label={<FormattedMessage defaultMessage="Player A" id="PN7orN" description="Player A selector label" />}
              />
              <PlayerCombobox
                value={userIdB}
                onChange={setUserIdB}
                options={userOptions}
                placeholder={selectPlaceholder}
                label={<FormattedMessage defaultMessage="Player B" id="a7h4lm" description="Player B selector label" />}
              />
            </div>

            {/* Loading comparison */}
            {comparing && (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
              </div>
            )}

            {/* Results */}
            {!comparing && dataA && dataB && (
              <>
                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="bg-base-200 rounded-xl p-4 text-center">
                    <div className="text-sm text-base-content/50 truncate mb-1">{aliasA}</div>
                    <div className="text-2xl font-bold text-accent tabular-nums">
                      <FormattedNumber value={dataA.summary?.totalPoints || 0} />
                    </div>
                    <div className="text-xs text-base-content/40">
                      <FormattedMessage defaultMessage="Points" id="EGs7qP" description="Points label in compare summary" />
                    </div>
                  </div>
                  <div className="bg-base-200 rounded-xl p-4 text-center flex flex-col items-center justify-center">
                    <div className="flex items-center gap-2 text-lg font-bold tabular-nums">
                      <span className={tally.winsA > tally.winsB ? 'text-success' : 'text-base-content'}>{tally.winsA}</span>
                      {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx */}
                      <span className="text-base-content/30">{'-'}</span>
                      <span className={tally.winsB > tally.winsA ? 'text-success' : 'text-base-content'}>{tally.winsB}</span>
                    </div>
                    <div className="text-xs text-base-content/40">
                      <FormattedMessage defaultMessage="Wins" id="I1TxtX" description="Wins tally label in compare" />
                    </div>
                    {tally.ties > 0 && (
                      <div className="text-xs text-base-content/30 mt-0.5">
                        <FormattedMessage
                          defaultMessage="{count, plural, one {# tie} other {# ties}}"
                          id="NPm1HH"
                          description="Ties count in compare"
                          values={{ count: tally.ties }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="bg-base-200 rounded-xl p-4 text-center">
                    <div className="text-sm text-base-content/50 truncate mb-1">{aliasB}</div>
                    <div className="text-2xl font-bold text-accent tabular-nums">
                      <FormattedNumber value={dataB.summary?.totalPoints || 0} />
                    </div>
                    <div className="text-xs text-base-content/40">
                      <FormattedMessage defaultMessage="Points" id="EGs7qP" description="Points label in compare summary" />
                    </div>
                  </div>
                </div>

                {/* Per-chart comparison table */}
                <div className="overflow-x-auto">
                  <table className="table w-full">
                    <thead>
                      <tr className="border-base-content/10">
                        <th className="bg-base-200/50 font-semibold text-base-content">
                          <FormattedMessage defaultMessage="Chart" id="1Z8+qK" description="Chart column header in compare table" />
                        </th>
                        <th className="bg-base-200/50 font-semibold text-base-content text-center">{aliasA}</th>
                        <th className="bg-base-200/50 font-semibold text-base-content text-center">
                          <FormattedMessage defaultMessage="Delta" id="79gBbD" description="Delta column header in compare table" />
                        </th>
                        <th className="bg-base-200/50 font-semibold text-base-content text-center">{aliasB}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.map(({ chart, bestA, bestB }) => {
                        const aWins = bestA != null && (bestB == null || bestA.score > bestB.score);
                        const bWins = bestB != null && (bestA == null || bestB.score > bestA.score);

                        let delta: number | null = null;
                        let deltaStr = '';
                        if (bestA && bestB) {
                          delta = bestA.score - bestB.score;
                          const abs = Math.abs(delta);
                          deltaStr = abs < 0.005 ? '—' : `${delta > 0 ? '+' : '-'}${abs.toFixed(2)}%`;
                        }

                        return (
                          <tr key={chart.chartHash} className="border-base-content/5">
                            {/* Chart info */}
                            <td className="py-2">
                              <Link to={`/chart/${chart.chartHash}`} className="flex items-center gap-2 hover:text-accent transition-colors">
                                <div className="w-36 shrink-0 rounded-md overflow-hidden">
                                  <BannerImage
                                    bannerVariants={chart.bannerVariants as any}
                                    mdBannerUrl={chart.mdBannerUrl}
                                    smBannerUrl={chart.smBannerUrl}
                                    bannerUrl={chart.bannerUrl}
                                    alt=""
                                    className="w-full object-cover"
                                    style={{ aspectRatio: '2.56' }}
                                    sizePreference="responsive"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-medium text-sm truncate">
                                    {chart.songName ||
                                      intl.formatMessage({ defaultMessage: 'Unknown', id: 'Lppdo1', description: 'Fallback for unknown song name' })}
                                  </div>
                                  <DifficultyChip stepsType={chart.stepsType} difficulty={chart.difficulty} meter={chart.difficultyRating} size="sm" />
                                </div>
                              </Link>
                            </td>

                            {/* Player A score */}
                            <td className={`text-center py-2 ${aWins ? 'bg-success/10' : ''}`}>
                              {bestA ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <GradeImage grade={bestA.grade} className="w-5 h-5" />
                                  <span className={`tabular-nums text-sm font-medium ${aWins ? 'text-success' : ''}`}>
                                    {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx */}
                                    <FormattedNumber value={bestA.score} minimumFractionDigits={2} maximumFractionDigits={2} />
                                    {'%'}
                                  </span>
                                </div>
                              ) : (
                                <Minus className="w-4 h-4 text-base-content/20 mx-auto" />
                              )}
                            </td>

                            {/* Delta */}
                            <td className="text-center py-2 tabular-nums text-xs font-semibold whitespace-nowrap">
                              {delta !== null && deltaStr !== '—' ? (
                                <span className={delta > 0 ? 'text-success' : 'text-error'}>{deltaStr}</span>
                              ) : bestA && bestB ? (
                                <span className="text-base-content/30">{deltaStr}</span>
                              ) : (
                                <Minus className="w-4 h-4 text-base-content/20 mx-auto" />
                              )}
                            </td>

                            {/* Player B score */}
                            <td className={`text-center py-2 ${bWins ? 'bg-success/10' : ''}`}>
                              {bestB ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <GradeImage grade={bestB.grade} className="w-5 h-5" />
                                  <span className={`tabular-nums text-sm font-medium ${bWins ? 'text-success' : ''}`}>
                                    {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx */}
                                    <FormattedNumber value={bestB.score} minimumFractionDigits={2} maximumFractionDigits={2} />
                                    {'%'}
                                  </span>
                                </div>
                              ) : (
                                <Minus className="w-4 h-4 text-base-content/20 mx-auto" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
