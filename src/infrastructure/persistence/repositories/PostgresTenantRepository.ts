// Repositorio de tenants respaldado por PostgreSQL.
// Implementa el contrato de dominio `ITenantRepository`. Recibe un `PgQueryable`
// por inyección (pool real o pg-mem), de modo que la lógica SQL es verificable
// sin depender de Docker.

import { ITenantRepository } from '@domain/saml/repositories/ITenantRepository';
import { Tenant } from '@shared/types/saml.types';
import { PgQueryable } from '../database/PostgresPool';

export const TENANTS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS tenants (
    id                 TEXT        PRIMARY KEY,
    name               TEXT        NOT NULL,
    slug               TEXT        NOT NULL UNIQUE,
    api_key_hash       TEXT        NOT NULL,
    enabled            BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL,
    stripe_customer_id TEXT
  );
`;

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  api_key_hash: string;
  enabled: boolean;
  created_at: Date | string;
  stripe_customer_id: string | null;
}

export class PostgresTenantRepository implements ITenantRepository {
  constructor(private readonly db: PgQueryable) {}

  async initialize(): Promise<void> {
    await this.db.query(TENANTS_SCHEMA);
  }

  async save(tenant: Tenant): Promise<void> {
    await this.db.query(
      `INSERT INTO tenants (id, name, slug, api_key_hash, enabled, created_at, stripe_customer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         slug = EXCLUDED.slug,
         api_key_hash = EXCLUDED.api_key_hash,
         enabled = EXCLUDED.enabled,
         stripe_customer_id = EXCLUDED.stripe_customer_id`,
      [
        tenant.id,
        tenant.name,
        tenant.slug,
        tenant.apiKeyHash,
        tenant.enabled,
        tenant.createdAt,
        tenant.stripeCustomerId ?? null,
      ]
    );
  }

  async findById(id: string): Promise<Tenant | null> {
    const result = await this.db.query(`SELECT * FROM tenants WHERE id = $1`, [id]);
    return this.mapRow(result.rows[0] as TenantRow | undefined);
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const result = await this.db.query(`SELECT * FROM tenants WHERE slug = $1`, [slug]);
    return this.mapRow(result.rows[0] as TenantRow | undefined);
  }

  async findByApiKeyHash(apiKeyHash: string): Promise<Tenant | null> {
    const result = await this.db.query(
      `SELECT * FROM tenants WHERE api_key_hash = $1`,
      [apiKeyHash]
    );
    return this.mapRow(result.rows[0] as TenantRow | undefined);
  }

  async getAll(): Promise<Tenant[]> {
    const result = await this.db.query(`SELECT * FROM tenants ORDER BY created_at DESC`);
    return (result.rows as TenantRow[]).map((r) => this.mapRow(r)!);
  }

  async delete(id: string): Promise<void> {
    await this.db.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  }

  private mapRow(row: TenantRow | undefined): Tenant | null {
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      apiKeyHash: row.api_key_hash,
      enabled: row.enabled,
      createdAt: new Date(row.created_at),
      stripeCustomerId: row.stripe_customer_id ?? undefined,
    };
  }
}
