import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import samlify from 'samlify';
import { SAMLAdapter } from '../../src/infrastructure/saml/SAMLAdapter';
import type { IdPConfig } from '../../src/shared/types/saml.types';

const { IdentityProvider, ServiceProvider, Constants } = samlify;

const SP_ENTITY_ID = 'https://localhost:3000';
const ACS_URL = 'https://localhost:3000/saml/acs';
const IDP_ENTITY_ID = 'https://mock-idp.test/metadata';
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

// IdP-mock que firma respuestas SAML con su propia clave privada.
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

// SP de referencia usado por el IdP-mock para fijar audiencia y destino.
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

function registerMockIdP(adapter: SAMLAdapter, entityID: string): void {
  const idp = buildMockIdP();
  const config: IdPConfig = {
    id: 'mock-idp',
    name: 'Mock IdP',
    entityID,
    singleSignOnServiceUrl: 'https://mock-idp.test/sso',
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    certificatePath: '',
    certificateContent: idp.getMetadata(),
    enabled: true,
  };
  adapter.registerIdP(config);
}

describe('SAML assertion round-trip (signed)', () => {
  let signedResponse: string;

  beforeAll(async () => {
    ensureIdpCerts();
    const idp = buildMockIdP();
    const sp = buildReferenceSP();
    const { context } = await idp.createLoginResponse(
      sp,
      null,
      'post',
      { email: USER_EMAIL }
    );
    signedResponse = context;
  });

  it('acepta una assertion firmada por el IdP conocido y extrae el email', async () => {
    const adapter = new SAMLAdapter(SP_ENTITY_ID, ACS_URL);
    registerMockIdP(adapter, IDP_ENTITY_ID);

    const result = await adapter.validateResponse(signedResponse, '', 'mock-idp');

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.attributes?.email).toBe(USER_EMAIL);
  });

  it('rechaza una respuesta manipulada (firma inválida)', async () => {
    const adapter = new SAMLAdapter(SP_ENTITY_ID, ACS_URL);
    registerMockIdP(adapter, IDP_ENTITY_ID);

    const decoded = Buffer.from(signedResponse, 'base64').toString('utf-8');
    const tampered = decoded.replace(USER_EMAIL, 'attacker@evil.com');
    const tamperedB64 = Buffer.from(tampered, 'utf-8').toString('base64');

    const result = await adapter.validateResponse(tamperedB64, '', 'mock-idp');

    expect(result.isValid).toBe(false);
  });

  it('rechaza una assertion cuyo issuer no coincide con el IdP configurado', async () => {
    const adapter = new SAMLAdapter(SP_ENTITY_ID, ACS_URL);
    registerMockIdP(adapter, 'https://otro-idp.test/metadata');

    const result = await adapter.validateResponse(signedResponse, '', 'mock-idp');

    expect(result.isValid).toBe(false);
  });
});
