'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type {
  AuthResult,
  LoginRequest,
  Membership,
  MeResponse,
  PublicUser,
  RefreshResult,
  RegisterRequest,
} from '@dashgobo/contracts';
import { apiFetch } from './api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  memberships: Membership[];
  accessToken: string | null;
}

interface AuthContextValue extends AuthState {
  login: (credentials: LoginRequest) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  /** Exchanges the refresh cookie for a new access token. Returns null if the session is gone. */
  refreshAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const INITIAL_STATE: AuthState = {
  status: 'loading',
  user: null,
  memberships: [],
  accessToken: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);

  const restoreSession = useCallback(async (): Promise<string | null> => {
    try {
      // The refresh token lives in an httpOnly cookie set by the API; this
      // exchanges it for a fresh access token without the user re-entering
      // credentials (silent session restore, and mid-session token renewal
      // once the short-lived access token expires — see useAuthenticatedFetch).
      const refreshed = await apiFetch<RefreshResult>('/auth/refresh', { method: 'POST' });
      const me = await apiFetch<MeResponse>('/auth/me', { accessToken: refreshed.accessToken });
      setState({
        status: 'authenticated',
        user: me.user,
        memberships: me.memberships,
        accessToken: refreshed.accessToken,
      });
      return refreshed.accessToken;
    } catch {
      setState({ ...INITIAL_STATE, status: 'anonymous' });
      return null;
    }
  }, []);

  useEffect(() => {
    void restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);

  const applyAuthResult = useCallback((result: AuthResult) => {
    setState({
      status: 'authenticated',
      user: result.user,
      memberships: result.memberships,
      accessToken: result.accessToken,
    });
  }, []);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const result = await apiFetch<AuthResult>('/auth/login', {
        method: 'POST',
        body: credentials,
      });
      applyAuthResult(result);
    },
    [applyAuthResult],
  );

  const register = useCallback(
    async (input: RegisterRequest) => {
      const result = await apiFetch<AuthResult>('/auth/register', {
        method: 'POST',
        body: input,
      });
      applyAuthResult(result);
    },
    [applyAuthResult],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      setState({ ...INITIAL_STATE, status: 'anonymous' });
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...state, login, register, logout, refreshAccessToken: restoreSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
