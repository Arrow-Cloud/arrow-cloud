import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Fingerprint, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isPasskeySupported, isPlatformPasskeyAvailable } from '../../services/passkey';
import { FormattedMessage } from 'react-intl';

interface PasskeyButtonProps {
  onSuccess?: () => void;
  disabled?: boolean;
  className?: string;
  /** When true, automatically triggers the passkey prompt once on mount (if a platform passkey is available). */
  autoPrompt?: boolean;
}

const PasskeyButton: React.FC<PasskeyButtonProps> = ({ onSuccess, disabled = false, className = '', autoPrompt = false }) => {
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [platformAvailable, setPlatformAvailable] = useState(false);
  const { loginWithPasskey } = useAuth();
  const autoPromptTriggered = useRef(false);

  const handlePasskeyLogin = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      setIsPasskeyLoading(true);
      try {
        // Suppress the global auth error for the automatic prompt so that simply
        // dismissing it doesn't surface a "cancelled" error on the login page.
        await loginWithPasskey({ suppressError: silent });
        onSuccess?.();
      } catch (error) {
        // Error is handled by auth context
        console.error('Passkey login failed:', error);
      } finally {
        setIsPasskeyLoading(false);
      }
    },
    [loginWithPasskey, onSuccess],
  );

  useEffect(() => {
    const checkSupport = async () => {
      const supported = isPasskeySupported();
      const available = await isPlatformPasskeyAvailable();

      setPasskeySupported(supported);
      setPlatformAvailable(available);
    };

    checkSupport();
  }, []);

  useEffect(() => {
    // Prompt immediately on page load rather than waiting for a button click.
    // The button stays visible so the user can retry if they dismiss the prompt.
    if (autoPrompt && passkeySupported && platformAvailable && !autoPromptTriggered.current) {
      autoPromptTriggered.current = true;
      handlePasskeyLogin({ silent: true });
    }
  }, [autoPrompt, passkeySupported, platformAvailable, handlePasskeyLogin]);

  // Don't render if passkeys aren't supported
  if (!passkeySupported) {
    return null;
  }

  const isDisabled = disabled || isPasskeyLoading;

  return (
    <button
      type="button"
      onClick={() => handlePasskeyLogin()}
      disabled={isDisabled}
      className={`btn btn-outline btn-primary w-full text-lg font-semibold shadow-lg hover:shadow-primary/50 transition-all duration-300 transform hover:scale-[1.02] disabled:transform-none disabled:shadow-none ${className}`}
    >
      {isPasskeyLoading ? (
        <>
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          <FormattedMessage defaultMessage="Authenticating..." description="Loading state for passkey authentication" id="HGJlNc" />
        </>
      ) : (
        <>
          <Fingerprint className="w-5 h-5 mr-2" />
          {platformAvailable ? 'Sign in with Passkey' : 'Sign in with Security Key'}
        </>
      )}
    </button>
  );
};

export default PasskeyButton;
