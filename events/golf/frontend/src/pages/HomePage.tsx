import { useIntl, FormattedMessage } from 'react-intl';
import { Link } from 'react-router-dom';
import { Flag } from 'lucide-react';
import { useAuth } from '@shared/contexts/AuthContext';

const HomePage = () => {
  const { formatMessage } = useIntl();
  const { user } = useAuth();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen pt-16 pb-8 gap-6">
      <img
        src="https://assets.arrowcloud.dance/logos/20250725/ac%20logo.png"
        alt={formatMessage({ defaultMessage: 'Arrow Cloud', id: 'P9WhvC', description: 'Alt text for Arrow Cloud logo' })}
        className="w-32 h-32 drop-shadow-lg"
      />
      <h1 className="text-3xl font-bold text-accent tracking-tight">
        <FormattedMessage defaultMessage="Arrow Cloud" id="P17vjH" description="Arrow Cloud heading" />
      </h1>

      {user ? (
        <div className="mt-4 flex flex-col items-center gap-3">
          <p className="text-base-content/70">
            <FormattedMessage
              defaultMessage="Welcome back, {alias}."
              id="XNU1VG"
              description="Logged-in welcome message on homepage"
              values={{ alias: <span className="font-semibold text-base-content">{user.alias}</span> }}
            />
          </p>
          <Link to="/submit" className="btn btn-accent gap-2">
            <Flag className="w-4 h-4" />
            <FormattedMessage defaultMessage="Submit a Chart" id="yIaF8D" description="Submit chart CTA button on homepage" />
          </Link>
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-3">
          <p className="text-base-content/70">
            <FormattedMessage defaultMessage="Login to submit a chart." id="1aS/pR" description="Call to action for logged-out users on homepage" />
          </p>
          <Link to="/login" className="btn btn-accent gap-2">
            <FormattedMessage defaultMessage="Login" id="+ANEqj" description="Login button on homepage" />
          </Link>
        </div>
      )}
    </div>
  );
};

export default HomePage;
