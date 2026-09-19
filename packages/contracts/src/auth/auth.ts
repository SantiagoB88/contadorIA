import { z } from 'zod';
import { optionalText } from '../common/zod-helpers';
import { orgRoleSchema } from '../common/roles';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z.string().trim().toLowerCase().email().max(320);
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const registerRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: passwordSchema,
  phone: optionalText(z.string().trim().max(40)),
  organizationName: z.string().trim().min(1).max(120),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const userStatusSchema = z.enum(['ACTIVE', 'INVITED', 'DISABLED']);

export const publicUserSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  status: userStatusSchema,
  createdAt: z.string().datetime(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const membershipSchema = z.object({
  organizationId: z.string().uuid(),
  organizationName: z.string(),
  role: orgRoleSchema,
});
export type Membership = z.infer<typeof membershipSchema>;

/** Login / register response. The refresh token is delivered as an httpOnly cookie. */
export const authResultSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  user: publicUserSchema,
  memberships: z.array(membershipSchema),
});
export type AuthResult = z.infer<typeof authResultSchema>;

export const refreshResultSchema = authResultSchema.pick({
  accessToken: true,
  tokenType: true,
  expiresIn: true,
});
export type RefreshResult = z.infer<typeof refreshResultSchema>;

export const meResponseSchema = z.object({
  user: publicUserSchema,
  memberships: z.array(membershipSchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

/**
 * Always the same shape regardless of whether the email exists — the
 * message never reveals that (§ auth security: no account enumeration).
 * `resetToken`/`resetUrl` are only populated outside production, so the
 * flow is testable without a real mailbox (see MockEmailProvider).
 */
export const forgotPasswordResponseSchema = z.object({
  message: z.string(),
  resetToken: z.string().optional(),
  resetUrl: z.string().optional(),
});
export type ForgotPasswordResponse = z.infer<typeof forgotPasswordResponseSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

/** JWT access-token claims. */
export const accessTokenClaimsSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
});
export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;
