// Implementaciones en memoria de los contratos de repositorio del dominio.
//
// Se usan únicamente en desarrollo/pruebas cuando no hay PostgreSQL ni Redis
// disponibles. No están pensadas para producción: no persisten entre reinicios
// ni se comparten entre instancias. El composition root (`main.ts`) sólo cae a
// ellas fuera de producción; en producción, la ausencia de infraestructura es
// un error de configuración.

import {
  ISAMLConfigRepository,
  ISessionRepository,
  IAuditLogRepository,
} from '@domain/saml/repositories/SAMLRepositories';
import { IdPConfig, SessionData, AuditLog } from '@shared/types/saml.types';

export class InMemorySAMLConfigRepository implements ISAMLConfigRepository {
  private readonly configs = new Map<string, IdPConfig>();

  async getByIdP(idpName: string): Promise<IdPConfig | null> {
    return this.configs.get(idpName) ?? null;
  }

  async getAll(): Promise<IdPConfig[]> {
    return Array.from(this.configs.values());
  }

  async save(config: IdPConfig): Promise<void> {
    this.configs.set(config.id, config);
  }

  async delete(idpName: string): Promise<void> {
    this.configs.delete(idpName);
  }

  async updateCertificate(idpName: string, certificatePath: string): Promise<void> {
    const config = this.configs.get(idpName);
    if (config) {
      this.configs.set(idpName, { ...config, certificatePath });
    }
  }
}

export class InMemorySessionRepository implements ISessionRepository {
  private readonly sessions = new Map<string, SessionData>();

  async save(session: SessionData): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async findById(sessionId: string): Promise<SessionData | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async findByUserId(userId: string): Promise<SessionData[]> {
    return Array.from(this.sessions.values()).filter((s) => s.userId === userId);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async deleteByUserId(userId: string): Promise<void> {
    for (const session of await this.findByUserId(userId)) {
      this.sessions.delete(session.id);
    }
  }

  async update(session: SessionData): Promise<void> {
    this.sessions.set(session.id, session);
  }
}

export class InMemoryAuditLogRepository implements IAuditLogRepository {
  private logs: AuditLog[] = [];

  async save(log: AuditLog): Promise<void> {
    this.logs.push(log);
  }

  async findByUserId(userId: string, limit = 50): Promise<AuditLog[]> {
    return this.logs.filter((l) => l.userId === userId).slice(-limit);
  }

  async findByEventType(eventType: string, limit = 50): Promise<AuditLog[]> {
    return this.logs.filter((l) => l.eventType === eventType).slice(-limit);
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<AuditLog[]> {
    return this.logs.filter(
      (l) => l.timestamp >= startDate && l.timestamp <= endDate
    );
  }

  async deleteOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const before = this.logs.length;
    this.logs = this.logs.filter((l) => l.timestamp > cutoff);
    return before - this.logs.length;
  }

  async countAuthentications(idpNames: string[], since?: Date): Promise<number> {
    const allowed = new Set(idpNames);
    return this.logs.filter(
      (l) =>
        l.eventType === 'LOGIN_SUCCESS' &&
        l.idpName !== undefined &&
        allowed.has(l.idpName) &&
        (!since || l.timestamp >= since)
    ).length;
  }
}
