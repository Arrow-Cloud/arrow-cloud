import React, { useState } from 'react';
import { Fingerprint, Plus, Loader2 } from 'lucide-react';
import { registerPasskey, isPasskeySupported } from '../../services/passkey';
import { Alert } from '../ui';
import { FormattedMessage } from 'react-intl';

interface PasskeySetupSuggestionProps {
  email: string;
  onSuccess: () => void;
  onDismiss: () => void;
}

const PasskeySetupSuggestion: React.FC<PasskeySetupSuggestionProps> = ({ email, onSuccess, onDismiss }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSetupPasskey = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await registerPasskey(`${email} - Passkey`);

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || 'Failed to set up passkey');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to set up passkey');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isPasskeySupported()) {
    return null;
  }

  return (
    <div className="card bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/20 mb-4">
      <div className="card-body p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Fingerprint className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">
              <FormattedMessage defaultMessage="Enable Passwordless Login" id="2ywg8y" description="Title for passkey setup suggestion" />
            </h3>
            <p className="text-sm text-base-content/70">
              <FormattedMessage
                defaultMessage="Set up a passkey for faster, more secure sign-ins"
                id="mVwWst"
                description="Description for passkey setup suggestion"
              />
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="error" className="mb-3">
            <span className="text-sm">{error}</span>
          </Alert>
        )}

        <div className="flex gap-2">
          <button onClick={handleSetupPasskey} disabled={isLoading} className="btn btn-primary btn-sm flex-1">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                <FormattedMessage defaultMessage="Setting up..." id="Kz3cvi" description="Label for setting up passkey button" />
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-1" />
                <FormattedMessage defaultMessage="Set up Passkey" id="kgCmwz" description="Label for set up passkey button" />
              </>
            )}
          </button>
          <button onClick={onDismiss} disabled={isLoading} className="btn btn-ghost btn-sm">
            <FormattedMessage defaultMessage="Not now" id="ZReS1Z" description="Label for dismiss passkey setup suggestion button" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PasskeySetupSuggestion;
