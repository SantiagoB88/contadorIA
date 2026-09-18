import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export type AuditAction =
  | 'REGISTER'
  | 'LOGIN'
  | 'LOGOUT'
  | 'TOKEN_REFRESH'
  | 'REFRESH_REUSE_DETECTED'
  | 'CREATE_ORGANIZATION'
  | 'UPDATE_ORGANIZATION'
  | 'INVITE_MEMBER'
  | 'CHANGE_ROLE'
  | 'CREATE_CUSTOMER'
  | 'UPDATE_CUSTOMER'
  | 'DELETE_CUSTOMER'
  | 'CREATE_PRODUCT'
  | 'UPDATE_PRODUCT'
  | 'CREATE_INVOICE'
  | 'AUTHORIZE_INVOICE';

export interface AuditEntry {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  organizationId?: string | null;
  userId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuditService.name);
  }

  /**
   * Persist an audit record. When a transaction client is supplied the write
   * joins that transaction (all-or-nothing). Otherwise a failure is logged but
   * never propagated — auditing must not break the operation it records.
   */
  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const data = {
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      organizationId: entry.organizationId ?? null,
      userId: entry.userId ?? null,
      metadata: entry.metadata ?? {},
    };

    if (tx) {
      await tx.auditLog.create({ data });
      return;
    }

    try {
      await this.prisma.auditLog.create({ data });
    } catch (err) {
      this.logger.warn({ err, action: entry.action }, 'Failed to write audit log');
    }
  }
}
