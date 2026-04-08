import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppPageLayout, ProfileAvatar } from '../../components';
import { LeaderboardToggle } from '../../components/leaderboards/LeaderboardToggle';
import { useLeaderboardView } from '../../contexts/LeaderboardViewContext';
import { getBlueShiftAllPhases } from '../../services/api';
import { BlueShiftAllPhasesResponse } from '../../schemas/apiSchemas';
import { computeHighlight, HighlightedAlias, getStoredUser } from '../../utils/rivalHighlight';
import { FormattedMessage, useIntl } from 'react-intl';

export const OverallLeaderboardPage: React.FC = () => {
  const { activeLeaderboard } = useLeaderboardView();
  const activeFilter: 'HardEX' | 'EX' | 'Money' = activeLeaderboard === 'ITG' ? 'Money' : (activeLeaderboard as any);
  const [data, setData] = useState<BlueShiftAllPhasesResponse | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { formatMessage, formatNumber } = useIntl();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getBlueShiftAllPhases();
        if (mounted) {
          setData(res);
          // Auto-select the latest available phase
          if (res.phases.length > 0) {
            setSelectedPhase(res.phases[res.phases.length - 1].phaseNumber);
          }
          setError(null);
        }
      } catch (e) {
        console.error('Failed to load leaderboard', e);
        if (mounted)
          setError(
            formatMessage({
              defaultMessage: 'Failed to load leaderboard',
              description: 'Error message shown when the leaderboard fails to load',
              id: 'YEQ3/1',
            }),
          );
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const leaderboardData = useMemo(() => {
    if (!data || data.phases.length === 0) return { rows: [] as any[], total: 0 };
    const selectedPhaseData = data.phases.find((p) => p.phaseNumber === selectedPhase);
    if (!selectedPhaseData) return { rows: [] as any[], total: 0 };

    switch (activeFilter) {
      case 'HardEX':
        return {
          rows: selectedPhaseData.leaderboards.hardEX.rankings,
          total: selectedPhaseData.leaderboards.hardEX.totalParticipants,
        };
      case 'EX':
        return {
          rows: selectedPhaseData.leaderboards.EX.rankings,
          total: selectedPhaseData.leaderboards.EX.totalParticipants,
        };
      case 'Money':
        return {
          rows: selectedPhaseData.leaderboards.money.rankings,
          total: selectedPhaseData.leaderboards.money.totalParticipants,
        };
      default:
        return { rows: [] as any[], total: 0 };
    }
  }, [data, activeFilter, selectedPhase]);

  const currentPhaseData = useMemo(() => {
    if (!data || data.phases.length === 0) return null;
    return data.phases.find((p) => p.phaseNumber === selectedPhase);
  }, [data, selectedPhase]);

  const storedUser = getStoredUser();
  const rivalIds: string[] = storedUser?.rivalUserIds || [];

  return (
    <AppPageLayout>
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Blue Shift Hero Logo (same style as HomePageNew) */}
        <div className="text-center mt-8 mb-12">
          <div className="mb-16 text-center flex justify-center">
            <h1 className="text-6xl md:text-8xl from-white via-primary-content to-accent-content animate-pulse">
              <img
                src="https://assets.arrowcloud.dance/logos/20250725/blue shift-t big.png"
                alt={formatMessage({ defaultMessage: 'Blue Shift', description: 'Alt text for Blue Shift logo', id: 'r2gihF' })}
                className="w-full max-w-[850px]"
              />
            </h1>
          </div>
        </div>
        <div className="card bg-base-100/80 p-6 backdrop-blur-sm shadow-lg">
          {/* Card Header: Title + Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h1 className="text-2xl font-bold text-base-content">
              <FormattedMessage defaultMessage="Overall Leaderboard" description="Title for the overall leaderboard page" id="GYz+Yc" />
            </h1>
            <LeaderboardToggle options={['HardEX', 'EX', 'ITG']} />
          </div>

          {/* Phase Selector Tabs */}
          {data && data.phases.length > 0 && (
            <div className="mb-6">
              <div className="flex justify-center">
                <div className="inline-flex gap-3 p-1 bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20 rounded-xl shadow-lg backdrop-blur-sm border border-primary/30">
                  {data.phases.map((phase) => (
                    <button
                      key={phase.phaseNumber}
                      className={`
                          relative px-8 py-3 rounded-lg font-bold text-lg transition-all duration-300 cursor-pointer
                          ${
                            selectedPhase === phase.phaseNumber
                              ? 'bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-xl'
                              : 'bg-base-100/50 text-base-content/70 hover:bg-base-100/80 hover:text-base-content'
                          }
                        `}
                      onClick={() => setSelectedPhase(phase.phaseNumber)}
                    >
                      <span className="relative z-10">
                        <FormattedMessage
                          defaultMessage="Phase {phaseNumber}"
                          description="Label for Blue Shift event phase tab"
                          id="ecAIWs"
                          values={{ phaseNumber: phase.phaseNumber }}
                        />
                      </span>
                      {selectedPhase === phase.phaseNumber && (
                        <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/50 via-secondary/50 to-accent/50 blur-xl"></span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Meta info within the same card */}
          {currentPhaseData && (
            <div className="text-sm text-base-content/70 mb-4 overflow-hidden">
              <div className="py-2">
                <FormattedMessage
                  defaultMessage="Participants: {count,number}"
                  id="O7TzM9"
                  description="Label for the number of participants in the overall leaderboard"
                  values={{ count: leaderboardData.total }}
                />
              </div>
              <div className="py-2">{currentPhaseData.pointsSystem.description}</div>
              <div className="py-2 text-xs text-base-content/60">
                <FormattedMessage
                  defaultMessage="Last generated: {date,date}"
                  id="Z7jjH4"
                  description="Label for the last generated timestamp of the overall leaderboard"
                  values={{ date: new Date(currentPhaseData.generatedAt) }}
                />
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-base-content/60">
              <FormattedMessage defaultMessage="Loading..." description="Loading state text" id="7N0/GV" />
            </div>
          ) : error ? (
            <div className="text-error">{error}</div>
          ) : leaderboardData.rows.length === 0 ? (
            <div className="text-base-content/60">
              <FormattedMessage defaultMessage="No leaderboard data available" description="Message shown when there is no leaderboard data" id="fhz3KS" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr className="border-base-content/10">
                    <th className="bg-base-200/50 font-semibold text-base-content text-center">
                      <FormattedMessage defaultMessage="Rank" description="Table header for the rank column" id="Bt+/uG" />
                    </th>
                    <th className="bg-base-200/50 font-semibold text-base-content">
                      <FormattedMessage defaultMessage="Player" description="Table header for the player column" id="QTkpuD" />
                    </th>
                    <th className="bg-base-200/50 font-semibold text-base-content text-center">
                      <FormattedMessage defaultMessage="Points" description="Table header for the points column" id="Jy5dn1" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardData.rows.map((entry: any) => {
                    const highlight = computeHighlight(storedUser?.id, rivalIds, entry.userId);
                    return (
                      <tr key={entry.rank} className={`hover:brightness-110 transition-colors border-base-content/5 ${highlight.rowGradientClass}`}>
                        <td className="py-3 text-center">
                          <div className={`font-bold ${highlight.rankColorClass}`}>
                            <FormattedMessage
                              defaultMessage="#{rank,number}"
                              description="stat indicating a user's rank"
                              values={{ rank: entry.rank }}
                              id="dQfrc/"
                            />
                          </div>
                        </td>
                        <td className="py-3">
                          <Link
                            to={`/user/${entry.userId}`}
                            className={`font-medium hover:text-primary transition-colors flex items-center gap-3 ${highlight.playerTextClass}`}
                          >
                            <ProfileAvatar profileImageUrl={entry.userProfileImageUrl} alias={entry.userAlias} size="sm" />
                            <HighlightedAlias alias={entry.userAlias} highlight={highlight} />
                          </Link>
                        </td>
                        <td className="py-3 text-center">
                          <div className={`font-bold ${highlight.scoreColorClass}`}>{formatNumber(entry.totalPoints)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="text-center">
          <Link to="/" className="btn btn-outline">
            <FormattedMessage defaultMessage="Back to Home" description="Button text to navigate back to the home page" id="kYDZI0" />
          </Link>
        </div>
      </div>
    </AppPageLayout>
  );
};

export default OverallLeaderboardPage;
