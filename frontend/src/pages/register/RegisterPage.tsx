import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AuthPageLayout } from '../../components';
import { RegistrationForm } from './RegistrationForm';
import { RegistrationSuccess } from './RegistrationSuccess';

export const RegisterPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [showPasskeyPrompt, setShowPasskeyPrompt] = useState(false);
  const PASSKEY_SKIP_KEY = 'ac_skip_passkey_setup';
  const navigate = useNavigate();
  const location = useLocation();
  const { register, resendVerificationEmail, isLoading, error, user } = useAuth();

  const from = location.state?.from?.pathname || '/';

  // Redirect if already authenticated
  useEffect(() => {
    if (user && user.emailVerifiedAt) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  useEffect(() => {
    try {
      if (localStorage.getItem(PASSKEY_SKIP_KEY) === '1') {
        setShowPasskeyPrompt(false);
      }
    } catch {}
  }, []);

  const handleRegistrationSubmit = async (formEmail: string, alias: string, password: string) => {
    setEmail(formEmail); // Store email for success screen
    await register(formEmail, alias, password);
    setRegistrationSuccess(true);
    try {
      if (localStorage.getItem(PASSKEY_SKIP_KEY) !== '1') {
        setShowPasskeyPrompt(true);
      }
    } catch {
      setShowPasskeyPrompt(true);
    }
  };

  const handleResendVerification = async () => {
    await resendVerificationEmail();
  };

  const handleNavigateToLogin = () => {
    navigate('/login');
  };

  return (
    <AuthPageLayout variant="secondary">
      <div className="w-full max-w-md">
        <div className="card bg-base-100/95 backdrop-blur-lg shadow-2xl border border-base-300/30 ring-1 ring-white/10 mt-20">
          <div className="card-body p-8">
            {registrationSuccess || user ? (
              <RegistrationSuccess
                email={email || user?.email || ''}
                showPasskeyPrompt={showPasskeyPrompt}
                onSkipPasskey={() => setShowPasskeyPrompt(false)}
                onPasskeySuccess={() => setShowPasskeyPrompt(false)}
                onResendVerification={handleResendVerification}
              />
            ) : (
              <RegistrationForm onSubmit={handleRegistrationSubmit} isLoading={isLoading} error={error} onNavigateToLogin={handleNavigateToLogin} />
            )}
          </div>
        </div>
      </div>
    </AuthPageLayout>
  );
};
