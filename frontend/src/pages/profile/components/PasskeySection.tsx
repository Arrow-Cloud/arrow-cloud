import React, { useState, useEffect } from 'react';
import PasskeyManager from '../../../components/auth/PasskeyManager';
import PasskeySetupPrompt from '../../../components/auth/PasskeySetupPrompt';
import { getUserPasskeys } from '../../../services/api';
import { isPasskeySupported } from '../../../services/passkey';
import { Passkey } from '../../../schemas/apiSchemas';
import { FormattedMessage, useIntl } from 'react-intl';

interface PasskeySectionHeaderProps {
  variant: 'loading' | 'error' | 'default';
  error?: string;
}

const PasskeySectionHeader: React.FC<PasskeySectionHeaderProps> = ({ variant, error }) => (
  <div className="flex items-center gap-3 mb-6">
    {variant === 'loading' && (
      <p className="text-base-content/70">
        <FormattedMessage defaultMessage="Loading passkey information..." description="Loading message for passkey section" id="eXmrrH" />
      </p>
    )}
    {variant === 'error' && error && <p className="text-error">{error}</p>}
  </div>
);

interface PasskeySectionCardProps {
  children: React.ReactNode;
}

const PasskeySectionCard: React.FC<PasskeySectionCardProps> = ({ children }) => <div>{children}</div>;

interface LoadingViewProps {
  onRetry: () => void;
}

const LoadingView: React.FC<LoadingViewProps> = () => (
  <PasskeySectionCard>
    <PasskeySectionHeader variant="loading" />
  </PasskeySectionCard>
);

const ErrorView: React.FC<LoadingViewProps> = ({ onRetry }) => {
  const { formatMessage } = useIntl();

  return (
    <PasskeySectionCard>
      <PasskeySectionHeader
        variant="error"
        error={formatMessage({
          defaultMessage: 'Failed to load passkey information',
          description: 'Error message when failing to load passkey information',
          id: 'RWchvs',
        })}
      />
      <button onClick={onRetry} className="btn btn-primary">
        <FormattedMessage defaultMessage="Retry" description="Button label to retry loading" id="80Vzt6" />
      </button>
    </PasskeySectionCard>
  );
};

interface PasskeyContentProps {
  hasPasskeys: boolean;
  passkeys: Passkey[];
  onPasskeySuccess: () => void;
  onPasskeysChange: () => void;
}

const PasskeyContent: React.FC<PasskeyContentProps> = ({ hasPasskeys, passkeys, onPasskeySuccess, onPasskeysChange }) => (
  <PasskeySectionCard>
    {!hasPasskeys && <PasskeySetupPrompt variant="prominent" hasExistingPasskeys={hasPasskeys} onSuccess={onPasskeySuccess} />}

    {hasPasskeys && <PasskeyManager onPasskeysChange={onPasskeysChange} passkeys={passkeys} />}
  </PasskeySectionCard>
);

const PasskeySection: React.FC = () => {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { formatMessage } = useIntl();

  const loadPasskeys = async () => {
    try {
      setLoading(true);
      if (!isPasskeySupported()) {
        setPasskeys([]);
        return;
      }

      const response = await getUserPasskeys();
      setPasskeys(response.passkeys || []);
    } catch (error) {
      console.error('Failed to load passkeys:', error);
      setError(
        formatMessage({
          defaultMessage: 'Failed to load passkey information',
          description: 'Error message when failing to load passkey information',
          id: 'RWchvs',
        }),
      );
      setPasskeys([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPasskeys();
  }, []);

  const handlePasskeySuccess = () => {
    // Reload passkeys after successful creation
    loadPasskeys();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingView onRetry={loadPasskeys} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <ErrorView onRetry={loadPasskeys} />
      </div>
    );
  }

  const hasPasskeys = passkeys.length > 0;

  return (
    <div className="space-y-6">
      <PasskeyContent hasPasskeys={hasPasskeys} passkeys={passkeys} onPasskeySuccess={handlePasskeySuccess} onPasskeysChange={loadPasskeys} />
    </div>
  );
};

export default PasskeySection;
