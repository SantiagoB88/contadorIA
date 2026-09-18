import type { Organization as OrganizationRow } from '@prisma/client';
import type { Organization } from '@dashgobo/contracts';

export function toOrganizationDto(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legalName,
    cuit: row.cuit,
    taxCondition: row.taxCondition,
    email: row.email,
    phone: row.phone,
    address: row.address,
    logoUrl: row.logoUrl,
    timezone: row.timezone,
    defaultCurrency: row.defaultCurrency,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
