'use client';

import { useCallback } from 'react';
import { useAuth } from './auth-context';
import { useOrg } from './org-context';
import { apiFetch, ApiRequestError, type ApiFetchOptions } from './api';

/**
 * The base for every data hook: attaches the access token + current
 * organization automatically, and transparently retries once after a silent
 * token refresh if the access token had expired mid-session (its TTL is only
 * 15 minutes — see AuthProvider.refreshAccessToken).
 */
export function useApiFetch() {
  const { accessToken, refreshAccessToken } = useAuth();
  const { organizationId } = useOrg();

  return useCallback(
    async <T,>(path: string, init: ApiFetchOptions = {}): Promise<T> => {
      const withAuth = (token: string | null): ApiFetchOptions => ({
        ...init,
        accessToken: token ?? undefined,
        organizationId: organizationId ?? undefined,
      });

      try {
        return await apiFetch<T>(path, withAuth(accessToken));
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === 'UNAUTHENTICATED') {
          const freshToken = await refreshAccessToken();
          if (freshToken) return apiFetch<T>(path, withAuth(freshToken));
        }
        throw err;
      }
    },
    [accessToken, organizationId, refreshAccessToken],
  );
}
