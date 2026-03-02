import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { passkeyRegistrationStart, passkeyRegistrationComplete, passkeyAuthenticationStart, passkeyAuthenticationComplete } from './api';
import { AuthResponse } from '../schemas/apiSchemas';

export interface PasskeyRegistrationResult {
  success: boolean;
  error?: string;
}

export interface PasskeyAuthenticationResult {
  success: boolean;
  authResponse?: AuthResponse;
  error?: string;
}

const handleWebAuthnError = (error: any, defaultMessage: string): string => {
  if (error.name === 'NotAllowedError') {
    return 'Passkey operation was cancelled or not allowed';
  }

  if (error.name === 'NotSupportedError') {
    return 'Passkeys are not supported on this device';
  }

  return error.message || defaultMessage;
};

const handleAuthenticationSpecificErrors = (error: any): string | null => {
  if (error.message?.includes('No passkeys found') || error.message?.includes('Passkey not found')) {
    return 'No passkeys found for this device';
  }

  return null;
};

export const registerPasskey = async (name: string): Promise<PasskeyRegistrationResult> => {
  try {
    const { options, passkeyName } = await passkeyRegistrationStart({ name });

    const credential = await startRegistration({
      optionsJSON: options,
    });

    await passkeyRegistrationComplete({
      credential,
      passkeyName,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Passkey registration error:', error);

    return {
      success: false,
      error: handleWebAuthnError(error, 'Failed to register passkey'),
    };
  }
};

export const authenticateWithPasskey = async (): Promise<PasskeyAuthenticationResult> => {
  try {
    const { options } = await passkeyAuthenticationStart();

    const credential = await startAuthentication({
      optionsJSON: options,
    });

    const authResponse = await passkeyAuthenticationComplete({
      credential,
    });

    return {
      success: true,
      authResponse,
    };
  } catch (error: any) {
    console.error('Passkey authentication error:', error);

    const specificError = handleAuthenticationSpecificErrors(error);
    if (specificError) {
      return {
        success: false,
        error: specificError,
      };
    }

    return {
      success: false,
      error: handleWebAuthnError(error, 'Failed to authenticate with passkey'),
    };
  }
};

export const isPasskeySupported = (): boolean => {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && typeof window.PublicKeyCredential === 'function';
};

export const isPlatformPasskeyAvailable = async (): Promise<boolean> => {
  try {
    if (!isPasskeySupported()) {
      return false;
    }

    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch (error) {
    console.error('Error checking platform authenticator availability:', error);
    return false;
  }
};
