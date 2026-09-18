import { Injectable } from '@nestjs/common';
import { type OrgRole, Prisma } from '@prisma/client';
import type { Membership } from '@dashgobo/contracts';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  /** The caller's role in an organization, or `null` if they are not a member. */
  async getRole(userId: string, organizationId: string): Promise<OrgRole | null> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  }

  async listForUser(userId: string): Promise<Membership[]> {
    const rows = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true, role: true, organization: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      organizationId: row.organizationId,
      organizationName: row.organization.name,
      role: row.role,
    }));
  }

  create(
    userId: string,
    organizationId: string,
    role: OrgRole,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    return (tx ?? this.prisma).organizationMember.create({
      data: { userId, organizationId, role },
      select: { id: true },
    });
  }
}
