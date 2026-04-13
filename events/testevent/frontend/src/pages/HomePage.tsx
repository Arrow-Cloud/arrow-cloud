import { Link } from 'react-router-dom';
import { GradeImage } from '@shared/components/GradeImage';
import { BannerImage } from '@shared/components/ui/BannerImage';
import { useActivity } from '../services/eventStateApi';
import { formatRelativeTimeAuto } from '@shared/utils/formatRelativeTime';
import { Sparkles, Music, Info, Users, Activity, Loader2 } from 'lucide-react';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';

export default function HomePage() {
  const { data, loading, error } = useActivity(30);
  const intl = useIntl();

  return (
    <div className="pt-24 pb-16 px-4">
      <div className="container mx-auto max-w-3xl">
        {/* Hero */}
        <div className="text-center mb-12">
          <Sparkles className="w-10 h-10 text-accent mx-auto mb-4" />
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">
            <FormattedMessage defaultMessage="Test Event" id="F1bHmB" description="Event name heading on home page" />
          </h1>
          <p className="text-lg text-base-content/60 max-w-lg mx-auto">
            <FormattedMessage defaultMessage="A demonstration of custom event hosting on Arrow Cloud" id="oMRPWh" description="Event tagline on home page" />
          </p>
        </div>

        {/* Info cards */}
        <div className="grid gap-4 sm:grid-cols-2 mb-10">
          <div className="card bg-base-200 shadow-sm">
            <div className="card-body gap-3 p-5">
              <div className="flex items-center gap-2 text-accent">
                <Info className="w-5 h-5 shrink-0" />
                <h2 className="font-semibold text-sm">
                  <FormattedMessage defaultMessage="What is this?" id="iFmMTg" description="Info card heading" />
                </h2>
              </div>
              <p className="text-sm text-base-content/70 leading-relaxed">
                <FormattedMessage
                  defaultMessage="This is a test event site demonstrating the custom event capabilities of the Arrow Cloud platform. It is not intended to be a competitive event — just a showcase of what's possible."
                  id="yiQ5YO"
                  description="Info card body explaining what the event is"
                />
              </p>
            </div>
          </div>

          <div className="card bg-base-200 shadow-sm">
            <div className="card-body gap-3 p-5">
              <div className="flex items-center gap-2 text-accent">
                <Music className="w-5 h-5 shrink-0" />
                <h2 className="font-semibold text-sm">
                  <FormattedMessage defaultMessage="The Charts" id="3TDkD2" description="Charts info card heading" />
                </h2>
              </div>
              <p className="text-sm text-base-content/70 leading-relaxed">
                <FormattedMessage
                  defaultMessage="We are tracking scores from ITL 2026 for a small selection of charts rated 7 through 11. Points are not calculated the same as ITL, it is a simple percentage to points calculation for demonstration purposes."
                  id="T62fg2"
                  description="Charts info card body"
                />
              </p>
            </div>
          </div>

          <div className="card bg-base-200 shadow-sm sm:col-span-2">
            <div className="card-body gap-3 p-5">
              <div className="flex items-center gap-2 text-accent">
                <Users className="w-5 h-5 shrink-0" />
                <h2 className="font-semibold text-sm">
                  <FormattedMessage defaultMessage="Participation" id="R+580z" description="Participation info card heading" />
                </h2>
              </div>
              <p className="text-sm text-base-content/70 leading-relaxed">
                <FormattedMessage
                  defaultMessage="All users on Arrow Cloud are opted in automatically. If you have an account and submit scores for any of the tracked charts, they'll appear here."
                  id="+rXM0L"
                  description="Participation info card body"
                />
              </p>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold">
              <FormattedMessage defaultMessage="Recent Activity" id="k145ne" description="Recent activity section heading on home page" />
            </h2>
          </div>

          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          )}

          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && data.length === 0 && (
            <p className="text-center text-base-content/50 py-8 text-sm">
              <FormattedMessage defaultMessage="No activity yet — scores will appear here as they come in" id="FpXac3" description="Empty activity on home page" />
            </p>
          )}

          {!loading && !error && data.length > 0 && (
            <div className="space-y-2">
              {data.map((play) => (
                <div
                  key={`${play.playId}`}
                  className="flex items-center gap-3 rounded-xl bg-base-200 p-3 ring-1 ring-base-content/5"
                >
                  {/* Banner */}
                  <Link to={`/chart/${play.chartHash}`} className="w-24 shrink-0 rounded-lg overflow-hidden">
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
                  </Link>

                  {/* Grade */}
                  <div className="w-8 shrink-0 flex justify-center">
                    <GradeImage grade={play.grade} className="w-8 h-8" />
                  </div>

                  {/* Song + Player info */}
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/chart/${play.chartHash}`}
                      className="font-medium text-sm truncate block hover:text-accent transition-colors"
                    >
                      {play.songName || <FormattedMessage defaultMessage="Unknown" id="Lppdo1" description="Fallback for unknown song name" />}
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-base-content/50 mt-0.5">
                      <Link to={`/user/${play.userId}`} className="hover:text-accent transition-colors">
                        {play.playerAlias}
                      </Link>
                      {play.points > 0 && (
                        <span className="text-accent font-semibold tabular-nums">
                          <FormattedMessage
                            defaultMessage="{points} pt"
                            id="rj/gZn"
                            description="Points badge on event chart card"
                            values={{ points: play.points.toLocaleString() }}
                          />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right shrink-0">
                    <span className="text-info font-bold tabular-nums">
                      {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx */}
                      <FormattedNumber value={play.score} minimumFractionDigits={2} maximumFractionDigits={2} />{'%'}
                    </span>
                  </div>

                  {/* Timestamp */}
                  <div className="text-xs text-base-content/40 shrink-0 w-20 text-right">
                    {formatRelativeTimeAuto(play.timestamp, intl)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
