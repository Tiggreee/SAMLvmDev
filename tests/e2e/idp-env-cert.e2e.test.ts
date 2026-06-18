import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { FastifyInstance } from 'fastify';
import samlify from 'samlify';
import { buildApp } from '../../src/main';
import { createEnvIdPConfig } from '../../src/infrastructure/config/idp-configs/env-idp.config';

const { IdentityProvider, ServiceProvider, Constants } = samlify;

const SP_ENTITY_ID = 'https://localhost:3000';
const ACS_URL = 'https://localhost:3000/saml/acs';
const IDP_ENTITY_ID = 'https://real-idp.test/metadata';
const IDP_SSO_URL = 'https://real-idp.test/sso';
const IDP_ID = 'real-idp';
const USER_EMAIL = 'carol@example.com';

const here = dirname(fileURLToPath(import.meta.url));
const TMP = resolve(here, '../.tmp');
const idpKeyPath = resolve(TMP, 'real-idp.key');
const idpCrtPath = resolve(TMP, 'real-idp.crt');

function ensureIdpCerts(): void {
  mkdirSync(TMP, { recursive: true });
  if (existsSync(idpKeyPath) && existsSync(idpCrtPath)) return;
  const r = spawnSync(
    'openssl',
    [
      'req', '-x509', '-newkey', 'rsa:2048',
      '-keyout', idpKeyPath, '-out', idpCrtPath,
      '-days', '2', '-nodes', '-subj', '/CN=real-idp',
    ],
    { encoding: 'utf-8' }
  );
  if (r.status !== 0) {
    throw new Error(`openssl falló al generar el cert del IdP: ${r.stderr}`);
  }
}

// IdP real simulado: firma la respuesta con su clave privada. El SP solo conoce
// el certificado público (igual que un Okta/Azure real).
function buildMockIdP() {
  return IdentityProvider({
    entityID: IDP_ENTITY_ID,
    privateKey: readFileSync(idpKeyPath, 'utf-8'),
    signingCert: readFileSync(idpCrtPath, 'utf-8'),
    isAssertionEncrypted: false,
    requestSignatureAlgorithm: Constants.algorithms.signature.RSA_SHA256,
    singleSignOnService: [
      {
        Binding: Constants.namespace.binding.redirect,
        Location: IDP_SSO_URL,
      },
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
      {
        Binding: Constants.namespace.binding.post,
        Location: ACS_URL,
      },
    ],
  });
}

// Verifica la vía de despliegue real: un IdP declarado por variables de entorno
// (IDP_ENTITY_ID, IDP_SSO_URL, IDP_CERT_PATH apuntando a un certificado X.509
// pelado en disco, sin metadata XML) completa un login firmado a través del ACS
// HTTP. Es mecánicamente idéntico a conectar un Okta/Azure real: solo cambia
// quién emitió el certificado.
describe('IdP por entorno con certificado real (sin metadata XML)', () => {
  let app: FastifyInstance;
  let signedResponse: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    ensureIdpCerts();

    for (const key of [
      'SAML_SP_ENTITY_ID', 'SAML_SP_ACS_URL',
      'IDP_ID', 'IDP_ENTITY_ID', 'IDP_SSO_URL', 'IDP_CERT_PATH',
    ]) {
      savedEnv[key] = process.env[key];
    }

    process.env.SAML_SP_ENTITY_ID = SP_ENTITY_ID;
    process.env.SAML_SP_ACS_URL = ACS_URL;
    // El IdP solo publica su certificado de firma pelado en disco.
    process.env.IDP_ID = IDP_ID;
    process.env.IDP_ENTITY_ID = IDP_ENTITY_ID;
    process.env.IDP_SSO_URL = IDP_SSO_URL;
    process.env.IDP_CERT_PATH = idpCrtPath;

    const idp = buildMockIdP();
    const sp = buildReferenceSP();
    const { context } = await idp.createLoginResponse(sp, null, 'post', {
      email: USER_EMAIL,
    });
    signedResponse = context;

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('createEnvIdPConfig arma el IdPConfig desde el entorno', () => {
    const config = createEnvIdPConfig();
    expect(config).not.toBeNull();
    expect(config?.id).toBe(IDP_ID);
    expect(config?.entityID).toBe(IDP_ENTITY_ID);
    expect(config?.singleSignOnServiceUrl).toBe(IDP_SSO_URL);
    expect(config?.certificatePath).toBe(idpCrtPath);
  });

  it('createEnvIdPConfig devuelve null sin datos mínimos', () => {
    expect(createEnvIdPConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      createEnvIdPConfig({ IDP_ENTITY_ID: 'x' } as NodeJS.ProcessEnv)
    ).toBeNull();
  });

  it('acepta una assertion firmada por el IdP del entorno y crea sesión', async () => {
    const payload = new URLSearchParams({
      SAMLResponse: signedResponse,
    }).toString();

    const res = await app.inject({
      method: 'POST',
      url: `/saml/acs?idp=${IDP_ID}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookieHeader = Array.isArray(setCookie)
      ? setCookie.join(';')
      : String(setCookie);
    expect(cookieHeader).toContain('sessionId');
  });

  it('rechaza con 400 una respuesta manipulada', async () => {
    const decoded = Buffer.from(signedResponse, 'base64').toString('utf-8');
    const tampered = decoded.replace(USER_EMAIL, 'attacker@evil.com');
    const tamperedB64 = Buffer.from(tampered, 'utf-8').toString('base64');
    const payload = new URLSearchParams({
      SAMLResponse: tamperedB64,
    }).toString();

    const res = await app.inject({
      method: 'POST',
      url: `/saml/acs?idp=${IDP_ID}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload,
    });

    expect(res.statusCode).toBe(400);
  });
});
