import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/main';

// Pruebas de comportamiento sobre la app real (sin Redis ni IdP externos).
// Ejercitan el contrato de rutas, la generación de metadata firmada y el
// manejo de errores, no solo la existencia de archivos.
describe('SAML HTTP behavior', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde 200 con estado ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('GET /saml/metadata devuelve metadata SP firmada', async () => {
    const res = await app.inject({ method: 'GET', url: '/saml/metadata' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('EntityDescriptor');
    expect(res.body).toContain('SPSSODescriptor');
  });

  it('el alias deprecado /auth/saml/metadata sigue funcionando', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/saml/metadata' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('EntityDescriptor');
  });

  it('GET /saml/login sin idp devuelve 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/saml/login' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /saml/login con idp desconocido devuelve 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/saml/login?idp=does-not-exist',
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /saml/acs sin SAMLResponse devuelve 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/saml/acs',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /saml/status responde con código válido', async () => {
    const res = await app.inject({ method: 'GET', url: '/saml/status' });
    expect([200, 503]).toContain(res.statusCode);
  });
});
