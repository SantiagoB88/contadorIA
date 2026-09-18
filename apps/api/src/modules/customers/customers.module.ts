import { Module } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerRepository } from './customer.repository';

@Module({
  imports: [MembershipsModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerRepository],
  exports: [CustomerRepository],
})
export class CustomersModule {}
