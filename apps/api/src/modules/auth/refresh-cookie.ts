import type { CookieOptions, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'dashgobo_rt';

/**
 * The refresh token lives in an httpOnly cookie so it is never reachable from
 * JavaScript (XSS-safe). `SameSite=Lax` is enough because refresh is a top-level
 * POST from the app origin; `Secure` is added outside development.
 */
function baseOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/api/v1/auth',
  };
}

export function setRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  isProduction: boolean,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...baseOptions(isProduction), expires: expiresAt });
}

export function clearRefreshCookie(res: Response, isProduction: boolean): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions(isProduction));
}
