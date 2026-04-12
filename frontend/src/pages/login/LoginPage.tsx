import React, { useState, useEffect } from 'react';
import { LogIn, Mail, Lock, ArrowRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { TextInput, PasswordInput } from '../../components/forms';
import { AuthPageLayout, Alert } from '../../components';
import PasskeyButton from '../../components/auth/PasskeyButton';
import PasskeySetupPrompt from '../../components/auth/PasskeySetupPrompt';
import { getUserPasskeys } from '../../services/api';
import { isPasskeySupported } from '../../services/passkey';
import { FormattedMessage, useIntl } from 'react-intl';

const LoginHeader: React.FC = () => (
  <div className="text-center mb-8">
    <div className="flex justify-center mb-4">
      <div className="p-3 bg-primary/10 rounded-2xl">
        <LogIn className="w-8 h-8 text-primary" />
      </div>
    </div>
    <h1 className="text-3xl font-bold text-base-content">
      <FormattedMessage defaultMessage="Welcome Back" id="f78WCS" description="A heading displayed on the login page" />
    </h1>
    <p className="text-base-content/70 mt-2">
      <FormattedMessage defaultMessage="Sign in to your Arrow Cloud account" id="0UKMwf" description="A sub-heading displayed on the login page" />
    </p>
  </div>
);

interface RememberMeForgotSectionProps {
  rememberMe: boolean;
  onRememberMeChange: (checked: boolean) => void;
  onForgotPasswordClick: () => void;
  forgotPasswordUrl?: string;
}

const RememberMeForgotSection: React.FC<RememberMeForgotSectionProps> = ({ rememberMe, onRememberMeChange, onForgotPasswordClick, forgotPasswordUrl }) => (
  <div className="flex items-center justify-between">
    <label className="cursor-pointer label">
      <input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={rememberMe} onChange={(e) => onRememberMeChange(e.target.checked)} />
      <span className="label-text ml-2">
        <FormattedMessage defaultMessage="Remember me" id="BFIMJG" description="A label for a checkbox on the login screen" />
      </span>
    </label>
    {forgotPasswordUrl ? (
      <a href={forgotPasswordUrl} className="label-text-alt link link-primary hover:link-accent transition-colors">
        <FormattedMessage defaultMessage="Forgot password?" id="wun7o3" description="A label on a button, on the login screen" />
      </a>
    ) : (
      <button type="button" onClick={onForgotPasswordClick} className="label-text-alt link link-primary hover:link-accent transition-colors">
        <FormattedMessage defaultMessage="Forgot password?" id="wun7o3" description="A label on a button, on the login screen" />
      </button>
    )}
  </div>
);

interface LoginSubmitButtonProps {
  isLoading: boolean;
}

const LoginSubmitButton: React.FC<LoginSubmitButtonProps> = ({ isLoading }) => (
  <button
    type="submit"
    disabled={isLoading}
    className="btn btn-primary w-full text-lg font-semibold shadow-lg hover:shadow-primary/50 transition-all duration-300 transform hover:scale-[1.02]"
  >
    {isLoading ? (
      <>
        <span className="loading loading-spinner loading-sm"></span>
        <FormattedMessage defaultMessage="Signing In..." id="e39ysx" description="Displayed with a loading spinner while a login attempt is in progress" />
      </>
    ) : (
      <>
        <FormattedMessage defaultMessage="Sign In" id="sWELJA" description="The primary button on the login form" />
        <ArrowRight className="w-5 h-5 ml-2" />
      </>
    )}
  </button>
);

interface RegisterLinkSectionProps {
  registerUrl?: string;
  onRegisterClick: () => void;
}

const RegisterLinkSection: React.FC<RegisterLinkSectionProps> = ({ registerUrl, onRegisterClick }) => (
  <div className="text-center">
    <p className="text-base-content/70">
      <FormattedMessage
        defaultMessage="Don't have an account? <createLink>Create one here</createLink>"
        values={{
          createLink: (contents) =>
            registerUrl ? (
              <a
                href={registerUrl}
                className="link link-primary hover:link-accent font-semibold transition-colors"
              >
                {contents}
              </a>
            ) : (
              <a
                href="#"
                className="link link-primary hover:link-accent font-semibold transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  onRegisterClick();
                }}
              >
                {contents}
              </a>
            ),
        }}
        id="wK4IU8"
        description="Provides the option to switch from the login page to the registration page"
      />
    </p>
  </div>
);

interface PasskeySuccessViewProps {
  onContinue: () => void;
  onDismiss: () => void;
}

const PasskeySuccessView: React.FC<PasskeySuccessViewProps> = ({ onContinue, onDismiss }) => (
  <div className="text-center">
    <div className="flex justify-center mb-4">
      <div className="p-3 bg-success/10 rounded-2xl">
        <LogIn className="w-8 h-8 text-success" />
      </div>
    </div>
    <h1 className="text-3xl font-bold text-base-content mb-4">
      <FormattedMessage defaultMessage="Successfully Signed In!" id="5WyHgs" description="A heading displayed to a user after logging in" />
    </h1>
    <p className="text-base-content/70 mb-6">
      <FormattedMessage
        defaultMessage="Would you like to set up passwordless authentication for faster future sign-ins?"
        id="CtB3h2"
        description="A message displayed to a user after successfully logging in"
      />
    </p>

    <PasskeySetupPrompt variant="suggestion" hasExistingPasskeys={false} onSuccess={onContinue} onDismiss={onDismiss} />
  </div>
);

interface LoginPageProps {
  /** When true, shows Arrow Cloud logo, hides passkey, links register externally */
  eventMode?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ eventMode = false }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPasskeySetup, setShowPasskeySetup] = useState(false);
  const [preventRedirect, setPreventRedirect] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading, error, user } = useAuth();
  const { formatMessage } = useIntl();

  const from = location.state?.from?.pathname || '/';

  // Redirect if already authenticated (but not if we're showing passkey setup)
  useEffect(() => {
    if (user && !showPasskeySetup && !preventRedirect) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from, showPasskeySetup, preventRedirect]);

  // Check if user should be suggested to create a passkey
  const checkPasskeyStatus = async () => {
    try {
      // Only suggest if passkeys are supported
      if (!isPasskeySupported()) {
        return false;
      }

      // Small delay to ensure auth token is properly set in API calls
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if user has any passkeys
      const response = await getUserPasskeys();
      const hasPasskeys = response.passkeys && response.passkeys.length > 0;

      // Don't suggest if user already has passkeys
      if (hasPasskeys) {
        return false;
      }

      // Check if user has dismissed passkey setup recently (within 7 days)
      const dismissedAt = localStorage.getItem('passkeySetupDismissed');
      if (dismissedAt) {
        const dismissedDate = new Date(parseInt(dismissedAt));
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (dismissedDate > weekAgo) {
          return false;
        }
      }

      return true;
    } catch (error) {
      // If we can't check passkeys (e.g., API error), don't suggest
      console.log('Could not check passkey status:', error);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setPreventRedirect(true);

      await login(email, password, rememberMe);

      const shouldSuggest = await checkPasskeyStatus();

      if (shouldSuggest) {
        setShowPasskeySetup(true);
        setPreventRedirect(false);
      } else {
        setPreventRedirect(false);
        navigate(from, { replace: true });
      }
    } catch (err) {
      // Error is handled by the auth context
      setPreventRedirect(false);
      console.error('Login error:', err);
    }
  };

  const handlePasskeySetupSuccess = () => {
    setShowPasskeySetup(false);
    setPreventRedirect(false);
    navigate(from, { replace: true });
  };

  const handlePasskeySetupDismiss = () => {
    // Remember that user dismissed passkey setup
    localStorage.setItem('passkeySetupDismissed', Date.now().toString());
    setShowPasskeySetup(false);
    setPreventRedirect(false);
    navigate(from, { replace: true });
  };

  return (
    <AuthPageLayout eventMode={eventMode}>
      <div className="w-full max-w-md">
        <div className="card bg-base-100/95 backdrop-blur-lg shadow-2xl border border-base-300/30 ring-1 ring-white/10 mt-20">
          <div className="card-body p-8">
            {showPasskeySetup ? (
              <PasskeySuccessView onContinue={handlePasskeySetupSuccess} onDismiss={handlePasskeySetupDismiss} />
            ) : (
              <>
                {eventMode && (
                  <div className="flex justify-center mb-4">
                    <img
                      src="https://assets.arrowcloud.dance/logos/20250725/text-t.png"
                      alt="Arrow Cloud"
                      className="h-12 w-auto"
                    />
                  </div>
                )}

                {!eventMode && <LoginHeader />}

                {eventMode && (
                  <p className="text-center text-base-content/70 mb-6">
                    <FormattedMessage defaultMessage="Sign in to your Arrow Cloud account" id="0UKMwf" description="A sub-heading displayed on the login page" />
                  </p>
                )}

                {error && (
                  <Alert variant="error" className="mb-6">
                    {error}
                  </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <TextInput
                    type="email"
                    label={formatMessage({ defaultMessage: 'Email', id: 'AKJw1n', description: 'A label for a field of the login form' })}
                    placeholder={formatMessage({
                      defaultMessage: 'Enter your email',
                      id: '6oesOv',
                      description: 'A placeholder value displayed within an empty input of the login form',
                    })}
                    value={email}
                    onChange={setEmail}
                    icon={Mail}
                    required
                  />

                  <PasswordInput
                    label={formatMessage({ defaultMessage: 'Password', id: 'wkKwRk', description: 'A label for a field of the login form' })}
                    placeholder={formatMessage({
                      defaultMessage: 'Enter your password',
                      id: 'ZWQXbX',
                      description: 'A placeholder value displayed within an empty input of the login form',
                    })}
                    value={password}
                    onChange={setPassword}
                    icon={Lock}
                    required
                  />

                  <RememberMeForgotSection
                    rememberMe={rememberMe}
                    onRememberMeChange={setRememberMe}
                    onForgotPasswordClick={() => navigate('/forgot-password')}
                    forgotPasswordUrl={eventMode ? 'https://arrowcloud.dance/forgot-password' : undefined}
                  />

                  <LoginSubmitButton isLoading={isLoading} />
                </form>

                {!eventMode && (
                  <PasskeyButton onSuccess={() => navigate(from, { replace: true })} disabled={isLoading} className="mb-4" />
                )}

                <div className="divider text-base-content/50">
                  <FormattedMessage
                    defaultMessage="or"
                    id="cViiIu"
                    description="This separates the main login form from a section below it offering to switch to account registration"
                  />
                </div>

                <RegisterLinkSection
                  registerUrl={eventMode ? 'https://arrowcloud.dance/register' : undefined}
                  onRegisterClick={() => navigate('/register')}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </AuthPageLayout>
  );
};
