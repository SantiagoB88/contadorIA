/**
 * Centralised access to runtime configuration for the web app.
 *
 * - `apiPublicUrl` is safe to use in the browser.
 * - `apiInternalUrl` is for server-side fetches (Server Components / Route
 *   Handlers) and may differ inside Docker networking.
 */
const apiPublicUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const apiInternalUrl = process.env.API_INTERNAL_URL ?? apiPublicUrl;

export const env = {
  apiPublicUrl,
  apiInternalUrl,
} as const;
