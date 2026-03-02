import React, { useState } from 'react';
import { Fingerprint, Loader2, CheckCircle } from 'lucide-react';
import { registerPasskey, isPasskeySupported, isPlatformPasskeyAvailable } from '../../services/passkey';
import { Alert } from '../ui';
import { FormattedMessage } from 'react-intl';

interface PasskeyRegistrationPromptProps {
  onSkip?: () => void;
  onSuccess: () => void;
}

const SKIP_KEY = 'ac_skip_passkey_setup';

const PasskeyRegistrationPrompt: React.FC<PasskeyRegistrationPromptProps> = ({ onSuccess, onSkip }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [platformAvailable, setPlatformAvailable] = useState(false);

  React.useEffect(() => {
    const checkSupport = async () => {
      const supported = isPasskeySupported();
      const available = await isPlatformPasskeyAvailable();

      setPasskeySupported(supported);
      setPlatformAvailable(available);
    };

    checkSupport();
  }, []);

  // If user previously skipped, don't render
  if (typeof window !== 'undefined') {
    try {
      if (localStorage.getItem(SKIP_KEY) === '1') {
        return null;
      }
    } catch {
      // ignore storage errors
    }
  }

  const handleCreatePasskey = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await registerPasskey('My Device');

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || 'Failed to create passkey');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create passkey');
    } finally {
      setIsLoading(false);
    }
  };

  if (!passkeySupported) {
    return null;
  }

  return (
    <div className="card bg-gradient-to-br from-primary/5 to-secondary/5 border border-primary/20">
      <div className="card-body p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Fingerprint className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg">
                <FormattedMessage defaultMessage="Set up Passwordless Login" id="AD4Gnq" description="Title for passkey registration prompt" />
              </h3>
              <p className="text-base-content/70 text-sm">
                {platformAvailable ? (
                  <FormattedMessage
                    defaultMessage="Use your device's built-in security to sign in instantly"
                    id="P+UCmK"
                    description="Description for built-in security option"
                  />
                ) : (
                  <FormattedMessage
                    defaultMessage="Use a security key for secure authentication"
                    id="TiVT6w"
                    description="Description for security key option"
                  />
                )}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="error" className="mb-4">
            <span className="text-sm">{error}</span>
          </Alert>
        )}

        <div className="flex gap-2">
          <button onClick={handleCreatePasskey} disabled={isLoading} className="btn btn-primary flex-1">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                <FormattedMessage defaultMessage="Setting up..." id="Kz3cvi" description="Label for setting up passkey button" />
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                <FormattedMessage defaultMessage="Set up Passkey" id="kgCmwz" description="Label for set up passkey button" />
              </>
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(SKIP_KEY, '1');
            } catch {}
            onSkip?.();
          }}
          className="btn btn-ghost text-xs whitespace-nowrap"
        >
          <FormattedMessage defaultMessage="Skip" id="7Y3qMa" description="Label for skip passkey setup button" />
        </button>

        <p className="text-xs text-base-content/50 mt-2">
          <FormattedMessage
            defaultMessage="You can always set this up later in your profile settings."
            id="eubUWO"
            description="Note about setting up passkey later"
          />
        </p>
      </div>
    </div>
  );
};

export default PasskeyRegistrationPrompt;
