import { API_BASE_PATH, isApiError, type ApiError } from '@dashgobo/contracts';
import { env } from './env';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiError | null,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** Canonical machine-readable error code, when the API returned one. */
  get code(): string | undefined {
    return this.payload?.error.code;
  }
}

interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Force the Docker-internal base URL. Defaults to true on the server. */
  internal?: boolean;
  /** Sets `Authorization: Bearer <token>` — the access token from `useAuth()`. */
  accessToken?: string;
}

/**
 * Thin typed wrapper around `fetch` for talking to the DashGoBo API.
 * Always sends credentials so the httpOnly refresh cookie travels with
 * same-site requests (web and api are different origins but the same site in
 * dev — both `localhost` — and in prod both under the same registrable domain).
 */
export async function apiFetch<TResponse>(
  path: string,
  { body, internal, accessToken, headers, ...init }: ApiFetchOptions = {},
): Promise<TResponse> {
  const isServer = typeof window === 'undefined';
  const base = (internal ?? isServer) ? env.apiInternalUrl : env.apiPublicUrl;
  const url = `${base}${API_BASE_PATH}${path}`;

  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const raw: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const payload = isApiError(raw) ? raw : null;
    const message = payload?.error.message ?? `Request failed (${response.status})`;
    throw new ApiRequestError(response.status, payload, message);
  }

  return raw as TResponse;
}
