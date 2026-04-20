import { useAuth } from '@shared/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Sparkles, Music, Info, Users } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

export default function HomePage() {
  const { user } = useAuth();

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
                  defaultMessage="We are tracking scores from ITL 2026 for a small selection of charts rated 7 through 11. Each chart has a point value based on its difficulty."
                  id="Gzhubc"
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

        {/* CTA */}
        <div className="text-center">
          {user ? (
            <div className="space-y-3">
              <p className="text-base-content/60 text-sm">
                <FormattedMessage
                  defaultMessage="Signed in as {alias}"
                  id="RpjIfi"
                  description="Signed in status text"
                  values={{ alias: <span className="font-semibold text-base-content">{user.alias}</span> }}
                />
              </p>
              <Link to="/charts" className="btn btn-accent btn-sm gap-2">
                <Music className="w-4 h-4" />
                <FormattedMessage defaultMessage="View Charts" id="vdjx4V" description="View charts CTA button" />
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-base-content/50 text-sm">
                <FormattedMessage
                  defaultMessage="Sign in with your Arrow Cloud account to see your scores"
                  id="n/T0tJ"
                  description="Sign in prompt for unauthenticated users"
                />
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link to="/login" className="btn btn-accent btn-sm">
                  <FormattedMessage defaultMessage="Sign In" id="HC1HLX" description="Sign in button" />
                </Link>
                <Link to="/charts" className="btn btn-ghost btn-sm gap-2">
                  <Music className="w-4 h-4" />
                  <FormattedMessage defaultMessage="View Charts" id="CDvvYi" description="View charts link button" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
