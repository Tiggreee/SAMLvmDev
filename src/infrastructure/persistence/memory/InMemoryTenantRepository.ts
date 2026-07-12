// Repositorio de tenants en memoria (desarrollo/pruebas). No persiste entre
// reinicios; el composition root solo cae a él fuera de producción.

import { ITenantRepository } from '@domain/saml/repositories/ITenantRepository';
import { Tenant } from '@shared/types/saml.types';

export class InMemoryTenantRepository implements ITenantRepository {
  private readonly tenants = new Map<string, Tenant>();

  async save(tenant: Tenant): Promise<void> {
    this.tenants.set(tenant.id, tenant);
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.tenants.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    for (const tenant of this.tenants.values()) {
      if (tenant.slug === slug) {
        return tenant;
      }
    }
    return null;
  }

  async findByApiKeyHash(apiKeyHash: string): Promise<Tenant | null> {
    for (const tenant of this.tenants.values()) {
      if (tenant.apiKeyHash === apiKeyHash) {
        return tenant;
      }
    }
    return null;
  }

  async getAll(): Promise<Tenant[]> {
    return Array.from(this.tenants.values());
  }

  async delete(id: string): Promise<void> {
    this.tenants.delete(id);
  }
}
