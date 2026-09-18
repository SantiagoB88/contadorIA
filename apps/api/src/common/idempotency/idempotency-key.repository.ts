import { Injectable } from '@nestjs/common';
import type { IdempotencyKey, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface CreateIdempotencyKeyInput {
  organizationId: string;
  endpoint: string;
  key: string;
  requestHash: string;
  responseBody: Prisma.InputJsonValue;
}

@Injectable()
export class IdempotencyKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByKey(organizationId: string, endpoint: string, key: string): Promise<IdempotencyKey | null> {
    return this.prisma.idempotencyKey.findUnique({
      where: { organizationId_endpoint_key: { organizationId, endpoint, key } },
    });
  }

  async create(input: CreateIdempotencyKeyInput): Promise<void> {
    // Best-effort: if two identical retries race and both lose the "existing"
    // check, the unique constraint lets exactly one of these writes through;
    // the loser's response was already served to its caller, so a duplicate
    // insert failing here is fine to swallow rather than fail the request.
    await this.prisma.idempotencyKey.create({ data: input }).catch(() => undefined);
  }
}
