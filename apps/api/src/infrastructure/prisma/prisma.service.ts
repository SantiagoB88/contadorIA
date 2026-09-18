import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaClient } from '@prisma/client';

/**
 * Single shared PrismaClient for the process. Feature repositories inject this
 * and are responsible for scoping every query by `organizationId`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly logger: PinoLogger) {
    super({
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    });
    this.logger.setContext(PrismaService.name);
  }

  async onModuleInit(): Promise<void> {
    // Prisma connects lazily on first query; connecting here surfaces problems
    // early. A failure is logged (and reflected by /health as `database: down`)
    // rather than aborting startup, so `pnpm dev` still works before Postgres is
    // up and the connection is retried on the next query.
    try {
      await this.$connect();
      this.logger.info('Prisma connected to the database');
    } catch (err) {
      this.logger.error({ err }, 'Prisma could not connect to the database at startup');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Lightweight connectivity probe for the health endpoint. */
  async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
