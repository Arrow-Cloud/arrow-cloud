import React, { ReactNode, useState } from 'react';
import { UserPlus, Mail, Lock, User, ArrowRight } from 'lucide-react';
import { TextInput, PasswordInput } from '../../components/forms';
import { Alert } from '../../components';
import { FormattedMessage, useIntl } from 'react-intl';

interface RegistrationFormProps {
  onSubmit: (email: string, alias: string, password: string) => Promise<void>;
  isLoading: boolean;
  error: ReactNode | null;
  onNavigateToLogin: () => void;
}

const RegistrationHeader: React.FC = () => (
  <div className="text-center mb-8">
    <div className="flex justify-center mb-4">
      <div className="p-3 bg-secondary/10 rounded-2xl">
        <UserPlus className="w-8 h-8 text-secondary" />
      </div>
    </div>
    <h1 className="text-3xl font-bold text-base-content">
      <FormattedMessage description="Header displayed on the registration page" defaultMessage="Join Arrow Cloud" id="cetLzw" />
    </h1>
    <p className="text-base-content/70 mt-2">
      <FormattedMessage description="subheader displayed on the registration page" defaultMessage="Create your account and start tracking scores" id="ZVs5zf" />
    </p>
  </div>
);

interface RegistrationSubmitButtonProps {
  isLoading: boolean;
}

const RegistrationSubmitButton: React.FC<RegistrationSubmitButtonProps> = ({ isLoading }) => (
  <button
    type="submit"
    disabled={isLoading}
    className="btn btn-secondary w-full text-lg font-semibold shadow-lg hover:shadow-secondary/50 transition-all duration-300 transform hover:scale-[1.02]"
  >
    {isLoading ? (
      <>
        <span className="loading loading-spinner loading-sm"></span>
        <FormattedMessage
          description="displayed on a disabled button with a loading spinner after submitting the registration form"
          defaultMessage="Creating Account..."
          id="YOS6+m"
        />
      </>
    ) : (
      <>
        <FormattedMessage description="Displayed on the primary submit button for the account registration page" defaultMessage="Create Account" id="qC1meP" />
        <ArrowRight className="w-5 h-5 ml-2" />
      </>
    )}
  </button>
);

interface LoginLinkSectionProps {
  onNavigateToLogin: () => void;
}

const LoginLinkSection: React.FC<LoginLinkSectionProps> = ({ onNavigateToLogin }) => (
  <>
    <div className="divider text-base-content/50">
      <FormattedMessage
        description="displayed as a visual separator between the registration form and text offering to switch to the login form"
        defaultMessage="or"
        id="e9nfYa"
      />
    </div>

    <div className="text-center">
      <p className="text-base-content/70">
        <FormattedMessage
          description="displayed on the registration page below the main form, and below the 'or' separator"
          defaultMessage="Already have an account? <button>Sign in here</button>"
          id="OfekCx"
          values={{
            button: (text) => (
              <button onClick={onNavigateToLogin} className="link link-secondary hover:link-accent font-semibold transition-colors">
                {text}
              </button>
            ),
          }}
        />
      </p>
    </div>
  </>
);

export const RegistrationForm: React.FC<RegistrationFormProps> = ({ onSubmit, isLoading, error, onNavigateToLogin }) => {
  const [email, setEmail] = useState('');
  const [alias, setAlias] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [aliasError, setAliasError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [policyError, setPolicyError] = useState('');
  const { formatMessage } = useIntl();

  const validateEmail = (email: string): string => {
    if (!email) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Invalid email format';
    return '';
  };

  const validateAlias = (alias: string): string => {
    if (!alias) return 'Alias is required';
    if (alias.length < 3) return 'Alias must be at least 3 characters long';
    if (alias.length > 50) return 'Alias must be no more than 50 characters long';
    if (/\s/.test(alias)) return 'Alias must not contain spaces';
    return '';
  };

  const validatePassword = (password: string): string => {
    if (!password) return 'Password is required';
    if (password.length < 6) return 'Password must be at least 6 characters long';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const emailErr = validateEmail(email);
    const aliasErr = validateAlias(alias);
    const passwordErr = validatePassword(password);
    const policyErr = acceptedPolicy ? '' : 'You must agree to the Privacy Policy';

    setEmailError(emailErr);
    setAliasError(aliasErr);
    setPasswordError(passwordErr);
    setPolicyError(policyErr);

    if (emailErr || aliasErr || passwordErr || policyErr) {
      return;
    }

    await onSubmit(email, alias, password);
  };

  return (
    <>
      <RegistrationHeader />

      {error && (
        <Alert variant="error" className="mb-6">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <TextInput
          type="email"
          label={formatMessage({ defaultMessage: 'Email', id: '1Y0sic', description: 'A label for a field of the registration form' })}
          placeholder={formatMessage({
            defaultMessage: 'Enter your email',
            id: 'Kc/AbT',
            description: 'A placeholder value displayed within an empty input of the registration form',
          })}
          value={email}
          onChange={(value) => {
            setEmail(value);
            setEmailError('');
          }}
          error={emailError}
          icon={Mail}
          required
        />

        <TextInput
          label={formatMessage({ defaultMessage: 'Alias', id: 'on6x6P', description: 'A label for a field of the registration form' })}
          placeholder={formatMessage({
            defaultMessage: 'Choose your display name',
            id: 'LGRXTs',
            description: 'A placeholder value displayed within an empty input of the registration form',
          })}
          value={alias}
          onChange={(value) => {
            setAlias(value);
            setAliasError('');
          }}
          error={aliasError}
          icon={User}
          required
        />

        <PasswordInput
          label={formatMessage({ defaultMessage: 'Password', id: 'WF72pO', description: 'A label for a field of the registration form' })}
          placeholder={formatMessage({
            defaultMessage: 'Create a password',
            id: '3gll2h',
            description: 'A placeholder value displayed within an empty input of the registration form',
          })}
          value={password}
          onChange={(value) => {
            setPassword(value);
            setPasswordError('');
          }}
          error={passwordError}
          icon={Lock}
          focusColor="secondary"
          required
        />

        {/* Privacy Policy Agreement */}
        <div className="space-y-1">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="checkbox checkbox-secondary"
              checked={acceptedPolicy}
              onChange={(e) => {
                setAcceptedPolicy(e.target.checked);
                setPolicyError('');
              }}
              aria-invalid={!!policyError}
              aria-describedby={policyError ? 'privacy-policy-error' : undefined}
            />
            <span className="text-sm text-base-content/80 leading-relaxed">
              <FormattedMessage
                description="Label for a checkbox on the registration form"
                defaultMessage="I have read and agree to the <privacyLink>Privacy Policy</privacyLink>."
                id="WV6MM4"
                values={{
                  privacyLink: (text) => (
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="link link-secondary font-medium">
                      {text}
                    </a>
                  ),
                }}
              />
            </span>
          </label>
          {policyError && (
            <p id="privacy-policy-error" className="text-xs text-error mt-1">
              {policyError}
            </p>
          )}
        </div>

        <RegistrationSubmitButton isLoading={isLoading} />
      </form>

      <LoginLinkSection onNavigateToLogin={onNavigateToLogin} />
    </>
  );
};
