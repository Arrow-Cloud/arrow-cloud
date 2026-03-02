import React, { useState } from 'react';
import { Mail, ArrowLeft, LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuthPageLayout, Alert } from '../../components';
import { useCooldownTimer } from '../../hooks';
import { requestPasswordReset } from '../../services/api';
import ForgotPasswordForm from './ForgotPasswordForm';
import PasswordResetSuccessView from './PasswordResetSuccessView';
import { useIntl } from 'react-intl';

interface HeaderSectionProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

const HeaderSection: React.FC<HeaderSectionProps> = ({ icon: Icon, title, description }) => (
  <div className="text-center">
    <div className="flex justify-center mb-4">
      <div className="p-3 bg-primary/10 rounded-2xl">
        <Icon className="w-8 h-8 text-primary" />
      </div>
    </div>
    <h1 className="text-3xl font-bold text-base-content">{title}</h1>
    <p className="text-base-content/70 mt-2">{description}</p>
  </div>
);

interface ActionButtonProps {
  onClick: () => void;
  icon: LucideIcon;
  children: React.ReactNode;
  variant?: 'primary' | 'ghost';
  className?: string;
}

const ActionButton: React.FC<ActionButtonProps> = ({ onClick, icon: Icon, children, variant = 'primary', className = '' }) => (
  <button onClick={onClick} className={`btn btn-${variant} btn-sm gap-2 ${className}`}>
    <Icon className="w-4 h-4" />
    {children}
  </button>
);

const ForgotPasswordPage: React.FC = () => {
  const { formatMessage } = useIntl();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  const { timeLeft, formatTime } = useCooldownTimer(3600, { autoStart: true }); // 1 hour
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await requestPasswordReset({ email });
      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthPageLayout>
      <div className="w-full max-w-md">
        <div className="card bg-base-100/95 backdrop-blur-lg shadow-2xl border border-base-300/30 ring-1 ring-white/10 mt-20">
          <div className="card-body p-8">
            {!isSubmitted ? (
              <>
                <HeaderSection
                  icon={Mail}
                  title={formatMessage({ defaultMessage: 'Forgot Password?', id: '1nrTvx', description: 'header displayed on the forgot password page' })}
                  description="Enter your email and we'll send you a reset link."
                />

                {error && (
                  <Alert variant="error" className="mb-6">
                    {error}
                  </Alert>
                )}

                <ForgotPasswordForm email={email} setEmail={setEmail} isLoading={isLoading} onSubmit={handleSubmit} />

                <div className="text-center mt-6">
                  <ActionButton onClick={() => navigate('/login')} icon={ArrowLeft} variant="ghost" className="text-base-content/70 hover:text-base-content">
                    {formatMessage({ defaultMessage: 'Back to Sign In', id: '9F+o+P', description: 'button label displayed on the forgot password page' })}
                  </ActionButton>
                </div>
              </>
            ) : (
              <PasswordResetSuccessView timeLeft={timeLeft} formatTime={formatTime} onBackToLogin={() => navigate('/login')} />
            )}
          </div>
        </div>
      </div>
    </AuthPageLayout>
  );
};

export default ForgotPasswordPage;
