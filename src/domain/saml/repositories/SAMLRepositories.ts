// Interfaces de repositorio (contrato del dominio)

import { SAMLAttributes, IdPConfig, AuditLog, SessionData } from '@shared/types/saml.types';

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
}

export interface IUserRepository {
  findByEmail(email: string): Promise<any | null>;
  findById(userId: string): Promise<any | null>;
  save(user: any): Promise<void>;
  update(user: any): Promise<void>;
  createOrUpdate(email: string, attributes: SAMLAttributes): Promise<any>;
}

export interface ICertificateRepository {
  getSpCertificate(): Promise<{ cert: string; key: string } | null>;
  getIdPCertificate(idpName: string): Promise<string | null>;
  saveCertificate(idpName: string, certificate: string, expiresAt: Date): Promise<void>;
  deleteCertificate(idpName: string): Promise<void>;
  getAllCertificates(): Promise<Array<{ idpName: string; expiresAt: Date }>>;
}
