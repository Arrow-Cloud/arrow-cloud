import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Mail, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AuthPageLayout, Alert } from '../../components';
import { useCooldownTimer } from '../../hooks';
import { FormattedMessage } from 'react-intl';

interface StatusIconProps {
  status: 'pending' | 'success' | 'error';
}

const StatusIcon: React.FC<StatusIconProps> = ({ status }) => (
  <div className="text-center mb-6">
    <div className="flex justify-center mb-4">
      <div className={`p-3 rounded-2xl ${status === 'pending' ? 'bg-warning/10' : status === 'success' ? 'bg-success/10' : 'bg-error/10'}`}>
        {status === 'pending' && <Loader2 className="w-8 h-8 text-warning animate-spin" />}
        {status === 'success' && <CheckCircle className="w-8 h-8 text-success" />}
        {status === 'error' && <XCircle className="w-8 h-8 text-error" />}
      </div>
    </div>

    <h1 className="text-3xl font-bold text-base-content">
      {status === 'pending' && (
        <FormattedMessage
          defaultMessage="Verifying Email..."
          id="3pJaQC"
          description="a live status indicator displayed while waiting for email verification to finish processing"
        />
      )}
      {status === 'success' && (
        <FormattedMessage
          defaultMessage="Email Verified!"
          id="KpJJ7D"
          description="a live status indicator displayed after email verification has been completed"
        />
      )}
      {status === 'error' && (
        <FormattedMessage defaultMessage="Verification Failed" id="xe01xK" description="a live status indicator displayed if email verification failed" />
      )}
    </h1>
  </div>
);

interface StatusMessageProps {
  status: 'pending' | 'success' | 'error';
  error: string | null;
}

const StatusMessage: React.FC<StatusMessageProps> = ({ status, error }) => (
  <div className="text-center mb-6">
    {status === 'pending' && (
      <Alert variant="warning">
        <FormattedMessage
          defaultMessage="Please wait while we verify your email address..."
          id="UekZ7j"
          description="a status message displayed while email verification is in process"
        />
      </Alert>
    )}

    {status === 'success' && (
      <Alert variant="success">
        <FormattedMessage
          defaultMessage="Your email has been successfully verified! Your account is now fully activated."
          id="ebM7x5"
          description="a confirmation message displayed after email verification succeeds"
        />
      </Alert>
    )}

    {status === 'error' && (
      <Alert variant="error">
        {error || (
          <FormattedMessage
            defaultMessage="Email verification failed. Please try again or request a new verification email."
            id="PPXCI8"
            description="an error message displayed after verification fails"
          />
        )}
      </Alert>
    )}
  </div>
);

interface SuccessActionsProps {
  onGoHome: () => void;
}

const SuccessActions: React.FC<SuccessActionsProps> = ({ onGoHome }) => (
  <div className="text-center">
    <button onClick={onGoHome} className="btn btn-primary btn-wide">
      <FormattedMessage defaultMessage="Go to Home" id="z+1C0a" description="text displayed on a button to return to the site homepage" />
    </button>
  </div>
);

interface ErrorActionsProps {
  onResendVerification: () => void;
  resendLoading: boolean;
  resendCooldown: number;
}

const ErrorActions: React.FC<ErrorActionsProps> = ({ onResendVerification, resendLoading, resendCooldown }) => (
  <div className="space-y-4">
    <div className="divider">
      <FormattedMessage defaultMessage="Need help?" id="dIRIMP" description="a section header on the email verification page" />
    </div>

    <div className="text-center">
      <button onClick={onResendVerification} disabled={resendLoading || resendCooldown > 0} className="btn btn-secondary btn-wide">
        {resendLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : resendCooldown > 0 ? (
          <>
            <Mail className="w-4 h-4" />{' '}
            <FormattedMessage
              defaultMessage="Resend in {resendCooldown}s"
              id="GrQeWz"
              description="text on a disabled button, where resend cooldown is a number of seconds counting down"
              values={{ resendCooldown }}
            />
          </>
        ) : (
          <>
            <Mail className="w-4 h-4" />{' '}
            <FormattedMessage defaultMessage="Resend Verification Email" id="p4n4Yc" description="text on a button to resend a verification email" />
          </>
        )}
      </button>
    </div>
  </div>
);

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { verifyEmail, resendVerificationEmail } = useAuth();
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { timeLeft: resendCooldown, start: startCooldown } = useCooldownTimer();

  const token = searchParams.get('token');

  useEffect(() => {
    if (token) {
      handleVerification();
    } else {
      setVerificationStatus('error');
      setError('Invalid verification link');
    }
  }, [token]);

  const handleVerification = async () => {
    if (!token) return;

    try {
      await verifyEmail(token);
      setVerificationStatus('success');
    } catch (err) {
      console.log('Email verification failed:', err);
      setVerificationStatus('error');
      setError('Email verification failed');
    }
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;

    setResendLoading(true);
    try {
      await resendVerificationEmail();
      startCooldown(30);
    } catch (err) {
      console.log('Failed to resend verification email:', err);
      setError('Failed to resend verification email');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <AuthPageLayout>
      <div className="w-full max-w-md">
        <div className="card bg-base-100/95 backdrop-blur-lg shadow-2xl border border-base-300/30 ring-1 ring-white/10">
          <div className="card-body p-8">
            <StatusIcon status={verificationStatus} />

            <StatusMessage status={verificationStatus} error={error} />

            {verificationStatus === 'success' && <SuccessActions onGoHome={() => navigate('/')} />}

            {verificationStatus === 'error' && (
              <ErrorActions onResendVerification={handleResendVerification} resendLoading={resendLoading} resendCooldown={resendCooldown} />
            )}
          </div>
        </div>
      </div>
    </AuthPageLayout>
  );
};
