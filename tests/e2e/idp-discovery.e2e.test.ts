import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { FastifyInstance } from 'fastify';
import samlify from 'samlify';
import { buildApp } from '../../src/main';
import type { IdPConfig } from '../../src/shared/types/saml.types';

const { IdentityProvider, ServiceProvider, Constants } = samlify;

const SP_ENTITY_ID = 'https://localhost:3000';
const ACS_URL = 'https://localhost:3000/saml/acs';

// Dos IdP distintos registrados a la vez (multi-tenant).
const IDP_A = {
  id: 'tenant-a',
  entityID: 'https://tenant-a.idp.test/metadata',
  ssoUrl: 'https://tenant-a.idp.test/sso',
  email: 'ana@tenant-a.com',
};
const IDP_B = {
  id: 'tenant-b',
  entityID: 'https://tenant-b.idp.test/metadata',
  ssoUrl: 'https://tenant-b.idp.test/sso',
  email: 'bruno@tenant-b.com',
};

const here = dirname(fileURLToPath(import.meta.url));
const TMP = resolve(here, '../.tmp');

function certPaths(id: string) {
  return {
    key: resolve(TMP, `disc-${id}.key`),
    crt: resolve(TMP, `disc-${id}.crt`),
  };
}

function ensureCerts(id: string, cn: string): void {
  mkdirSync(TMP, { recursive: true });
  const { key, crt } = certPaths(id);
  if (existsSync(key) && existsSync(crt)) return;
  const r = spawnSync(
    'openssl',
    [
      'req', '-x509', '-newkey', 'rsa:2048',
      '-keyout', key, '-out', crt,
      '-days', '2', '-nodes', '-subj', `/CN=${cn}`,
    ],
    { encoding: 'utf-8' }
  );
  if (r.status !== 0) {
    throw new Error(`openssl falló al generar cert ${id}: ${r.stderr}`);
  }
}

function buildIdP(tenant: { entityID: string; ssoUrl: string }, id: string) {
  const { key, crt } = certPaths(id);
  return IdentityProvider({
    entityID: tenant.entityID,
    privateKey: readFileSync(key, 'utf-8'),
    signingCert: readFileSync(crt, 'utf-8'),
    isAssertionEncrypted: false,
    requestSignatureAlgorithm: Constants.algorithms.signature.RSA_SHA256,
    singleSignOnService: [
      { Binding: Constants.namespace.binding.redirect, Location: tenant.ssoUrl },
    ],
    nameIDFormat: ['urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'],
  });
}

function buildReferenceSP() {
  return ServiceProvider({
    entityID: SP_ENTITY_ID,
    authnRequestsSigned: false,
    wantAssertionsSigned: true,
    assertionConsumerService: [
      { Binding: Constants.namespace.binding.post, Location: ACS_URL },
    ],
  });
}

function idpConfig(
  tenant: { id: string; entityID: string; ssoUrl: string },
  id: string
): IdPConfig {
  const idp = buildIdP(tenant, id);
  return {
    id: tenant.id,
    name: tenant.id,
    entityID: tenant.entityID,
    singleSignOnServiceUrl: tenant.ssoUrl,
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    certificatePath: '',
    certificateContent: idp.getMetadata(),
    enabled: true,
  };
}

async function signResponse(
  tenant: { entityID: string; ssoUrl: string; email: string },
  id: string
): Promise<string> {
  const idp = buildIdP(tenant, id);
  const sp = buildReferenceSP();
  const { context } = await idp.createLoginResponse(sp, null, 'post', {
    email: tenant.email,
  });
  return context;
}

// Verifica el descubrimiento de IdP por Issuer (flujo IdP-initiated / ACS
// multi-tenant): con dos IdP registrados, un POST al ACS SIN parámetro `idp` ni
// sesión previa se enruta al IdP correcto leyendo el Issuer de la respuesta.
describe('Auto-discovery de IdP por Issuer (multi-tenant, sin ?idp=)', () => {
  let app: FastifyInstance;
  let responseA: string;
  let responseB: string;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const key of ['SAML_SP_ENTITY_ID', 'SAML_SP_ACS_URL']) {
      saved[key] = process.env[key];
    }
    process.env.SAML_SP_ENTITY_ID = SP_ENTITY_ID;
    process.env.SAML_SP_ACS_URL = ACS_URL;

    ensureCerts(IDP_A.id, 'tenant-a');
    ensureCerts(IDP_B.id, 'tenant-b');

    responseA = await signResponse(IDP_A, IDP_A.id);
    responseB = await signResponse(IDP_B, IDP_B.id);

    app = await buildApp({
      additionalIdPs: [idpConfig(IDP_A, IDP_A.id), idpConfig(IDP_B, IDP_B.id)],
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('enruta al tenant A sin ?idp= leyendo su Issuer', async () => {
    const payload = new URLSearchParams({ SAMLResponse: responseA }).toString();
    const res = await app.inject({
      method: 'POST',
      url: '/saml/acs',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  it('enruta al tenant B sin ?idp= leyendo su Issuer', async () => {
    const payload = new URLSearchParams({ SAMLResponse: responseB }).toString();
    const res = await app.inject({
      method: 'POST',
      url: '/saml/acs',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  it('rechaza con 400 una respuesta de un Issuer no registrado', async () => {
    const unknownId = 'unknown';
    ensureCerts(unknownId, 'intruder');
    const stranger = await signResponse(
      {
        entityID: 'https://intruder.idp.test/metadata',
        ssoUrl: 'https://intruder.idp.test/sso',
        email: 'mallory@intruder.com',
      },
      unknownId
    );
    const payload = new URLSearchParams({ SAMLResponse: stranger }).toString();
    const res = await app.inject({
      method: 'POST',
      url: '/saml/acs',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload,
    });

    expect(res.statusCode).toBe(400);
  });
});
