import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateOrganizationRequest,
  Organization,
  OrganizationSummary,
  UpdateOrganizationRequest,
} from '@dashgobo/contracts';
import { NotFoundError } from '../../common/errors';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MembershipService } from '../memberships/membership.service';
import { OrganizationRepository } from './organization.repository';
import { toOrganizationDto } from './organization.mapper';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: OrganizationRepository,
    private readonly memberships: MembershipService,
    private readonly audit: AuditService,
  ) {}

  /** Organizations the current user belongs to, with their role in each. */
  async listForUser(userId: string): Promise<OrganizationSummary[]> {
    const memberships = await this.memberships.listForUser(userId);
    if (memberships.length === 0) return [];

    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: memberships.map((m) => m.organizationId) } },
    });
    const roleByOrg = new Map(memberships.map((m) => [m.organizationId, m.role]));

    return orgs.flatMap((org) => {
      const role = roleByOrg.get(org.id);
      if (!role) return [];
      return [
        {
          id: org.id,
          name: org.name,
          legalName: org.legalName,
          cuit: org.cuit,
          taxCondition: org.taxCondition,
          role,
        } satisfies OrganizationSummary,
      ];
    });
  }

  async getById(id: string): Promise<Organization> {
    const org = await this.repo.findById(id);
    if (!org) throw new NotFoundError('Organization not found', { organizationId: id });
    return toOrganizationDto(org);
  }

  async createForUser(userId: string, input: CreateOrganizationRequest): Promise<Organization> {
    const org = await this.prisma.$transaction(async (tx) => {
      const created = await this.repo.create(this.toCreateInput(input), tx);
      await this.memberships.create(userId, created.id, 'OWNER', tx);
      await this.audit.record(
        {
          action: 'CREATE_ORGANIZATION',
          entity: 'Organization',
          entityId: created.id,
          organizationId: created.id,
          userId,
          metadata: { name: created.name },
        },
        tx,
      );
      return created;
    });
    return toOrganizationDto(org);
  }

  async update(
    id: string,
    userId: string,
    input: UpdateOrganizationRequest,
  ): Promise<Organization> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Organization not found', { organizationId: id });

    const updated = await this.repo.update(id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.legalName !== undefined && { legalName: input.legalName }),
      ...(input.cuit !== undefined && { cuit: input.cuit }),
      ...(input.taxCondition !== undefined && { taxCondition: input.taxCondition }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
      ...(input.defaultCurrency !== undefined && { defaultCurrency: input.defaultCurrency }),
    });

    await this.audit.record({
      action: 'UPDATE_ORGANIZATION',
      entity: 'Organization',
      entityId: id,
      organizationId: id,
      userId,
      metadata: { fields: Object.keys(input) },
    });

    return toOrganizationDto(updated);
  }

  private toCreateInput(input: CreateOrganizationRequest): Prisma.OrganizationCreateInput {
    return {
      name: input.name,
      legalName: input.legalName,
      cuit: input.cuit,
      taxCondition: input.taxCondition,
      email: input.email,
      phone: input.phone,
      address: input.address,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.defaultCurrency ? { defaultCurrency: input.defaultCurrency } : {}),
    };
  }
}
