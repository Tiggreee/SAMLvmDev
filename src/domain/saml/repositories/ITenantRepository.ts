// Puerto de dominio: repositorio de organizaciones cliente (tenants).
// La infraestructura (Postgres o en memoria) implementa este contrato.

import { Tenant } from '@shared/types/saml.types';

export interface ITenantRepository {
  save(tenant: Tenant): Promise<void>;
  findById(id: string): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  findByApiKeyHash(apiKeyHash: string): Promise<Tenant | null>;
  getAll(): Promise<Tenant[]>;
  delete(id: string): Promise<void>;
}
