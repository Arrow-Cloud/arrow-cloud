import React, { useState, useEffect } from 'react';
import { Lock, CheckCircle, ArrowRight } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PasswordInput } from '../../components/forms';
import { AuthPageLayout, Alert } from '../../components';
import { resetPassword } from '../../services/api';
import { FormattedMessage, useIntl } from 'react-intl';

const ResetPasswordHeader: React.FC = () => (
  <div className="text-center mb-8">
    <div className="flex justify-center mb-4">
      <div className="p-3 bg-primary/10 rounded-2xl">
        <Lock className="w-8 h-8 text-primary" />
      </div>
    </div>
    <h1 className="text-3xl font-bold text-base-content">
      <FormattedMessage defaultMessage="Reset Password" id="NvXgF1" description="a heading displayed on the reset password page" />
    </h1>
    <p className="text-base-content/70 mt-2">
      <FormattedMessage defaultMessage="Enter your new password below" id="XNdbAr" description="a subheading displayed on the password reset page" />
    </p>
  </div>
);

const PasswordRequirements: React.FC = () => (
  <div className="text-sm text-base-content/60 bg-base-200 p-3 rounded-lg">
    <p className="font-medium mb-1">
      <FormattedMessage defaultMessage="Password requirements:" id="g/VjGs" description="a label for a bulleted list of password requirements" />
    </p>
    <ul className="list-disc list-inside space-y-1">
      <li>
        <FormattedMessage
          defaultMessage="At least 6 characters long"
          id="mOHkCr"
          description="one of our password requirements, displayed in a bulleted list"
        />
      </li>
      <li>
        <FormattedMessage defaultMessage="Both passwords must match" id="vzcP0o" description="one of our password requirements, displayed in a bulleted list" />
      </li>
    </ul>
  </div>
);

interface ResetSubmitButtonProps {
  isLoading: boolean;
  hasToken: boolean;
}

const ResetSubmitButton: React.FC<ResetSubmitButtonProps> = ({ isLoading, hasToken }) => (
  <button
    type="submit"
    disabled={isLoading || !hasToken}
    className="btn btn-primary w-full text-lg font-semibold shadow-lg hover:shadow-primary/50 transition-all duration-300 transform hover:scale-[1.02]"
  >
    {isLoading ? (
      <>
        <span className="loading loading-spinner loading-sm"></span>
        <FormattedMessage defaultMessage="Resetting Password..." id="arUn+B" description="displayed on a disabled button with a loading spinner" />
      </>
    ) : (
      <>
        <FormattedMessage defaultMessage="Reset Password" id="J8Xk3g" description="the primary button to submit the password reset form" />
        <ArrowRight className="w-5 h-5 ml-2" />
      </>
    )}
  </button>
);

interface BackToLoginProps {
  onNavigateToLogin: () => void;
}

const BackToLogin: React.FC<BackToLoginProps> = ({ onNavigateToLogin }) => (
  <div className="text-center mt-6">
    <button onClick={onNavigateToLogin} className="btn btn-ghost btn-sm text-base-content/70 hover:text-base-content">
      <FormattedMessage defaultMessage="Back to Sign In" id="41VgXE" description="displayed on the password reset form as a link to return to the login page" />
    </button>
  </div>
);

const ResetSuccessView: React.FC = () => (
  <div className="text-center">
    <div className="flex justify-center mb-6">
      <div className="p-4 bg-success/10 rounded-2xl">
        <CheckCircle className="w-12 h-12 text-success" />
      </div>
    </div>
    <h1 className="text-3xl font-bold text-base-content mb-4">
      <FormattedMessage defaultMessage="Password Reset Successfully!" id="cVRF/J" description="a heading displayed after a successful password reset" />
    </h1>
    <div className="space-y-4 text-base-content/70">
      <p>
        <FormattedMessage
          defaultMessage="Your password has been reset and you've been automatically signed in."
          id="qyoslL"
          description="descriptive text displayed after a successful password reset"
        />
      </p>
      <p>
        <FormattedMessage
          defaultMessage="You'll be redirected to your dashboard momentarily..."
          id="O93xq6"
          description="descriptive text displayed after a successful password reset"
        />
      </p>
    </div>

    {/* Loading indicator */}
    <div className="flex justify-center mt-8">
      <span className="loading loading-spinner loading-lg text-primary"></span>
    </div>
  </div>
);

export const ResetPasswordPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuthFromResponse } = useAuth();
  const { formatMessage } = useIntl();

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing reset token. Please request a new password reset.');
    }
  }, [token]);

  const validatePassword = (pwd: string): string => {
    if (!pwd) return 'Password is required';
    if (pwd.length < 6) return 'Password must be at least 6 characters long';
    return '';
  };

  const validateConfirmPassword = (pwd: string, confirmPwd: string): string => {
    if (!confirmPwd) return 'Please confirm your password';
    if (pwd !== confirmPwd) return 'Passwords do not match';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const pwdError = validatePassword(password);
    const confirmPwdError = validateConfirmPassword(password, confirmPassword);

    setPasswordError(pwdError);
    setConfirmPasswordError(confirmPwdError);

    if (!token) {
      setError('Invalid or missing reset token. Please request a new password reset.');
      return;
    }

    if (pwdError || confirmPwdError) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await resetPassword({ token, password });
      setAuthFromResponse(response);
      setIsSuccess(true);

      // Auto-redirect to home after a short delay
      setTimeout(() => {
        navigate('/');
      }, 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthPageLayout>
      <div className="w-full max-w-md">
        {/* Main Card */}
        <div className="card bg-base-100/95 backdrop-blur-lg shadow-2xl border border-base-300/30 ring-1 ring-white/10 mt-20">
          <div className="card-body p-8">
            {!isSuccess ? (
              <>
                <ResetPasswordHeader />

                {error && (
                  <Alert variant="error" className="mb-6">
                    {error}
                  </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Hidden username field to help browsers understand this is a password reset */}
                  <input type="text" name="username" autoComplete="username" style={{ display: 'none' }} value="" readOnly />

                  <PasswordInput
                    label={formatMessage({ defaultMessage: 'New Password', id: 'aCiQRg', description: 'A label for a field of the password reset form' })}
                    placeholder={formatMessage({
                      defaultMessage: 'Enter your new password',
                      id: '3bG3Pw',
                      description: 'A placeholder value displayed within an empty input of the password reset form',
                    })}
                    value={password}
                    onChange={(value) => {
                      setPassword(value);
                      setPasswordError('');
                    }}
                    icon={Lock}
                    required
                    name="new-password"
                    autoComplete="new-password"
                    error={passwordError}
                  />

                  <PasswordInput
                    label={formatMessage({
                      defaultMessage: 'Confirm New Password',
                      id: 'jMoAT4',
                      description: 'A label for a field of the password reset form',
                    })}
                    placeholder={formatMessage({
                      defaultMessage: 'Confirm your new password',
                      id: 'meazlj',
                      description: 'A placeholder value displayed within an empty input of the password reset form',
                    })}
                    value={confirmPassword}
                    onChange={(value) => {
                      setConfirmPassword(value);
                      setConfirmPasswordError('');
                    }}
                    icon={Lock}
                    required
                    name="confirm-password"
                    autoComplete="new-password"
                    error={confirmPasswordError}
                  />

                  <PasswordRequirements />

                  <ResetSubmitButton isLoading={isLoading} hasToken={!!token} />
                </form>

                <BackToLogin onNavigateToLogin={() => navigate('/login')} />
              </>
            ) : (
              <ResetSuccessView />
            )}
          </div>
        </div>
      </div>
    </AuthPageLayout>
  );
};
