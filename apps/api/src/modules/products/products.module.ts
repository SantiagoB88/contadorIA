import { Module } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductRepository } from './product.repository';

@Module({
  imports: [MembershipsModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductRepository],
  exports: [ProductRepository],
})
export class ProductsModule {}
