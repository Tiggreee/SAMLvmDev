import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import { PostgresSAMLConfigRepository } from '../../src/infrastructure/persistence/repositories/PostgresSAMLConfigRepository';
import type { PgQueryable } from '../../src/infrastructure/persistence/database/PostgresPool';
import type { IdPConfig } from '../../src/shared/types/saml.types';

function makeDb(): PgQueryable {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as PgQueryable;
}

function makeConfig(overrides: Partial<IdPConfig> = {}): IdPConfig {
  return {
    id: 'okta',
    name: 'Okta',
    entityID: 'https://dev.okta.com',
    singleSignOnServiceUrl: 'https://dev.okta.com/sso',
    singleLogoutServiceUrl: 'https://dev.okta.com/slo',
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    certificatePath: './certificates/idp-public-certs/okta.crt',
    enabled: true,
    attributeMapping: { email: 'emailaddress', groups: 'Group' },
    ...overrides,
  };
}

describe('PostgresSAMLConfigRepository (pg-mem)', () => {
  let repo: PostgresSAMLConfigRepository;

  beforeEach(async () => {
    repo = new PostgresSAMLConfigRepository(makeDb());
    await repo.initialize();
  });

  it('guarda y recupera una config por id', async () => {
    await repo.save(makeConfig());

    const found = await repo.getByIdP('okta');

    expect(found).not.toBeNull();
    expect(found!.entityID).toBe('https://dev.okta.com');
    expect(found!.singleLogoutServiceUrl).toBe('https://dev.okta.com/slo');
    expect(found!.attributeMapping).toEqual({ email: 'emailaddress', groups: 'Group' });
    expect(found!.enabled).toBe(true);
  });

  it('devuelve null para una config inexistente', async () => {
    expect(await repo.getByIdP('nope')).toBeNull();
  });

  it('omite campos opcionales ausentes', async () => {
    await repo.save(
      makeConfig({ id: 'minimal', singleLogoutServiceUrl: undefined, attributeMapping: undefined })
    );

    const found = await repo.getByIdP('minimal');

    expect(found!.singleLogoutServiceUrl).toBeUndefined();
    expect(found!.attributeMapping).toBeUndefined();
  });

  it('save hace upsert sobre el mismo id', async () => {
    await repo.save(makeConfig({ name: 'Okta' }));
    await repo.save(makeConfig({ name: 'Okta Prod', enabled: false }));

    const found = await repo.getByIdP('okta');
    expect(found!.name).toBe('Okta Prod');
    expect(found!.enabled).toBe(false);

    const all = await repo.getAll();
    expect(all).toHaveLength(1);
  });

  it('getAll devuelve todas las configs ordenadas por id', async () => {
    await repo.save(makeConfig({ id: 'okta' }));
    await repo.save(makeConfig({ id: 'azure-ad' }));

    const all = await repo.getAll();
    expect(all.map((c) => c.id)).toEqual(['azure-ad', 'okta']);
  });

  it('updateCertificate cambia solo la ruta del certificado', async () => {
    await repo.save(makeConfig());
    await repo.updateCertificate('okta', './certificates/idp-public-certs/okta-new.crt');

    const found = await repo.getByIdP('okta');
    expect(found!.certificatePath).toBe('./certificates/idp-public-certs/okta-new.crt');
    expect(found!.entityID).toBe('https://dev.okta.com');
  });

  it('delete elimina la config', async () => {
    await repo.save(makeConfig());
    await repo.delete('okta');

    expect(await repo.getByIdP('okta')).toBeNull();
    expect(await repo.getAll()).toEqual([]);
  });
});
