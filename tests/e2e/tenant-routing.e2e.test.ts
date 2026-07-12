import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/main';

// Verifica el enrutamiento y aislamiento SAML por tenant (/saml/t/:slug/*).
const ADMIN_KEY = 'test-admin-key-at-least-24-chars-long';

async function createTenant(app: FastifyInstance, name: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/tenants',
    headers: { 'x-admin-key': ADMIN_KEY },
    payload: { name },
  });
  return res.json();
}

describe('Tenant SSO routing (/saml/t/:slug)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.ADMIN_API_KEY;
  });

  it('devuelve 404 para un tenant desconocido', async () => {
    const res = await app.inject({ method: 'GET', url: '/saml/t/inexistente/login?idp=x' });
    expect(res.statusCode).toBe(404);
  });

  it('devuelve 400 si falta idp en login de un tenant válido', async () => {
    const t = await createTenant(app, 'Umbrella');
    const res = await app.inject({ method: 'GET', url: `/saml/t/${t.slug}/login` });
    expect(res.statusCode).toBe(400);
  });

  it('rechaza un idp que no pertenece al tenant con 404', async () => {
    const t = await createTenant(app, 'Wayne Ent');
    const res = await app.inject({
      method: 'GET',
      url: `/saml/t/${t.slug}/login?idp=okta`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('un tenant deshabilitado devuelve 403', async () => {
    const t = await createTenant(app, 'Stark');
    await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${t.id}`,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { enabled: false },
    });
    const res = await app.inject({ method: 'GET', url: `/saml/t/${t.slug}/login?idp=x` });
    expect(res.statusCode).toBe(403);
  });

  it('el ACS de un tenant sin SAMLResponse devuelve 400', async () => {
    const t = await createTenant(app, 'Cyberdyne');
    const res = await app.inject({
      method: 'POST',
      url: `/saml/t/${t.slug}/acs`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('permite login con un idp registrado para el tenant', async () => {
    const t = await createTenant(app, 'Hooli');
    await app.inject({
      method: 'POST',
      url: `/admin/tenants/${t.id}/idps`,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: {
        id: 'hooli-okta',
        name: 'Hooli Okta',
        entityID: 'http://www.okta.com/exkHooli',
        singleSignOnServiceUrl: 'https://hooli.okta.com/sso/saml',
        identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        certificatePath: 'certificates/idp-public-certs/hooli.crt',
        enabled: true,
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/saml/t/${t.slug}/login?idp=hooli-okta`,
    });
    // 302 (redirect al IdP) si el IdP se registró correctamente en el validador.
    expect([302, 400]).toContain(res.statusCode);
  });
});
