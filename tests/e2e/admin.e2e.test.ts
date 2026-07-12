import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/main';

// Ejercita el panel de administración multi-tenant sobre la app real:
// autenticación por clave maestra, ciclo de vida de tenants y registro de IdP
// por tenant.
const ADMIN_KEY = 'test-admin-key-at-least-24-chars-long';

describe('Admin panel (multi-tenant)', () => {
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

  it('rechaza /admin sin clave con 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/tenants' });
    expect(res.statusCode).toBe(401);
  });

  it('rechaza clave inválida con 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: { 'x-admin-key': 'wrong-key' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('crea un tenant y devuelve la apiKey una sola vez', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { name: 'Acme Corp' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeTruthy();
    expect(body.slug).toBe('acme-corp');
    expect(body.apiKey).toMatch(/^vmd_/);
    expect(body.apiKeyHash).toBeUndefined();
  });

  it('lista, obtiene, registra IdP, deshabilita y elimina un tenant', async () => {
    const created = await app
      .inject({
        method: 'POST',
        url: '/admin/tenants',
        headers: { 'x-admin-key': ADMIN_KEY },
        payload: { name: 'Globex' },
      })
      .then((r) => r.json());

    const list = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().tenants.length).toBeGreaterThanOrEqual(1);

    const get = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${created.id}`,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().name).toBe('Globex');

    const idp = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${created.id}/idps`,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: {
        id: 'globex-okta',
        name: 'Globex Okta',
        entityID: 'http://www.okta.com/exkGlobex',
        singleSignOnServiceUrl: 'https://globex.okta.com/sso/saml',
        identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        certificatePath: 'certificates/idp-public-certs/globex.crt',
        enabled: true,
      },
    });
    expect(idp.statusCode).toBe(201);
    expect(idp.json().tenantId).toBe(created.id);

    const idps = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${created.id}/idps`,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(idps.statusCode).toBe(200);
    expect(idps.json().idps).toHaveLength(1);

    const disabled = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${created.id}`,
      headers: { 'x-admin-key': ADMIN_KEY },
      payload: { enabled: false },
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().enabled).toBe(false);

    const del = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${created.id}`,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(del.statusCode).toBe(204);

    const notFound = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${created.id}`,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(notFound.statusCode).toBe(404);
  });

  it('genera slugs únicos para nombres repetidos', async () => {
    const a = await app
      .inject({
        method: 'POST',
        url: '/admin/tenants',
        headers: { 'x-admin-key': ADMIN_KEY },
        payload: { name: 'Initech' },
      })
      .then((r) => r.json());
    const b = await app
      .inject({
        method: 'POST',
        url: '/admin/tenants',
        headers: { 'x-admin-key': ADMIN_KEY },
        payload: { name: 'Initech' },
      })
      .then((r) => r.json());
    expect(a.slug).toBe('initech');
    expect(b.slug).toBe('initech-1');
  });

  it('expone el uso facturable de un tenant (0 autenticaciones al inicio)', async () => {
    const t = await app
      .inject({
        method: 'POST',
        url: '/admin/tenants',
        headers: { 'x-admin-key': ADMIN_KEY },
        payload: { name: 'Soylent' },
      })
      .then((r) => r.json());

    const usage = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${t.id}/usage?days=30`,
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    expect(usage.statusCode).toBe(200);
    const body = usage.json();
    expect(body.tenantId).toBe(t.id);
    expect(body.authentications).toBe(0);
    expect(body.periodDays).toBe(30);
  });
});
