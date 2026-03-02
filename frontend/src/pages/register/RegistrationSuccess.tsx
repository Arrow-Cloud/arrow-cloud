import React, { useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { useCooldownTimer } from '../../hooks';
import PasskeyRegistrationPrompt from '../../components/auth/PasskeyRegistrationPrompt';
import { FormattedMessage } from 'react-intl';

interface RegistrationSuccessProps {
  email: string;
  showPasskeyPrompt: boolean;
  onSkipPasskey: () => void;
  onPasskeySuccess: () => void;
  onResendVerification: () => Promise<void>;
}

interface SuccessHeaderProps {
  email: string;
}

const SuccessHeader: React.FC<SuccessHeaderProps> = ({ email }) => (
  <>
    <div className="flex justify-center mb-4">
      <div className="p-3 bg-success/10 rounded-2xl">
        <Mail className="w-8 h-8 text-success" />
      </div>
    </div>

    <h1 className="text-3xl font-bold text-base-content mb-4">
      <FormattedMessage
        defaultMessage="Check Your Email!"
        id="eoVXEp"
        description="A heading displayed to a user after they have finished registring a new account"
      />
    </h1>

    <p className="text-base-content/70 mb-6">
      <FormattedMessage
        defaultMessage="We've sent a verification email to <strong>{email}</strong>. Click that link sometime later, or else you'll have no way to recover your account!"
        values={{
          email,
          strong: (txt) => <strong>{txt}</strong>,
        }}
        id="21hFSa"
        description="A message displayed to a user after they have finished registering a new account"
      />
    </p>
  </>
);

interface ResendSectionProps {
  onResend: () => Promise<void>;
  resendLoading: boolean;
  resendCooldown: number;
}

const ResendSection: React.FC<ResendSectionProps> = ({ onResend, resendLoading, resendCooldown }) => (
  <p className="text-sm text-base-content/50 mb-6">
    <FormattedMessage
      id="iXITn8"
      description="Displayed to users waiting to confirm their email address. Button text may be replaced with 'sending...' or 'resend in Xs'"
      defaultMessage="Didn't receive the email?{linebreak}Check your spam folder or <button>click here to resend</button>"
      values={{
        linebreak: <br />,
        button: (defaultText) => (
          <button
            className="link link-secondary hover:link-accent font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={resendLoading || resendCooldown > 0}
            onClick={onResend}
          >
            {resendLoading ? (
              <>
                <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
                <FormattedMessage
                  defaultMessage="sending..."
                  id="ruTh1W"
                  description="displayed on a disabled button with a loading spinner; replaces 'click here to resend'"
                />
              </>
            ) : resendCooldown > 0 ? (
              <FormattedMessage
                defaultMessage="resend in {resendCooldown}s"
                id="SjGrX2"
                values={{ resendCooldown }}
                description="displayed on a disabled button; replaces 'click here to resend'"
              />
            ) : (
              defaultText
            )}
          </button>
        ),
      }}
    />
  </p>
);

export const RegistrationSuccess: React.FC<RegistrationSuccessProps> = ({
  email,
  showPasskeyPrompt,
  onSkipPasskey,
  onPasskeySuccess,
  onResendVerification,
}) => {
  const [resendLoading, setResendLoading] = useState(false);
  const { timeLeft: resendCooldown, start: startCooldown } = useCooldownTimer();

  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;

    setResendLoading(true);
    try {
      await onResendVerification();
      startCooldown(30);
    } catch (err) {
      console.log('Failed to resend verification email:', err);
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="text-center">
      <SuccessHeader email={email} />

      <ResendSection onResend={handleResendVerification} resendLoading={resendLoading} resendCooldown={resendCooldown} />

      {showPasskeyPrompt && <PasskeyRegistrationPrompt onSkip={onSkipPasskey} onSuccess={onPasskeySuccess} />}
    </div>
  );
};
