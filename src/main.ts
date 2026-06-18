// Punto de entrada principal

import 'dotenv/config';
import { fileURLToPath } from 'url';
import type { FastifyInstance } from 'fastify';
import { createFastifyServer, startServer } from './bootstrap';
import { authRoutes } from '@interfaces/http/routes/authRoutes';
import { AuthController } from '@interfaces/http/controllers/AuthController';
import { SAMLAdapter } from '@infrastructure/saml/SAMLAdapter';
import { SSOAuthenticationService } from '@application/services/SSOAuthenticationService';
import { SAMLMetadataService } from '@application/services/SAMLMetadataService';
import { AuditService } from '@application/services/AuditService';
import { createPostgresPool } from '@infrastructure/persistence/database/PostgresPool';
import { PostgresAuditLogRepository } from '@infrastructure/persistence/repositories/PostgresAuditLogRepository';
import { PostgresSAMLConfigRepository } from '@infrastructure/persistence/repositories/PostgresSAMLConfigRepository';
import { connectRedis, buildRedisUrl } from '@infrastructure/persistence/redis/RedisClient';
import { RedisSessionRepository } from '@infrastructure/persistence/repositories/RedisSessionRepository';
import type {
  IAuditLogRepository,
  ISessionRepository,
  ISAMLConfigRepository,
} from '@domain/saml/repositories/SAMLRepositories';
import {
  createAzureADConfig,
} from '@infrastructure/config/idp-configs/azure-ad.config';
import {
  createOktaConfig,
} from '@infrastructure/config/idp-configs/okta.config';
import {
  createGoogleWorkspaceConfig,
} from '@infrastructure/config/idp-configs/google-workspace.config';
import {
  createOneLoginConfig,
} from '@infrastructure/config/idp-configs/onelogin.config';
import {
  createPingIdentityConfig,
} from '@infrastructure/config/idp-configs/pingidentity.config';
import {
  createEnvIdPConfig,
} from '@infrastructure/config/idp-configs/env-idp.config';
import type { IdPConfig } from '@shared/types/saml.types';

/**
 * Opciones de construcción de la app. `additionalIdPs` permite registrar
 * proveedores extra (por ejemplo, un IdP de prueba en e2e) sin alterar el
 * comportamiento de producción cuando no se pasan opciones.
 */
export interface BuildAppOptions {
  additionalIdPs?: IdPConfig[];
}

// Mock repositories (en producción, usarías BD real)
class MockSAMLConfigRepository {
  private configs = new Map();

  async getByIdP(idpName: string) {
    return this.configs.get(idpName) || null;
  }

  async getAll() {
    return Array.from(this.configs.values());
  }

  async save(config: any) {
    this.configs.set(config.id, config);
  }

  async delete(idpName: string) {
    this.configs.delete(idpName);
  }

  async updateCertificate(idpName: string, certificatePath: string) {
    const config = this.configs.get(idpName);
    if (config) {
      config.certificatePath = certificatePath;
    }
  }
}

class MockSessionRepository {
  private sessions = new Map();

  async save(session: any) {
    this.sessions.set(session.id, session);
  }

  async findById(sessionId: string) {
    return this.sessions.get(sessionId) || null;
  }

  async findByUserId(userId: string) {
    return Array.from(this.sessions.values()).filter((s: any) => s.userId === userId);
  }

  async delete(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  async deleteByUserId(userId: string) {
    const sessions = await this.findByUserId(userId);
    sessions.forEach((s: any) => this.sessions.delete(s.id));
  }

  async update(session: any) {
    this.sessions.set(session.id, session);
  }
}

class MockAuditLogRepository {
  private logs: any[] = [];

  async save(log: any) {
    this.logs.push(log);
  }

  async findByUserId(userId: string, limit = 50) {
    return this.logs.filter((l) => l.userId === userId).slice(-limit);
  }

  async findByEventType(eventType: string, limit = 50) {
    return this.logs.filter((l) => l.eventType === eventType).slice(-limit);
  }

  async findByDateRange(startDate: Date, endDate: Date) {
    return this.logs.filter(
      (l) => l.timestamp >= startDate && l.timestamp <= endDate
    );
  }

  async deleteOlderThan(days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const before = this.logs.length;
    this.logs = this.logs.filter((l) => l.timestamp > cutoff);
    return before - this.logs.length;
  }
}

/**
 * Crea los repositorios respaldados por PostgreSQL (auditoría y configuración
 * de IdP) sobre un único pool. Si `DATABASE_URL` está definido se usa
 * PostgreSQL; en su ausencia, en desarrollo se cae a almacenes en memoria,
 * mientras que en producción es un error de configuración.
 */
async function createPersistence(
  fastify: FastifyInstance
): Promise<{ audit: IAuditLogRepository; samlConfig: ISAMLConfigRepository }> {
  const databaseUrl = process.env.DATABASE_URL;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!databaseUrl) {
    if (isProduction) {
      throw new Error(
        'DATABASE_URL es obligatorio en producción para la persistencia (auditoría y configuración de IdP)'
      );
    }
    fastify.log.warn(
      'DATABASE_URL no definido: usando persistencia en memoria (solo desarrollo)'
    );
    return {
      audit: new MockAuditLogRepository(),
      samlConfig: new MockSAMLConfigRepository(),
    };
  }

  try {
    const pool = createPostgresPool(databaseUrl);
    const audit = new PostgresAuditLogRepository(pool);
    await audit.initialize();
    const samlConfig = new PostgresSAMLConfigRepository(pool);
    await samlConfig.initialize();
    fastify.addHook('onClose', async () => {
      await pool.end();
    });
    return { audit, samlConfig };
  } catch (error) {
    if (isProduction) {
      throw error;
    }
    fastify.log.warn(
      `PostgreSQL no disponible (${
        error instanceof Error ? error.message : 'error desconocido'
      }): usando persistencia en memoria (solo desarrollo)`
    );
    return {
      audit: new MockAuditLogRepository(),
      samlConfig: new MockSAMLConfigRepository(),
    };
  }
}

/**
 * Crea el repositorio de sesiones SAML. Usa Redis para persistencia compartida
 * entre instancias; en su ausencia, en desarrollo cae a memoria, mientras que
 * en producción es un error de configuración.
 */
async function createSessionRepository(
  fastify: FastifyInstance
): Promise<ISessionRepository> {
  const isProduction = process.env.NODE_ENV === 'production';
  try {
    const redis = await connectRedis(buildRedisUrl());
    fastify.addHook('onClose', async () => {
      await redis.close();
    });
    return new RedisSessionRepository(redis.client);
  } catch (error) {
    if (isProduction) {
      throw error;
    }
    fastify.log.warn(
      `Redis no disponible (${
        error instanceof Error ? error.message : 'error desconocido'
      }): usando sesiones en memoria (solo desarrollo)`
    );
    return new MockSessionRepository();
  }
}

export async function buildApp(
  options: BuildAppOptions = {}
): Promise<FastifyInstance> {
  const fastify = await createFastifyServer();

    // Inicializar repositorios
    const { audit: auditLogRepo, samlConfig: samlConfigRepo } =
      await createPersistence(fastify);
    const sessionRepo = await createSessionRepository(fastify);

    // Registrar IdP configurados
    const spEntityId = process.env.SAML_SP_ENTITY_ID || 'https://localhost:3000';
    const acsUrl =
      process.env.SAML_SP_ACS_URL || 'https://localhost:3000/auth/saml/acs';
    const sloUrl =
      process.env.SAML_SP_SLO_URL || 'https://localhost:3000/auth/saml/logout';

    // Crear adaptador SAML
    const samlAdapter = new SAMLAdapter(spEntityId, acsUrl, sloUrl);

    // Registrar IdP de forma tolerante: un IdP mal configurado (por ejemplo,
    // sin su certificado) no debe impedir el arranque del gateway.
    const registerIdPSafe = (config: { id: string }): void => {
      try {
        samlAdapter.registerIdP(config as never);
      } catch (error) {
        console.warn(
          `IdP no registrado (${config.id}): ${
            error instanceof Error ? error.message : 'error desconocido'
          }`
        );
      }
    };

    // Registrar IdP disponibles
    const azureAdConfig = createAzureADConfig(
      process.env.AZURE_AD_TENANT_ID || 'default-tenant',
      process.env.AZURE_AD_APP_ID || 'default-app'
    );
    await samlConfigRepo.save(azureAdConfig);
    registerIdPSafe(azureAdConfig);

    const oktaConfig = createOktaConfig(
      process.env.OKTA_DOMAIN || 'dev-12345.okta.com',
      process.env.OKTA_APP_ID || 'exkdefault'
    );
    await samlConfigRepo.save(oktaConfig);
    registerIdPSafe(oktaConfig);

    const googleConfig = createGoogleWorkspaceConfig();
    await samlConfigRepo.save(googleConfig);
    registerIdPSafe(googleConfig);

    const oneloginConfig = createOneLoginConfig(
      process.env.ONELOGIN_SUBDOMAIN || 'dev',
      process.env.ONELOGIN_APP_ID || 'default'
    );
    await samlConfigRepo.save(oneloginConfig);
    registerIdPSafe(oneloginConfig);

    const pingConfig = createPingIdentityConfig(
      process.env.PINGONE_ENVIRONMENT_ID || 'default-env',
      process.env.PINGONE_APPLICATION_ID || 'default-app'
    );
    await samlConfigRepo.save(pingConfig);
    registerIdPSafe(pingConfig);

    // IdP genérico declarado por entorno (bring your own IdP). Permite conectar
    // un IdP real publicando su certificado de firma y sus URLs sin tocar código.
    const envIdPConfig = createEnvIdPConfig();
    if (envIdPConfig) {
      await samlConfigRepo.save(envIdPConfig);
      registerIdPSafe(envIdPConfig);
    }

    // IdP adicionales inyectados por el llamador (p. ej. e2e). En producción
    // no se pasan, por lo que el comportamiento por defecto no cambia.
    for (const extraIdP of options.additionalIdPs ?? []) {
      await samlConfigRepo.save(extraIdP);
      registerIdPSafe(extraIdP);
    }

    // Crear servicios
    const ssoAuthService = new SSOAuthenticationService(
      samlAdapter,
      samlConfigRepo,
      sessionRepo,
      auditLogRepo
    );

    const metadataService = new SAMLMetadataService(samlAdapter);

    const auditService = new AuditService(auditLogRepo);

    // Crear controlador
    const authController = new AuthController(
      ssoAuthService,
      metadataService,
      auditService
    );

    // Registrar rutas
    await fastify.register(async (fastify) => {
      await authRoutes(fastify, authController);
    });

    return fastify;
}

async function start(): Promise<void> {
  try {
    const fastify = await buildApp();
    await startServer(fastify);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  void start();
}
