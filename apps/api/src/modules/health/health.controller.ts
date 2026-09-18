import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@dashgobo/contracts';
import { Public } from '../../common/auth/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOkResponse({ description: 'Liveness/readiness snapshot of the API and its dependencies.' })
  check(): Promise<HealthResponse> {
    return this.health.check();
  }
}
