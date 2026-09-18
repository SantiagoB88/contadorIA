import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { LoggerModule } from './observability/logger.module';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ProductsModule } from './modules/products/products.module';
import { HealthModule } from './modules/health/health.module';

/**
 * Composition root. Feature modules (invoices, ...) are added here as each
 * phase lands. They must stay decoupled: cross-module use goes through an
 * injected service, never a direct repository.
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
    CustomersModule,
    ProductsModule,
    HealthModule,
  ],
})
export class AppModule {}
