// Factoría del pool de PostgreSQL.
//
// El repositorio depende de la interfaz mínima `PgQueryable` (solo `query`),
// lo que permite inyectar tanto un `pg.Pool` real como un pool en memoria
// (pg-mem) en pruebas, sin acoplar el dominio al driver.

import pg from 'pg';

export interface PgQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

export interface PostgresPool extends PgQueryable {
  end(): Promise<void>;
}

/**
 * Crea un pool de PostgreSQL a partir de `DATABASE_URL`. El tamaño máximo se
 * toma de `DATABASE_POOL_SIZE` (por defecto 10).
 */
export function createPostgresPool(connectionString: string): PostgresPool {
  const max = parseInt(process.env.DATABASE_POOL_SIZE || '10', 10);
  const pool = new pg.Pool({ connectionString, max });
  return pool as unknown as PostgresPool;
}

/**
 * Esquema mínimo requerido. Idempotente; se ejecuta al inicializar el
 * repositorio para que el arranque no dependa del init de Docker.
 */
export const AUDIT_LOGS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS audit_logs (
    id            TEXT        PRIMARY KEY,
    timestamp     TIMESTAMPTZ NOT NULL,
    event_type    TEXT        NOT NULL,
    user_id       TEXT,
    idp_name      TEXT,
    ip_address    TEXT,
    user_agent    TEXT,
    details       JSONB,
    status        TEXT        NOT NULL,
    error_message TEXT
  );
`;
