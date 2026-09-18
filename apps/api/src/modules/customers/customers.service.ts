import { Injectable } from '@nestjs/common';
import type {
  CreateCustomerRequest,
  Customer,
  CustomerDetail,
  CustomerListQuery,
  Paginated,
  UpdateCustomerRequest,
} from '@dashgobo/contracts';
import { buildPaginationMeta } from '@dashgobo/contracts';
import { CustomerNotFoundError } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { CustomerRepository } from './customer.repository';
import { toCustomerDetailDto, toCustomerDto } from './customer.mapper';

@Injectable()
export class CustomersService {
  constructor(
    private readonly repo: CustomerRepository,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, query: CustomerListQuery): Promise<Paginated<Customer>> {
    const { data, totalItems } = await this.repo.list(organizationId, query);
    return {
      data: data.map(toCustomerDto),
      meta: buildPaginationMeta(query.page, query.pageSize, totalItems),
    };
  }

  async getById(organizationId: string, id: string): Promise<CustomerDetail> {
    const row = await this.repo.findById(organizationId, id);
    if (!row) throw new CustomerNotFoundError(id);
    const stats = await this.repo.getInvoiceStats(organizationId, id);
    return toCustomerDetailDto(row, stats);
  }

  async create(
    organizationId: string,
    userId: string,
    dto: CreateCustomerRequest,
  ): Promise<Customer> {
    const row = await this.repo.create(organizationId, {
      name: dto.name,
      legalName: dto.legalName,
      documentType: dto.documentType,
      documentNumber: dto.documentNumber,
      taxCondition: dto.taxCondition,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      notes: dto.notes,
    });
    await this.audit.record({
      action: 'CREATE_CUSTOMER',
      entity: 'Customer',
      entityId: row.id,
      organizationId,
      userId,
      metadata: { name: row.name, documentNumber: row.documentNumber },
    });
    return toCustomerDto(row);
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateCustomerRequest,
  ): Promise<Customer> {
    const existing = await this.repo.findById(organizationId, id);
    if (!existing) throw new CustomerNotFoundError(id);

    const row = await this.repo.update(organizationId, id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.legalName !== undefined && { legalName: dto.legalName }),
      ...(dto.documentType !== undefined && { documentType: dto.documentType }),
      ...(dto.documentNumber !== undefined && { documentNumber: dto.documentNumber }),
      ...(dto.taxCondition !== undefined && { taxCondition: dto.taxCondition }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    });
    await this.audit.record({
      action: 'UPDATE_CUSTOMER',
      entity: 'Customer',
      entityId: id,
      organizationId,
      userId,
      metadata: { fields: Object.keys(dto) },
    });
    return toCustomerDto(row);
  }

  async remove(organizationId: string, userId: string, id: string): Promise<void> {
    const existing = await this.repo.findById(organizationId, id);
    if (!existing) throw new CustomerNotFoundError(id);

    await this.repo.softDelete(organizationId, id);
    await this.audit.record({
      action: 'DELETE_CUSTOMER',
      entity: 'Customer',
      entityId: id,
      organizationId,
      userId,
    });
  }
}
