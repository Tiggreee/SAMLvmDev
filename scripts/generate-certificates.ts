// Generador de certificados self-signed para desarrollo del Service Provider.
// Produce certificates/sp.key (clave privada RSA) y certificates/sp.crt (cert X.509).
// Requiere openssl en el PATH. No usar estos certificados en producción.

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const CERT_DIR = resolve(process.cwd(), 'certificates');
const KEY_PATH = resolve(CERT_DIR, 'sp.key');
const CRT_PATH = resolve(CERT_DIR, 'sp.crt');

const force = process.argv.includes('--force');
const commonName = process.env.SAML_SP_CN || 'localhost';
const days = process.env.SAML_SP_CERT_DAYS || '825';

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function ensureOpenssl(): void {
  const probe = spawnSync('openssl', ['version'], { encoding: 'utf-8' });
  if (probe.status !== 0) {
    fail('openssl no está disponible en el PATH. Instálalo para generar certificados de desarrollo.');
  }
}

function main(): void {
  if (existsSync(KEY_PATH) && existsSync(CRT_PATH) && !force) {
    console.log('Certificados ya existentes. Usa --force para regenerarlos.');
    console.log(`  ${KEY_PATH}`);
    console.log(`  ${CRT_PATH}`);
    return;
  }

  ensureOpenssl();

  if (!existsSync(CERT_DIR)) {
    mkdirSync(CERT_DIR, { recursive: true });
  }

  const result = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      KEY_PATH,
      '-out',
      CRT_PATH,
      '-days',
      days,
      '-nodes',
      '-subj',
      `/CN=${commonName}`,
    ],
    { encoding: 'utf-8' }
  );

  if (result.status !== 0) {
    fail(`openssl falló al generar el certificado.\n${result.stderr || ''}`);
  }

  console.log('Certificados de desarrollo generados:');
  console.log(`  clave: ${KEY_PATH}`);
  console.log(`  cert:  ${CRT_PATH}`);
  console.log(`  CN=${commonName}, validez=${days} días`);
}

main();
