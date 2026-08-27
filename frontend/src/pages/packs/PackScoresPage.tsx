/* eslint-disable formatjs/no-literal-string-in-jsx */
import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, X, Plus } from 'lucide-react';
import { AppPageLayout, Alert, GradeImage } from '../../components';
import { BannerImage, ProfileAvatar } from '../../components/ui';
import { LeaderboardToggle } from '../../components/leaderboards/LeaderboardToggle';
import { useLeaderboardView } from '../../contexts/LeaderboardViewContext';
import { getPackPlayerScores, getPack } from '../../services/api';
import { FormattedNumber } from 'react-intl';
import type { PackPlayerScoresResponse, PackPlayerScoreSimfile, PackPlayerScoresPlayer } from '../../schemas/apiSchemas';
import { baseLeaderboardId } from '../../types/leaderboards';

type DifficultyKey = 'medium' | 'hard' | 'challenge';

const DIFFICULTY_COLS: { key: DifficultyKey; label: string }[] = [
  { key: 'medium', label: 'Med' },
  { key: 'hard', label: 'Hard' },
  { key: 'challenge', label: 'Expert' },
];

type ScoreEntry = { score: string; grade: string };
type ChartScoreMap = Record<string, { EX?: ScoreEntry; ITG?: ScoreEntry; HardEX?: ScoreEntry }>;

type WinState = 'winner' | 'loser' | 'none';

interface ScoreContext {
  state: WinState;
  diff: number | null; // percentage-point diff vs reference (positive=won by, negative=behind by)
}

interface ScoreCellProps {
  player: PackPlayerScoresPlayer;
  simfile: PackPlayerScoreSimfile;
  diffKey: DifficultyKey;
  lbKey: 'HardEX' | 'EX' | 'ITG';
  ctx: ScoreContext;
}

const ScoreCell: React.FC<ScoreCellProps> = ({ player, simfile, diffKey, lbKey, ctx }) => {
  const chart = simfile.charts[diffKey];

  if (!chart) {
    return <td className="text-center text-base-content/20 text-sm px-2 py-3 border-l border-base-content/10">·</td>;
  }

  const entry = (player.scores as ChartScoreMap)[chart.hash]?.[lbKey];

  if (!entry) {
    return <td className="text-center text-base-content/30 text-sm px-2 py-3 border-l border-base-content/10">—</td>;
  }

  const { state, diff } = ctx;
  const scoreClass = state === 'winner' ? 'text-primary' : state === 'loser' ? 'text-base-content/45' : 'text-base-content/80';
  const showDiff = diff !== null && diff !== 0;
  const diffLabel = showDiff ? `${diff > 0 ? '+' : ''}${diff.toFixed(2)}%` : null;

  return (
    <td className="text-center px-3 py-3 border-l border-base-content/10">
      <div className="flex items-center justify-center gap-1.5">
        <GradeImage grade={entry.grade} className={`w-8 h-8 object-contain ${state === 'loser' ? 'opacity-50' : ''}`} />
        <div className="flex flex-col items-start">
          <span className={`font-bold text-base tabular-nums leading-tight ${scoreClass}`}>
            <FormattedNumber value={parseFloat(entry.score) / 100} style="percent" maximumFractionDigits={2} minimumFractionDigits={2} />
          </span>
          {diffLabel && <span className={`text-xs tabular-nums leading-tight ${state === 'winner' ? 'text-success' : 'text-error'}`}>{diffLabel}</span>}
        </div>
      </div>
    </td>
  );
};

function getScoreContext(
  allPlayers: PackPlayerScoresPlayer[],
  player: PackPlayerScoresPlayer,
  chartHash: string | undefined,
  lbKey: 'HardEX' | 'EX' | 'ITG',
): ScoreContext {
  if (!chartHash) return { state: 'none', diff: null };
  const playerScores = allPlayers
    .map((p) => ({ userId: p.userId, val: parseFloat((p.scores as ChartScoreMap)[chartHash]?.[lbKey]?.score ?? '') }))
    .filter((x) => !isNaN(x.val));
  if (playerScores.length < 2) return { state: 'none', diff: null };
  const sorted = [...playerScores].sort((a, b) => b.val - a.val);
  const maxVal = sorted[0].val;
  const myScore = playerScores.find((x) => x.userId === player.userId);
  if (!myScore) return { state: 'none', diff: null };
  if (myScore.val >= maxVal) {
    const secondVal = sorted[1].val;
    return { state: 'winner', diff: maxVal - secondVal };
  }
  return { state: 'loser', diff: myScore.val - maxVal };
}

export const PackScoresPage: React.FC = () => {
  const { packId, userId: routeUserId } = useParams<{ packId: string; userId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeLeaderboard: rawActiveLeaderboard } = useLeaderboardView();
  // Player-score comparisons don't have rate-eligible data yet - collapse to the base leaderboard.
  const activeLeaderboard = baseLeaderboardId(rawActiveLeaderboard);

  // Normalise playerIds from either route param or query param
  const playerIds = useMemo(() => {
    if (routeUserId) return [routeUserId];
    return (searchParams.get('players') ?? '').split(',').filter(Boolean);
  }, [routeUserId, searchParams]);

  const isSinglePlayer = playerIds.length === 1;

  const setPlayerIds = (ids: string[]) => {
    navigate(`/pack/${packId}/compare?players=${ids.join(',')}`, { replace: !!routeUserId });
  };

  const [data, setData] = useState<PackPlayerScoresResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lbUsers, setLbUsers] = useState<{ userId: string; alias: string; profileImageUrl: string | null }[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!packId) return;
    getPack(parseInt(packId, 10))
      .then((pack) => {
        const lb = pack.packLeaderboard;
        if (!lb) return;
        const users = Object.entries(lb.users)
          .map(([userId, info]) => ({ userId, alias: info.alias, profileImageUrl: info.profileImageUrl }))
          .sort((a, b) => a.alias.localeCompare(b.alias));
        setLbUsers(users);
      })
      .catch(() => {});
  }, [packId]);

  const playerIdsKey = playerIds.join(',');

  useEffect(() => {
    if (!packId || playerIds.length === 0) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    getPackPlayerScores(packId, playerIds)
      .then(setData)
      .catch((err) => setError(err?.message ?? 'Failed to load scores'))
      .finally(() => setLoading(false));
  }, [packId, playerIdsKey]);

  const handleRemovePlayer = (userId: string) => setPlayerIds(playerIds.filter((id) => id !== userId));
  const handleAddPlayer = (userId: string) => {
    if (playerIds.includes(userId)) return;
    setPlayerIds([...playerIds, userId]);
    setPickerSearch('');
    setShowPicker(false);
  };

  const availablePlayers = lbUsers.filter(
    (u) => !playerIds.includes(u.userId) && (!pickerSearch || u.alias.toLowerCase().includes(pickerSearch.toLowerCase())),
  );

  const singlePlayer = isSinglePlayer ? data?.players[0] : null;

  if (playerIds.length === 0) {
    return (
      <AppPageLayout accent="secondary">
        <div className="container mx-auto px-4 py-8 space-y-4 max-w-4xl">
          <button onClick={() => navigate(`/pack/${packId}`)} className="btn btn-ghost btn-sm gap-1">
            <ArrowLeft size={16} /> Back to Pack
          </button>
          <Alert variant="error">No players selected.</Alert>
        </div>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout accent="secondary">
      <div className="container mx-auto px-4 py-6 space-y-6 max-w-5xl">
        {/* Back nav */}
        <button onClick={() => navigate(`/pack/${packId}`)} className="btn btn-ghost btn-sm gap-1">
          <ArrowLeft size={16} /> Back to Pack
        </button>

        {/* Single-player header card */}
        {isSinglePlayer && singlePlayer && (
          <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
            <div className="card-body">
              <div className="flex items-center gap-4">
                <ProfileAvatar profileImageUrl={singlePlayer.profileImageUrl} alias={singlePlayer.alias} size="xl" />
                <div className="flex-1 min-w-0">
                  <Link to={`/user/${singlePlayer.userId}`} className="text-2xl font-bold hover:text-primary transition-colors truncate block">
                    {singlePlayer.alias}
                  </Link>
                  <div className="text-sm text-base-content/60 mt-0.5">Pack score summary</div>
                </div>
                <button onClick={() => setShowPicker((v) => !v)} className="btn btn-outline btn-sm gap-1 shrink-0">
                  <Plus size={14} /> Compare
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Multi-player: player chips */}
        {!isSinglePlayer && (
          <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg">
            <div className="card-body py-4">
              <div className="flex flex-wrap items-center gap-2">
                {(data?.players ?? []).map((p) => (
                  <div key={p.userId} className="flex items-center gap-1.5 bg-base-200/80 rounded-full pl-1 pr-2 py-1">
                    <ProfileAvatar profileImageUrl={p.profileImageUrl} alias={p.alias} size="sm" />
                    <Link to={`/pack/${packId}/player/${p.userId}`} className="text-sm font-medium hover:text-primary transition-colors">
                      {p.alias}
                    </Link>
                    <button onClick={() => handleRemovePlayer(p.userId)} className="btn btn-ghost btn-xs btn-circle ml-0.5">
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {playerIds
                  .filter((id) => !data?.players.find((p) => p.userId === id))
                  .map((id) => (
                    <div key={id} className="flex items-center gap-1.5 bg-base-200/50 rounded-full px-3 py-1 opacity-50">
                      <span className="text-xs">Loading…</span>
                      <button onClick={() => handleRemovePlayer(id)} className="btn btn-ghost btn-xs btn-circle">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                <button onClick={() => setShowPicker((v) => !v)} className="btn btn-outline btn-sm gap-1">
                  <Plus size={14} /> Add player
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Player picker dropdown (shown as overlay below header) */}
        {showPicker && (
          <div className="card bg-base-200 shadow-xl border border-base-300">
            <div className="card-body py-3 px-3 space-y-2">
              <input
                autoFocus
                type="text"
                placeholder="Search players…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="input input-bordered input-sm w-full"
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-48 overflow-y-auto">
                {availablePlayers.length === 0 ? (
                  <div className="col-span-full text-sm text-base-content/50 py-3 text-center">No players found</div>
                ) : (
                  availablePlayers.map((u) => (
                    <button
                      key={u.userId}
                      onClick={() => handleAddPlayer(u.userId)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-base-300/60 transition-colors text-left"
                    >
                      <ProfileAvatar profileImageUrl={u.profileImageUrl} alias={u.alias} size="sm" />
                      <span className="text-sm truncate">{u.alias}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard toggle */}
        <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={40} className="text-primary animate-spin" />
          </div>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        {!loading && data && data.players.length > 0 && (
          <div className="card bg-base-100/60 backdrop-blur-sm shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table table-sm [&_tr]:!bg-transparent">
                <thead>
                  <tr>
                    <th className="bg-base-200/50 font-semibold text-base-content text-left min-w-52">Song</th>
                    {!isSinglePlayer && <th className="bg-base-200/50 font-semibold text-base-content text-left w-px whitespace-nowrap">Player</th>}
                    {DIFFICULTY_COLS.map(({ key, label }) => (
                      <th key={key} className="bg-base-200/50 font-semibold text-base-content text-center w-36">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                {data.simfiles.map((sf, sfIdx) => (
                  <tbody key={sf.simfileId} className={sfIdx % 2 === 1 ? 'bg-base-content/[0.025]' : ''}>
                    {data.players.map((player, playerIdx) => (
                      <tr key={`${sf.simfileId}-${player.userId}`} className={playerIdx === 0 && sfIdx > 0 ? 'border-t border-base-content/5' : ''}>
                        {/* Song column: only on first player row, spans all */}
                        {playerIdx === 0 && (
                          <td rowSpan={data.players.length} className="py-2 pr-4 align-middle">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="shrink-0 rounded overflow-hidden shadow-sm" style={{ width: 100, aspectRatio: '2.56' }}>
                                <BannerImage
                                  bannerUrl={sf.bannerUrl}
                                  mdBannerUrl={sf.mdBannerUrl}
                                  smBannerUrl={sf.smBannerUrl}
                                  bannerVariants={sf.bannerVariants}
                                  alt={sf.title}
                                  className="w-full h-full object-cover"
                                  iconSize={14}
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-base-content text-sm truncate">{sf.title}</div>
                                {sf.artist && <div className="text-xs text-base-content/60 truncate">{sf.artist}</div>}
                              </div>
                            </div>
                          </td>
                        )}
                        {/* Player column (multi only) */}
                        {!isSinglePlayer && (
                          <td className="py-2 px-2 align-middle border-l border-base-content/10 w-px whitespace-nowrap">
                            <Link to={`/pack/${packId}/player/${player.userId}`} className="hover:opacity-80 transition-opacity">
                              {player.profileImageUrl ? (
                                <ProfileAvatar profileImageUrl={player.profileImageUrl} alias={player.alias} size="sm" />
                              ) : (
                                <span className="text-sm font-medium hover:text-primary transition-colors">{player.alias}</span>
                              )}
                            </Link>
                          </td>
                        )}
                        {/* Score cells */}
                        {DIFFICULTY_COLS.map(({ key }) => (
                          <ScoreCell
                            key={key}
                            player={player}
                            simfile={sf}
                            diffKey={key}
                            lbKey={activeLeaderboard}
                            ctx={
                              isSinglePlayer ? { state: 'none', diff: null } : getScoreContext(data.players, player, sf.charts[key]?.hash, activeLeaderboard)
                            }
                          />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </div>
        )}
      </div>
    </AppPageLayout>
  );
};
