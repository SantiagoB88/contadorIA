import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { LoggerModule } from './observability/logger.module';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { HealthModule } from './modules/health/health.module';

/**
 * Composition root. Feature modules (customers, products, invoices, ...) are
 * added here as each phase lands. They must stay decoupled: cross-module use
 * goes through an injected service, never a direct repository.
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    PrismaModule,
    CommonModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    HealthModule,
  ],
})
export class AppModule {}
