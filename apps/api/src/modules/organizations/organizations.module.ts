import { Module } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationRepository } from './organization.repository';

@Module({
  imports: [MembershipsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationRepository],
  exports: [OrganizationRepository, OrganizationsService],
})
export class OrganizationsModule {}
