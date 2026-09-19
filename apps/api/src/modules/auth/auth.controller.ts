import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  type AuthResult,
  forgotPasswordRequestSchema,
  type ForgotPasswordRequest,
  type ForgotPasswordResponse,
  loginRequestSchema,
  type LoginRequest,
  type MeResponse,
  type RefreshResult,
  registerRequestSchema,
  type RegisterRequest,
  resetPasswordRequestSchema,
  type ResetPasswordRequest,
} from '@dashgobo/contracts';
import { ZodBody } from '../../common/validation/zod-validation.pipe';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import type { AuthenticatedUser } from '../../common/auth/auth-context';
import { AppConfigService } from '../../config/config.module';
import { AuthService, type RequestContext } from './auth.service';
import { clearRefreshCookie, REFRESH_COOKIE_NAME, setRefreshCookie } from './refresh-cookie';

// Auth endpoints are a brute-force target: tighter than the global limit.
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
@Throttle(AUTH_THROTTLE)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create an account and its first organization (OWNER).' })
  async register(
    @Body(new ZodBody(registerRequestSchema)) dto: RegisterRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const session = await this.auth.register(dto, this.contextOf(req));
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt, this.config.isProduction);
    return session.auth;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange email + password for an access token (refresh set as cookie).',
  })
  async login(
    @Body(new ZodBody(loginRequestSchema)) dto: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const session = await this.auth.login(dto, this.contextOf(req));
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt, this.config.isProduction);
    return session.auth;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh cookie and issue a new access token.' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResult> {
    const rawToken = this.readRefreshCookie(req);
    const rotated = await this.auth.refresh(rawToken, this.contextOf(req));
    setRefreshCookie(res, rotated.refreshToken, rotated.refreshExpiresAt, this.config.isProduction);
    return {
      accessToken: rotated.accessToken,
      tokenType: rotated.tokenType,
      expiresIn: rotated.expiresIn,
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current refresh-token family and clear the cookie.' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.readRefreshCookie(req));
    clearRefreshCookie(res, this.config.isProduction);
  }

  @Get('me')
  @ApiOperation({ summary: 'The authenticated user and their organization memberships.' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.auth.me(user);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password reset link. Always returns 200 — never reveals if the email exists.',
  })
  forgotPassword(
    @Body(new ZodBody(forgotPasswordRequestSchema)) dto: ForgotPasswordRequest,
  ): Promise<ForgotPasswordResponse> {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password from a reset token; revokes every existing session.' })
  resetPassword(
    @Body(new ZodBody(resetPasswordRequestSchema)) dto: ResetPasswordRequest,
  ): Promise<void> {
    return this.auth.resetPassword(dto);
  }

  private contextOf(req: Request): RequestContext {
    return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
  }

  private readRefreshCookie(req: Request): string | undefined {
    // `@types/cookie-parser` types `req.cookies` as `any`; narrow it here.
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE_NAME];
  }
}
