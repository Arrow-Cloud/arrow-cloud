import React, { useState, useEffect } from 'react';
import { Fingerprint, Loader2 } from 'lucide-react';
import { registerPasskey, isPasskeySupported, isPlatformPasskeyAvailable } from '../../services/passkey';
import { Alert } from '../ui';
import { FormattedMessage } from 'react-intl';

interface PasskeySetupPromptProps {
  variant?: 'suggestion' | 'prominent' | 'inline';
  title?: string;
  description?: string;
  onSuccess?: () => void;
  onDismiss?: () => void;
  className?: string;
  hasExistingPasskeys?: boolean;
}

const SKIP_KEY = 'passkeySetupDismissed';

const PasskeySetupPrompt: React.FC<PasskeySetupPromptProps> = ({
  variant = 'suggestion',
  title,
  onSuccess,
  onDismiss,
  className = '',
  hasExistingPasskeys = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [platformAvailable, setPlatformAvailable] = useState(false);

  useEffect(() => {
    const checkSupport = async () => {
      try {
        const supported = isPasskeySupported();
        const available = await isPlatformPasskeyAvailable();

        setPasskeySupported(supported);
        setPlatformAvailable(available);
      } catch (err) {
        console.error('Error checking passkey support:', err);
      }
    };

    checkSupport();
  }, []);

  const handleCreatePasskey = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const deviceName = `${navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'} Device`;
      const result = await registerPasskey(deviceName);

      if (result.success) {
        onSuccess?.();
      } else {
        setError(result.error || 'Failed to create passkey');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create passkey');
    } finally {
      setIsLoading(false);
    }
  };

  // Don't render if passkeys aren't supported or user already has passkeys
  if (!passkeySupported || hasExistingPasskeys) {
    return null;
  }

  const getTitle = () => {
    if (title) return title;
    switch (variant) {
      case 'prominent':
        return 'Secure Your Account with Passkeys';
      case 'inline':
        return 'Add Passkey';
      default:
        return 'Enable Passwordless Login';
    }
  };

  const getDescription = () => {
    return "Passkeys provide a more secure and convenient way to sign in using your device's built-in authentication.";
  };

  return (
    <>
      <div className={`card bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 border border-primary/20 ${className}`}>
        <div className="card-body p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <Fingerprint className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-base-content">{getTitle()}</h3>
                <p className="text-base-content/70 mt-1">{getDescription()}</p>
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="error" className="mb-4">
              {error}
            </Alert>
          )}

          <div className="flex gap-3 flex-wrap">
            <button onClick={handleCreatePasskey} disabled={isLoading || !platformAvailable} className="btn btn-primary flex-1 min-w-[11rem]">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <FormattedMessage defaultMessage="Setting up passkey..." id="JTD1xr" description="Label for setting up passkey button" />
                </>
              ) : (
                <FormattedMessage defaultMessage="Set up Passkey" id="kgCmwz" description="Label for set up passkey button" />
              )}
            </button>
          </div>

          {!platformAvailable && (
            <p className="text-xs text-base-content/60 mt-2">
              <FormattedMessage
                defaultMessage="Note: This device doesn't support built-in authentication. You can still use external security keys."
                id="Y0Wd0B"
                description="Note about platform availability for passkey setup"
              />
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        className="btn btn-ghost flex-none text-sm mt-4 w-full"
        disabled={isLoading}
        onClick={() => {
          try {
            localStorage.setItem(SKIP_KEY, Date.now().toString());
          } catch {}
          onDismiss?.();
        }}
      >
        <FormattedMessage defaultMessage="Not now" id="iqbsz+" description="Label for dismiss passkey setup prompt button" />
      </button>
    </>
  );
};

export default PasskeySetupPrompt;
