import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

/**
 * Cross-cutting concerns that apply to every request:
 * - global exception filter (envelope + logging), registered via DI;
 * - global rate limiting (per-IP). Auth endpoints tighten this with `@Throttle`.
 */
@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }])],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class CommonModule {}
