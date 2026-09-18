import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { HealthService } from './health.service';

function makeService(reachable: boolean): HealthService {
  const prisma = {
    isReachable: jest.fn().mockResolvedValue(reachable),
  } as unknown as PrismaService;
  return new HealthService(prisma);
}

describe('HealthService', () => {
  it('reports ok when the database is reachable', async () => {
    const result = await makeService(true).check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('dashgobo-api');
    expect(result.checks.database).toBe('ok');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('reports degraded when the database is unreachable', async () => {
    const result = await makeService(false).check();

    expect(result.status).toBe('degraded');
    expect(result.checks.database).toBe('down');
  });
});
