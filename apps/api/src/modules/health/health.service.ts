import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@dashgobo/contracts';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const API_VERSION = process.env.npm_package_version ?? '0.0.0';

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    const databaseOk = await this.prisma.isReachable();

    return {
      status: databaseOk ? 'ok' : 'degraded',
      service: 'dashgobo-api',
      version: API_VERSION,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      checks: {
        database: databaseOk ? 'ok' : 'down',
      },
    };
  }
}
