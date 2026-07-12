import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import { PostgresTenantRepository } from '../../src/infrastructure/persistence/repositories/PostgresTenantRepository';
import type { PgQueryable } from '../../src/infrastructure/persistence/database/PostgresPool';
import type { Tenant } from '../../src/shared/types/saml.types';

// Verifica el SQL del repositorio de tenants contra un Postgres en memoria
// (pg-mem), sin depender de Docker.
function makeDb(): PgQueryable {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as PgQueryable;
}

function baseTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    name: 'Acme Corp',
    slug: `acme-${Math.random().toString(36).slice(2)}`,
    apiKeyHash: 'hash-abc',
    enabled: true,
    createdAt: new Date('2026-07-12T10:00:00.000Z'),
    ...overrides,
  };
}

describe('PostgresTenantRepository (pg-mem)', () => {
  let repo: PostgresTenantRepository;

  beforeEach(async () => {
    repo = new PostgresTenantRepository(makeDb());
    await repo.initialize();
  });

  it('persiste y recupera un tenant por id', async () => {
    const tenant = baseTenant({ id: 't1', slug: 'acme' });
    await repo.save(tenant);
    const found = await repo.findById('t1');
    expect(found?.name).toBe('Acme Corp');
    expect(found?.slug).toBe('acme');
  });

  it('recupera por slug y por hash de apiKey', async () => {
    const tenant = baseTenant({ id: 't2', slug: 'globex', apiKeyHash: 'hash-xyz' });
    await repo.save(tenant);
    expect((await repo.findBySlug('globex'))?.id).toBe('t2');
    expect((await repo.findByApiKeyHash('hash-xyz'))?.id).toBe('t2');
    expect(await repo.findByApiKeyHash('nope')).toBeNull();
  });

  it('actualiza (upsert) un tenant existente', async () => {
    const tenant = baseTenant({ id: 't3', slug: 'initech', enabled: true });
    await repo.save(tenant);
    await repo.save({ ...tenant, enabled: false });
    expect((await repo.findById('t3'))?.enabled).toBe(false);
  });

  it('lista y elimina', async () => {
    await repo.save(baseTenant({ id: 't4', slug: 'a' }));
    await repo.save(baseTenant({ id: 't5', slug: 'b' }));
    expect((await repo.getAll()).length).toBe(2);
    await repo.delete('t4');
    expect(await repo.findById('t4')).toBeNull();
    expect((await repo.getAll()).length).toBe(1);
  });
});
