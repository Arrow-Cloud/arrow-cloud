import React, { useState } from 'react';
import { Fingerprint, Plus, Trash2, Smartphone, Monitor, Usb, Shield, Loader2 } from 'lucide-react';
import { deletePasskey } from '../../services/api';
import { registerPasskey, isPasskeySupported } from '../../services/passkey';
import { Alert } from '../ui';
import { Passkey } from '../../schemas/apiSchemas';
import { FormattedMessage, useIntl } from 'react-intl';

interface PasskeyManagerProps {
  onPasskeysChange?: () => void;
  passkeys?: Passkey[];
}

const PasskeyManager: React.FC<PasskeyManagerProps> = ({ onPasskeysChange, passkeys }) => {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const { formatDate, formatMessage } = useIntl();

  const passkeySupported = isPasskeySupported();

  const handleAddPasskey = async () => {
    if (!newPasskeyName.trim()) {
      setError(
        formatMessage({ defaultMessage: 'Please enter a name for your passkey', id: 'uUa2U9', description: 'Error message when passkey name is empty' }),
      );
      return;
    }

    try {
      setActionLoading('add');
      setError(null);

      // Generate a smart default name if user just entered generic text
      let finalName = newPasskeyName.trim();
      if (finalName.toLowerCase() === 'passkey' || finalName.toLowerCase() === 'my passkey') {
        const deviceInfo = navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop';
        const browserInfo = navigator.userAgent.includes('Chrome')
          ? 'Chrome'
          : navigator.userAgent.includes('Firefox')
            ? 'Firefox'
            : navigator.userAgent.includes('Safari')
              ? 'Safari'
              : 'Browser';
        finalName = `${deviceInfo} ${browserInfo}`;
      }

      const result = await registerPasskey(finalName);

      if (result.success) {
        setNewPasskeyName('');
        setShowAddForm(false);
        onPasskeysChange?.(); // Notify parent of changes
      } else {
        setError(
          result.error ||
            formatMessage({ defaultMessage: 'Failed to register passkey', id: 'S5AGlo', description: 'Error message when failing to register a passkey' }),
        );
      }
    } catch (err: any) {
      setError(
        err.message ||
          formatMessage({ defaultMessage: 'Failed to register passkey', id: 'S5AGlo', description: 'Error message when failing to register a passkey' }),
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    // todo: some better confirmation dialog
    if (
      !confirm(
        formatMessage({
          defaultMessage: 'Are you sure you want to delete this passkey? This action cannot be undone.',
          id: 'vpARAu',
          description: 'Confirmation message for deleting a passkey',
        }),
      )
    ) {
      return;
    }

    try {
      setActionLoading(passkeyId);
      await deletePasskey(passkeyId);
      onPasskeysChange?.(); // Notify parent of changes
    } catch (err: any) {
      setError(formatMessage({ defaultMessage: 'Failed to delete passkey', id: 'ePYk5e', description: 'Error message when failing to delete a passkey' }));
      console.error('Error deleting passkey:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const getDeviceIcon = (deviceType: string, transports?: string[]) => {
    // If no transports provided, use deviceType as fallback
    if (!transports || transports.length === 0) {
      // Fallback based on common device types
      if (deviceType.toLowerCase().includes('mobile') || deviceType.toLowerCase().includes('phone')) {
        return <Smartphone className="w-5 h-5" />;
      }
      if (deviceType.toLowerCase().includes('desktop') || deviceType.toLowerCase().includes('computer')) {
        return <Monitor className="w-5 h-5" />;
      }
      return <Fingerprint className="w-5 h-5" />; // Default icon
    }

    // Original logic when transports are available
    if (transports.includes('internal')) {
      return <Shield className="w-5 h-5" />;
    }
    if (transports.includes('usb')) {
      return <Usb className="w-5 h-5" />;
    }
    if (transports.includes('nfc') || transports.includes('ble')) {
      return <Smartphone className="w-5 h-5" />;
    }
    return <Monitor className="w-5 h-5" />;
  };

  const formatLastUsed = (lastUsedAt: string | undefined | null) => {
    if (!lastUsedAt) return formatMessage({ defaultMessage: 'Never used', id: 'ZxiG3y', description: 'Label for passkeys that have never been used' });
    return formatDate(new Date(lastUsedAt));
  };

  const formatCreatedAt = (createdAt: string) => {
    return formatDate(new Date(createdAt));
  };

  if (!passkeySupported) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <Alert variant="warning">
            <FormattedMessage
              defaultMessage="Passkeys are not supported on this device or browser."
              description="Passskey unsupported warning message"
              id="GHqL4U"
            />
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <div className="flex justify-between items-center mb-4">
          <h2 className="card-title">
            <Fingerprint className="w-6 h-6" />
            <FormattedMessage defaultMessage="Passkeys" description="Title for the passkeys management section" id="5K/3lA" />
          </h2>
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (!showAddForm) {
                // Pre-fill with a smart default name
                const deviceInfo = navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop';
                const browserInfo = navigator.userAgent.includes('Chrome')
                  ? 'Chrome'
                  : navigator.userAgent.includes('Firefox')
                    ? 'Firefox'
                    : navigator.userAgent.includes('Safari')
                      ? 'Safari'
                      : 'Browser';
                setNewPasskeyName(`${deviceInfo} ${browserInfo}`);
              }
            }}
            className="btn btn-primary btn-sm"
            disabled={actionLoading !== null}
          >
            <Plus className="w-4 h-4 mr-1" />
            <FormattedMessage defaultMessage="Add Passkey" description="Button label for adding a new passkey" id="JTnbHZ" />
          </button>
        </div>

        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}

        {showAddForm && (
          <div className="card bg-base-200 mb-4">
            <div className="card-body p-4">
              <h3 className="font-semibold mb-2">
                <FormattedMessage defaultMessage="Add New Passkey" description="Title for the add new passkey form" id="yBJ1AB" />
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={formatMessage({
                    defaultMessage: 'e.g., Mobile, Work Laptop, Personal Device',
                    description: 'Placeholder for new passkey name input',
                    id: '+0hbIW',
                  })}
                  className="input input-bordered flex-1"
                  value={newPasskeyName}
                  onChange={(e) => setNewPasskeyName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddPasskey();
                    } else if (e.key === 'Escape') {
                      setShowAddForm(false);
                      setNewPasskeyName('');
                    }
                  }}
                  autoFocus
                />
                <button onClick={handleAddPasskey} disabled={actionLoading === 'add' || !newPasskeyName.trim()} className="btn btn-primary">
                  {actionLoading === 'add' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FormattedMessage defaultMessage="Add" description="Add Passkey button label" id="TdWa2s" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewPasskeyName('');
                    setError(null);
                  }}
                  className="btn btn-ghost"
                  disabled={actionLoading === 'add'}
                >
                  <FormattedMessage defaultMessage="Cancel" description="Cancel adding a new passkey button label" id="qbwjLM" />
                </button>
              </div>
              <p className="text-xs text-base-content/60 mt-2">
                <FormattedMessage
                  defaultMessage="Give this passkey a memorable name to identify the device or authenticator."
                  description="Disclaimer for naming a new passkey"
                  id="WBlsh8"
                />
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {passkeys &&
            passkeys.map((passkey) => (
              <div key={passkey.id} className="card bg-base-200">
                <div className="card-body p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-primary">{getDeviceIcon(passkey.deviceType, passkey.transports)}</div>
                      <div>
                        <h4 className="font-semibold">{passkey.name}</h4>
                        <p className="text-sm text-base-content/70">
                          <FormattedMessage
                            defaultMessage="Last used: {lastUsed}"
                            values={{ lastUsed: formatLastUsed(passkey.lastUsedAt) }}
                            description="Label showing the last time a passkey was used"
                            id="MZaQAv"
                          />
                        </p>
                        <p className="text-xs text-base-content/50">
                          <FormattedMessage
                            defaultMessage="Created: {createdAt}"
                            values={{ createdAt: formatCreatedAt(passkey.createdAt) }}
                            description="Label showing the creation date of a passkey"
                            id="e3DPEo"
                          />
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeletePasskey(passkey.id)}
                      disabled={actionLoading === passkey.id}
                      className="btn btn-ghost btn-sm text-error hover:bg-error/10"
                    >
                      {actionLoading === passkey.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default PasskeyManager;
