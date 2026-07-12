// Interfaces de repositorio (contrato del dominio)

import { IdPConfig, AuditLog, SessionData } from '@shared/types/saml.types';

export interface ISAMLConfigRepository {
  getByIdP(idpName: string): Promise<IdPConfig | null>;
  getAll(): Promise<IdPConfig[]>;
  save(config: IdPConfig): Promise<void>;
  delete(idpName: string): Promise<void>;
  updateCertificate(idpName: string, certificatePath: string): Promise<void>;
}

export interface ISessionRepository {
  save(session: SessionData): Promise<void>;
  findById(sessionId: string): Promise<SessionData | null>;
  findByUserId(userId: string): Promise<SessionData[]>;
  delete(sessionId: string): Promise<void>;
  deleteByUserId(userId: string): Promise<void>;
  update(session: SessionData): Promise<void>;
}

export interface IAuditLogRepository {
  save(log: AuditLog): Promise<void>;
  findByUserId(userId: string, limit?: number): Promise<AuditLog[]>;
  findByEventType(eventType: string, limit?: number): Promise<AuditLog[]>;
  findByDateRange(startDate: Date, endDate: Date): Promise<AuditLog[]>;
  deleteOlderThan(days: number): Promise<number>;
  // Cuenta autenticaciones exitosas (LOGIN_SUCCESS) para un conjunto de IdP.
  // Base facturable del uso por tenant. `since` acota el periodo de cobro.
  countAuthentications(idpNames: string[], since?: Date): Promise<number>;
}
