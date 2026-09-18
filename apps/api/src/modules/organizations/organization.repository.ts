import { Injectable } from '@nestjs/common';
import type { Organization, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  create(
    data: Prisma.OrganizationCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Organization> {
    return (tx ?? this.prisma).organization.create({ data });
  }

  update(id: string, data: Prisma.OrganizationUpdateInput): Promise<Organization> {
    return this.prisma.organization.update({ where: { id }, data });
  }
}
