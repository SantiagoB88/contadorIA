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
}

/**
 * Thin typed wrapper around `fetch` for talking to the DashGoBo API.
 * Fase 0: no auth wiring yet — that arrives with the auth module in Fase 2.
 */
export async function apiFetch<TResponse>(
  path: string,
  { body, internal, headers, ...init }: ApiFetchOptions = {},
): Promise<TResponse> {
  const isServer = typeof window === 'undefined';
  const base = (internal ?? isServer) ? env.apiInternalUrl : env.apiPublicUrl;
  const url = `${base}${API_BASE_PATH}${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
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
