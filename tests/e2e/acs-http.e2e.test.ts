import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
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
const IDP_ENTITY_ID = 'https://mock-idp.test/metadata';
const IDP_NAME = 'mock-idp';
const USER_EMAIL = 'alice@example.com';

const here = dirname(fileURLToPath(import.meta.url));
const TMP = resolve(here, '../.tmp');
const idpKeyPath = resolve(TMP, 'idp.key');
const idpCrtPath = resolve(TMP, 'idp.crt');

function ensureIdpCerts(): void {
  mkdirSync(TMP, { recursive: true });
  if (existsSync(idpKeyPath) && existsSync(idpCrtPath)) return;
  const r = spawnSync(
    'openssl',
    [
      'req', '-x509', '-newkey', 'rsa:2048',
      '-keyout', idpKeyPath, '-out', idpCrtPath,
      '-days', '2', '-nodes', '-subj', '/CN=mock-idp',
    ],
    { encoding: 'utf-8' }
  );
  if (r.status !== 0) {
    throw new Error(`openssl falló al generar cert del IdP-mock: ${r.stderr}`);
  }
}

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
        Location: 'https://mock-idp.test/sso',
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

function mockIdPConfig(): IdPConfig {
  const idp = buildMockIdP();
  return {
    id: IDP_NAME,
    name: 'Mock IdP',
    entityID: IDP_ENTITY_ID,
    singleSignOnServiceUrl: 'https://mock-idp.test/sso',
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    certificatePath: '',
    certificateContent: idp.getMetadata(),
    enabled: true,
  };
}

// Verifica el flujo HTTP completo del ACS: el IdP entrega una respuesta SAML
// firmada mediante POST form-urlencoded (igual que un IdP real), la app la
// valida, crea la sesión y redirige. Sirve además de guarda de regresión para
// el parser application/x-www-form-urlencoded del ACS.
describe('SAML ACS HTTP flow (signed, form-urlencoded)', () => {
  let app: FastifyInstance;
  let signedResponse: string;

  beforeAll(async () => {
    // El SP de la app debe usar la misma entidad/ACS canónico contra el que el
    // IdP-mock firma el Recipient de la respuesta, o samlify la rechaza.
    process.env.SAML_SP_ENTITY_ID = SP_ENTITY_ID;
    process.env.SAML_SP_ACS_URL = ACS_URL;

    ensureIdpCerts();
    app = await buildApp({ additionalIdPs: [mockIdPConfig()] });
    await app.ready();
  });

  beforeEach(async () => {
    const { context } = await buildMockIdP().createLoginResponse(
      buildReferenceSP(),
      null,
      'post',
      { email: USER_EMAIL }
    );
    signedResponse = context;
  });

  afterAll(async () => {
    await app.close();
  });

  it('envía RelayState al IdP al iniciar el login', async () => {
    const res = await app.inject({ method: 'GET', url: `/saml/login?idp=${IDP_NAME}` });

    expect(res.statusCode).toBe(302);
    expect(new URL(String(res.headers.location)).searchParams.get('RelayState')).toBeTruthy();
  });

  it('rechaza un RelayState que no corresponde a la sesión iniciada', async () => {
    const login = await app.inject({ method: 'GET', url: `/saml/login?idp=${IDP_NAME}` });
    const setCookie = login.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : String(setCookie)).split(';')[0];
    const res = await app.inject({
      method: 'POST',
      url: `/saml/acs?idp=${IDP_NAME}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      payload: new URLSearchParams({
        SAMLResponse: signedResponse,
        RelayState: Buffer.from('/welcome', 'utf-8').toString('base64'),
      }).toString(),
    });

    expect(res.statusCode).toBe(400);
  });

  it('rechaza un InResponseTo firmado de otra solicitud', async () => {
    const login = await app.inject({ method: 'GET', url: `/saml/login?idp=${IDP_NAME}` });
    const relayState = new URL(String(login.headers.location)).searchParams.get('RelayState')!;
    const setCookie = login.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : String(setCookie)).split(';')[0];
    const { context } = await buildMockIdP().createLoginResponse(
      buildReferenceSP(),
      { extract: { request: { id: '_other-request' } } },
      'post',
      { email: USER_EMAIL }
    );
    const res = await app.inject({
      method: 'POST',
      url: `/saml/acs?idp=${IDP_NAME}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      payload: new URLSearchParams({ SAMLResponse: context, RelayState: relayState }).toString(),
    });

    expect(res.statusCode).toBe(400);
  });

  it('acepta la respuesta firmada para la solicitud iniciada en la sesión', async () => {
    const login = await app.inject({ method: 'GET', url: `/saml/login?idp=${IDP_NAME}` });
    const redirect = new URL(String(login.headers.location));
    const relayState = redirect.searchParams.get('RelayState')!;
    const idp = buildMockIdP();
    const sp = buildReferenceSP();
    const requestInfo = await idp.parseLoginRequest(sp, 'redirect', {
      query: { SAMLRequest: redirect.searchParams.get('SAMLRequest')! },
    });
    const { context } = await idp.createLoginResponse(sp, requestInfo, 'post', { email: USER_EMAIL });
    const setCookie = login.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : String(setCookie)).split(';')[0];
    const res = await app.inject({
      method: 'POST',
      url: `/saml/acs?idp=${IDP_NAME}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      payload: new URLSearchParams({ SAMLResponse: context, RelayState: relayState }).toString(),
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  it('acepta el POST form-urlencoded del IdP, crea sesión y redirige', async () => {
    const payload = new URLSearchParams({
      SAMLResponse: signedResponse,
    }).toString();

    const res = await app.inject({
      method: 'POST',
      url: `/saml/acs?idp=${IDP_NAME}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(cookieHeader).toContain('sessionId');
  });

  it('respeta el RelayState para la redirección posterior al login', async () => {
    const relayState = Buffer.from('/welcome', 'utf-8').toString('base64');
    const payload = new URLSearchParams({
      SAMLResponse: signedResponse,
      RelayState: relayState,
    }).toString();

    const res = await app.inject({
      method: 'POST',
      url: `/saml/acs?idp=${IDP_NAME}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/welcome');
  });

  it('no redirige fuera del sitio con un RelayState externo', async () => {
    const relayState = Buffer.from('https://external.example/collect', 'utf-8').toString('base64');
    const res = await app.inject({
      method: 'POST',
      url: `/saml/acs?idp=${IDP_NAME}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ SAMLResponse: signedResponse, RelayState: relayState }).toString(),
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  it('rechaza una respuesta SAML firmada ya utilizada', async () => {
    const payload = new URLSearchParams({ SAMLResponse: signedResponse }).toString();
    const send = () => app.inject({
      method: 'POST',
      url: `/saml/acs?idp=${IDP_NAME}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload,
    });

    expect((await send()).statusCode).toBe(302);
    expect((await send()).statusCode).toBe(400);
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
      url: `/saml/acs?idp=${IDP_NAME}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload,
    });

    expect(res.statusCode).toBe(400);
  });
});
