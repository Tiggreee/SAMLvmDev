// Repositorio de auditoría respaldado por PostgreSQL.
//
// Implementa el contrato de dominio `IAuditLogRepository`. Recibe un
// `PgQueryable` por inyección (pool real o pg-mem), de modo que la lógica SQL
// es verificable sin depender de Docker.

import { IAuditLogRepository } from '@domain/saml/repositories/SAMLRepositories';
import { AuditLog } from '@shared/types/saml.types';
import { PgQueryable, AUDIT_LOGS_SCHEMA } from '../database/PostgresPool';

interface AuditLogRow {
  id: string;
  timestamp: Date | string;
  event_type: string;
  user_id: string | null;
  idp_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: unknown;
  status: string;
  error_message: string | null;
}

export class PostgresAuditLogRepository implements IAuditLogRepository {
  constructor(private readonly db: PgQueryable) {}

  /**
   * Crea el esquema si no existe. Idempotente; seguro de llamar en el arranque.
   */
  async initialize(): Promise<void> {
    await this.db.query(AUDIT_LOGS_SCHEMA);
  }

  async save(log: AuditLog): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_logs
         (id, timestamp, event_type, user_id, idp_name, ip_address, user_agent, details, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        log.id,
        log.timestamp,
        log.eventType,
        log.userId ?? null,
        log.idpName ?? null,
        log.ipAddress ?? null,
        log.userAgent ?? null,
        log.details ? JSON.stringify(log.details) : null,
        log.status,
        log.errorMessage ?? null,
      ]
    );
  }

  async findByUserId(userId: string, limit = 50): Promise<AuditLog[]> {
    const result = await this.db.query(
      `SELECT * FROM audit_logs
       WHERE user_id = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [userId, limit]
    );
    return (result.rows as AuditLogRow[]).map((row) => this.mapRow(row));
  }

  async findByEventType(eventType: string, limit = 50): Promise<AuditLog[]> {
    const result = await this.db.query(
      `SELECT * FROM audit_logs
       WHERE event_type = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [eventType, limit]
    );
    return (result.rows as AuditLogRow[]).map((row) => this.mapRow(row));
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<AuditLog[]> {
    const result = await this.db.query(
      `SELECT * FROM audit_logs
       WHERE timestamp >= $1 AND timestamp <= $2
       ORDER BY timestamp ASC`,
      [startDate, endDate]
    );
    return (result.rows as AuditLogRow[]).map((row) => this.mapRow(row));
  }

  async deleteOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.db.query(
      `DELETE FROM audit_logs WHERE timestamp < $1`,
      [cutoff]
    );
    return result.rowCount ?? 0;
  }

  async countAuthentications(idpNames: string[], since?: Date): Promise<number> {
    if (idpNames.length === 0) {
      return 0;
    }
    const params: unknown[] = [idpNames];
    let sql = `SELECT COUNT(*)::int AS n FROM audit_logs
               WHERE event_type = 'LOGIN_SUCCESS' AND idp_name = ANY($1)`;
    if (since) {
      params.push(since);
      sql += ` AND timestamp >= $2`;
    }
    const result = await this.db.query(sql, params);
    const row = result.rows[0] as { n: number } | undefined;
    return row?.n ?? 0;
  }

  private mapRow(row: AuditLogRow): AuditLog {
    return {
      id: row.id,
      timestamp:
        row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp),
      eventType: row.event_type as AuditLog['eventType'],
      userId: row.user_id ?? undefined,
      idpName: row.idp_name ?? undefined,
      ipAddress: row.ip_address ?? undefined,
      userAgent: row.user_agent ?? undefined,
      details: this.parseDetails(row.details),
      status: row.status as AuditLog['status'],
      errorMessage: row.error_message ?? undefined,
    };
  }

  private parseDetails(value: unknown): Record<string, unknown> | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as Record<string, unknown>;
      } catch {
        return undefined;
      }
    }
    return value as Record<string, unknown>;
  }
}
