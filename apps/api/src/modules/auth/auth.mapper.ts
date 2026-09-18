import type { User as UserRow } from '@prisma/client';
import type { PublicUser } from '@dashgobo/contracts';

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
