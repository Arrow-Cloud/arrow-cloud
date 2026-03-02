import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useCooldownTimer } from '../../../hooks';
import { Alert } from '../../../components/ui';
import { FormattedMessage } from 'react-intl';

const EmailVerificationAlert: React.FC = () => {
  const { user, resendVerificationEmail } = useAuth();
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [resendEmailSuccess, setResendEmailSuccess] = useState('');
  const [resendEmailError, setResendEmailError] = useState('');
  const { timeLeft: resendCooldown, start: startCooldown } = useCooldownTimer();

  const handleResendVerificationEmail = async () => {
    if (resendCooldown > 0) return;

    setIsResendingEmail(true);
    setResendEmailSuccess('');
    setResendEmailError('');

    try {
      await resendVerificationEmail();
      setResendEmailSuccess('Verification email sent successfully!');
      startCooldown(30);
    } catch (error) {
      setResendEmailError(error instanceof Error ? error.message : 'Failed to send verification email');
    } finally {
      setIsResendingEmail(false);
    }
  };

  if (user?.emailVerifiedAt) {
    return null;
  }

  return (
    <>
      <Alert variant="warning" className="mb-4">
        <div className="flex-1">
          <h3 className="font-semibold">
            <FormattedMessage
              defaultMessage="Please verify your email address to secure your account."
              description="Alert message asking user to verify their email address"
              id="Gxtt3v"
            />
          </h3>
          <p className="text-sm">
            <FormattedMessage
              defaultMessage="Without a verified email your account is not recoverable."
              description="Alert message about account recovery without verified email"
              id="hdelcO"
            />
          </p>
        </div>
        <button onClick={handleResendVerificationEmail} className="btn btn-sm btn-primary" disabled={isResendingEmail || resendCooldown > 0}>
          {isResendingEmail ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              <FormattedMessage defaultMessage="Sending..." description="Button label for sending verification email" id="qoCB1e" />
            </>
          ) : resendCooldown > 0 ? (
            <FormattedMessage
              defaultMessage="Resend in {seconds,number}s"
              description="Button label showing cooldown time before resending verification email"
              id="AqLiqA"
              values={{ seconds: resendCooldown }}
            />
          ) : (
            <>
              <Send className="w-4 h-4" />
              <FormattedMessage defaultMessage="Resend" description="Button label for resending verification email" id="ck1B/I" />
            </>
          )}
        </button>
      </Alert>

      {resendEmailSuccess && (
        <Alert variant="success" className="mb-4">
          {resendEmailSuccess}
        </Alert>
      )}

      {resendEmailError && (
        <Alert variant="error" className="mb-4">
          {resendEmailError}
        </Alert>
      )}
    </>
  );
};

export default EmailVerificationAlert;
