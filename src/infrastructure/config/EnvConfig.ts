// Validación fail-fast de variables de entorno al arranque.
// Zod garantiza que cualquier var faltante o malformada aborta el proceso
// con un mensaje descriptivo antes de que el servidor acepte conexiones.

import { z } from 'zod';

const envSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  PROTOCOL: z.enum(['http', 'https']).default('https'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Session
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters')
    .default('dev-session-secret-change-me-please-32'),
  SESSION_TTL: z.coerce.number().int().positive().default(86400),

  // Cookies
  HTTPS_ONLY: z.enum(['true', 'false']).default('false'),
  SAMSITE_COOKIES: z.enum(['Strict', 'Lax', 'None']).default('Lax'),

  // Database
  DATABASE_URL: z.string().url().optional(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().max(100).default(10),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),

  // Redis
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.enum(['true', 'false']).default('false'),

  // SAML SP
  SAML_SP_ENTITY_ID: z.string().url().default('https://localhost:3000'),
  SAML_SP_ACS_URL: z.string().url().default('https://localhost:3000/auth/saml/acs'),
  SAML_SP_SLO_URL: z.string().url().default('https://localhost:3000/auth/saml/logout'),
  SAML_SP_CERT_PATH: z.string().default('certificates/sp.crt'),
  SAML_SP_KEY_PATH: z.string().default('certificates/sp.key'),
  SAML_ENCRYPT_ASSERTIONS: z.enum(['true', 'false']).default('false'),
  SAML_SIGN_AUTHN_REQUESTS: z.enum(['true', 'false']).default('false'),

  // SAML clock skew
  CLOCK_SKEW_TOLERANCE: z.coerce.number().int().min(0).max(300).default(60),

  // OIN test mode (fuzzy cert matching — must be false in production)
  OIN_TEST_MODE: z.enum(['true', 'false']).default('false'),

  // CORS
  CORS_ORIGIN: z.string().optional(),

  // IdP: Azure AD
  AZURE_AD_TENANT_ID: z.string().optional(),
  AZURE_AD_APP_ID: z.string().optional(),

  // IdP: Okta
  OKTA_DOMAIN: z.string().optional(),
  OKTA_APP_ID: z.string().optional(),

  // IdP: OneLogin
  ONELOGIN_SUBDOMAIN: z.string().optional(),
  ONELOGIN_APP_ID: z.string().optional(),

  // IdP: PingOne
  PINGONE_ENVIRONMENT_ID: z.string().optional(),
  PINGONE_APPLICATION_ID: z.string().optional(),

  // IdP: env-declared (bring your own)
  IDP_ENTITY_ID: z.string().optional(),
  IDP_SSO_URL: z.string().url().optional(),
  IDP_SLO_URL: z.string().url().optional(),
  IDP_CERT: z.string().optional(),
  IDP_METADATA: z.string().optional(),
  IDP_NAME: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Valida y devuelve todas las variables de entorno del proceso.
 * Llama esta función una vez al inicio de main.ts.
 * Si falla, ZodError describe exactamente qué falta o está mal formado.
 */
export function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment configuration invalid:\n${issues}`);
  }

  // Hard block: OIN_TEST_MODE must never be 'true' in production.
  if (result.data.NODE_ENV === 'production' && result.data.OIN_TEST_MODE === 'true') {
    throw new Error(
      'OIN_TEST_MODE=true is forbidden in production — it weakens SAML signature verification'
    );
  }

  return result.data;
}
