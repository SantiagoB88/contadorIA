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

  useEffect(() => {
    let cancelled = false;

    async function restoreSession(): Promise<void> {
      try {
        // The refresh token lives in an httpOnly cookie set by the API; this
        // exchanges it for a fresh access token without the user re-entering
        // credentials (silent session restore on page load).
        const refreshed = await apiFetch<RefreshResult>('/auth/refresh', { method: 'POST' });
        const me = await apiFetch<MeResponse>('/auth/me', { accessToken: refreshed.accessToken });
        if (!cancelled) {
          setState({
            status: 'authenticated',
            user: me.user,
            memberships: me.memberships,
            accessToken: refreshed.accessToken,
          });
        }
      } catch {
        if (!cancelled) setState({ ...INITIAL_STATE, status: 'anonymous' });
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
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
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
