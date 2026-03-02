import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, JSX } from 'react';
import {
  login as apiLogin,
  register as apiRegister,
  verifyEmail as apiVerifyEmail,
  resendVerificationEmail as apiResendVerificationEmail,
  getUser as apiGetUser,
  updateProfile as apiUpdateProfile,
} from '../services/api';
import { authenticateWithPasskey } from '../services/passkey';
import { UpdateProfileRequest } from '../types/api';
import { User, AuthResponse } from '../schemas/apiSchemas';
import { FormattedMessage } from 'react-intl';

interface AuthContextType {
  user: User | null;
  token: string | null;
  permissions: string[];
  login: (email: string, password: string, rememberMe?: boolean) => Promise<AuthResponse>;
  loginWithPasskey: () => Promise<AuthResponse>;
  register: (email: string, alias: string, password: string) => Promise<AuthResponse>;
  verifyEmail: (token: string) => Promise<AuthResponse>;
  resendVerificationEmail: () => Promise<void>;
  fetchUser: () => Promise<void>;
  updateProfile: (data: UpdateProfileRequest) => Promise<User>;
  updateUser: (userData: User) => void;
  setAuthFromResponse: (authResponse: AuthResponse) => void;
  hasPermission: (key: string) => boolean;
  hasAny: (keys: string[]) => boolean;
  hasAll: (keys: string[]) => boolean;
  logout: () => void;
  isLoading: boolean;
  isInitializing: boolean;
  error: ReactNode | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<JSX.Element | null>(null);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setPermissions([]);
    setError(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  }, []);

  const fetchUserData = useCallback(async (): Promise<void> => {
    try {
      const data = await apiGetUser();
      setUser(data.user);
      setPermissions(data.user.permissions ?? []);
      localStorage.setItem('user', JSON.stringify(data.user));
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
      throw error;
    }
  }, [logout]);

  const fetchUser = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await fetchUserData();
    } catch (err) {
      setError(
        <FormattedMessage
          id="89o0ZA"
          defaultMessage="Failed to fetch user data."
          description="Displayed as an error to users while attempting to log in or register"
        />,
      );
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchUserData]);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('authToken');

      if (storedToken) {
        setToken(storedToken);
        try {
          await fetchUserData();
        } catch (error) {
          console.log('Failed to fetch user on app load, logging out');
          console.error(error);
          logout();
        }
      }

      setIsInitializing(false);
    };

    // Listen for logout events from API interceptor
    const handleLogout = () => {
      logout();
    };

    window.addEventListener('auth:logout', handleLogout);

    initializeAuth();

    return () => {
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, [fetchUserData, logout]);

  const login = async (email: string, password: string, rememberMe: boolean = true): Promise<AuthResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await apiLogin({ email, password, rememberMe });

      setToken(data.token);
      setUser(data.user);
      setPermissions(data.permissions ?? []);

      localStorage.setItem('authToken', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      // Immediately hydrate full user (includes rivalUserIds, prefs, permissions)
      try {
        await fetchUserData();
      } catch (e) {
        // Non-fatal: proceed with minimal user if hydration fails
        console.warn('Post-login user hydration failed:', e);
      }

      return data;
    } catch (err) {
      setError(
        <FormattedMessage
          defaultMessage="Login failed. Please try again."
          id="8ZispS"
          description="Displayed as an error to users while attempting to log in or register"
        />,
      );
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithPasskey = async (): Promise<AuthResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await authenticateWithPasskey();

      if (!result.success || !result.authResponse) {
        throw new Error(result.error || 'Passkey authentication failed');
      }

      const data = result.authResponse;
      setToken(data.token);
      setUser(data.user);
      setPermissions(data.permissions ?? []);

      localStorage.setItem('authToken', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      // Hydrate full user after passkey login
      try {
        await fetchUserData();
      } catch (e) {
        console.warn('Post-passkey-login user hydration failed:', e);
      }

      return data;
    } catch (err: any) {
      setError(err.message || 'Passkey login failed. Please try again.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, alias: string, password: string): Promise<AuthResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await apiRegister({ email, alias, password });

      setToken(data.token);
      setUser(data.user);
      setPermissions(data.permissions ?? []);

      localStorage.setItem('authToken', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      // Hydrate full user after registration
      try {
        await fetchUserData();
      } catch (e) {
        console.warn('Post-register user hydration failed:', e);
      }

      return data;
    } catch (err) {
      setError(
        <FormattedMessage
          defaultMessage="Registration failed. Please try again."
          id="/1csZt"
          description="Displayed as an error to users while attempting to log in or register"
        />,
      );
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const verifyEmail = async (token: string): Promise<AuthResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await apiVerifyEmail({ token });

      // After successful verification, log the user in
      setToken(data.token);
      setUser(data.user);
      setPermissions(data.permissions ?? []);

      localStorage.setItem('authToken', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      // Hydrate full user after email verification
      try {
        await fetchUserData();
      } catch (e) {
        console.warn('Post-verify-email user hydration failed:', e);
      }

      return data;
    } catch (err) {
      setError(
        <FormattedMessage
          defaultMessage="Email verification failed. Please try again."
          id="siD2Ie"
          description="Displayed as an error to users while attempting to log in or register"
        />,
      );
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerificationEmail = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await apiResendVerificationEmail();
    } catch (err) {
      setError(
        <FormattedMessage
          defaultMessage="Failed to resend verification email. Please try again."
          id="RHzXYw"
          description="Displayed as an error to users while attempting to log in or register"
        />,
      );
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (data: UpdateProfileRequest): Promise<User> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiUpdateProfile(data);

      // Update user in state and localStorage
      setUser(response.user);
      localStorage.setItem('user', JSON.stringify(response.user));

      return response.user;
    } catch (err) {
      setError(
        <FormattedMessage
          defaultMessage="Failed to update profile. Please try again."
          id="eeAYHv"
          description="Displayed as an error to users while attempting to log in or register"
        />,
      );
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateUser = useCallback((userData: User): void => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  }, []);

  const setAuthFromResponse = (authResponse: AuthResponse): void => {
    setToken(authResponse.token);
    setUser(authResponse.user);
    setPermissions(authResponse.permissions ?? []);
    localStorage.setItem('authToken', authResponse.token);
    localStorage.setItem('user', JSON.stringify(authResponse.user));
    // Hydrate in the background for flows that call this directly (e.g., reset password)
    fetchUserData().catch((e) => console.warn('Post-auth hydrate failed:', e));
  };

  const hasPermission = useCallback((key: string) => permissions.includes(key), [permissions]);
  const hasAny = useCallback((keys: string[]) => keys.some((k) => permissions.includes(k)), [permissions]);
  const hasAll = useCallback((keys: string[]) => keys.every((k) => permissions.includes(k)), [permissions]);

  const value: AuthContextType = {
    user,
    token,
    permissions,
    login,
    loginWithPasskey,
    register,
    verifyEmail,
    resendVerificationEmail,
    fetchUser,
    updateProfile,
    updateUser,
    setAuthFromResponse,
    hasPermission,
    hasAny,
    hasAll,
    logout,
    isLoading,
    isInitializing,
    error,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
