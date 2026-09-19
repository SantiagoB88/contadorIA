import type { Organization } from '@prisma/client';
import { OrganizationsService } from './organizations.service';
import type { OrganizationRepository } from './organization.repository';
import type { MembershipService } from '../memberships/membership.service';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundError } from '../../common/errors';

const now = new Date('2026-01-01T00:00:00.000Z');
const ORG_ID = 'org-1';

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: ORG_ID,
    name: 'Acme',
    legalName: null,
    cuit: null,
    taxCondition: 'NO_CATEGORIZADO',
    email: null,
    phone: null,
    address: null,
    logoUrl: null,
    timezone: 'America/Argentina/Buenos_Aires',
    defaultCurrency: 'ARS',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function build() {
  const repo = {
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<Pick<OrganizationRepository, 'findById' | 'create' | 'update'>>;
  const memberships = { listForUser: jest.fn(), create: jest.fn() } as unknown as MembershipService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<
    Pick<AuditService, 'record'>
  >;
  const prisma = {} as unknown as PrismaService;

  const service = new OrganizationsService(
    prisma,
    repo as unknown as OrganizationRepository,
    memberships,
    audit as unknown as AuditService,
  );
  return { service, repo, audit };
}

describe('OrganizationsService.update', () => {
  it('throws NotFoundError for an organization that does not exist', async () => {
    const { service, repo } = build();
    repo.findById.mockResolvedValue(null);

    await expect(service.update(ORG_ID, 'user-1', { name: 'New name' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('only forwards fields present in the DTO and records an audit entry', async () => {
    const { service, repo, audit } = build();
    repo.findById.mockResolvedValue(makeOrg());
    repo.update.mockResolvedValue(makeOrg({ legalName: 'Acme SRL', cuit: '20123456783' }));

    const result = await service.update(ORG_ID, 'user-1', {
      legalName: 'Acme SRL',
      cuit: '20123456783',
    });

    expect(repo.update).toHaveBeenCalledWith(ORG_ID, { legalName: 'Acme SRL', cuit: '20123456783' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE_ORGANIZATION', entityId: ORG_ID }),
    );
    expect(result.legalName).toBe('Acme SRL');
  });
});
