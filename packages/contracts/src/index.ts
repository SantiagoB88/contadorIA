/**
 * @dashgobo/contracts
 *
 * Explicit API contracts (Zod schemas + derived TypeScript types) shared by the
 * backend and every client (web today; WhatsApp bot / mobile later).
 *
 * Rule: this package must NOT import Prisma or any server-only dependency. It is
 * the wire format, not the persistence model.
 */
export * from './common/pagination';
export * from './common/api-error';
export * from './common/health';
export * from './common/roles';
export * from './auth/auth';
export * from './organizations/organizations';
export * from './customers/customers';

export const API_VERSION = 'v1' as const;
export const API_BASE_PATH = '/api/v1' as const;
