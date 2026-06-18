import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import { PostgresAuditLogRepository } from '../../src/infrastructure/persistence/repositories/PostgresAuditLogRepository';
import type { PgQueryable } from '../../src/infrastructure/persistence/database/PostgresPool';
import type { AuditLog } from '../../src/shared/types/saml.types';

// Verifica que el SQL del repositorio de auditoría se comporta como se espera
// contra un Postgres en memoria (pg-mem), sin depender de Docker. El mismo
// código corre contra el Postgres real en docker-compose/CI.
function makeDb(): PgQueryable {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as PgQueryable;
}

function baseLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date('2026-06-18T10:00:00.000Z'),
    eventType: 'LOGIN_SUCCESS',
    userId: 'alice@example.com',
    idpName: 'mock-idp',
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
    status: 'SUCCESS',
    ...overrides,
  };
}

describe('PostgresAuditLogRepository (pg-mem)', () => {
  let repo: PostgresAuditLogRepository;

  beforeEach(async () => {
    repo = new PostgresAuditLogRepository(makeDb());
    await repo.initialize();
  });

  it('persiste y recupera un log por userId', async () => {
    await repo.save(baseLog({ id: 'a1' }));

    const found = await repo.findByUserId('alice@example.com');

    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('a1');
    expect(found[0].eventType).toBe('LOGIN_SUCCESS');
    expect(found[0].timestamp).toBeInstanceOf(Date);
  });

  it('round-trip de details (JSONB) como objeto', async () => {
    await repo.save(
      baseLog({ id: 'a2', eventType: 'CERT_ROTATED', details: { sessionId: 'sess-1', n: 3 } })
    );

    const found = await repo.findByEventType('CERT_ROTATED');

    expect(found).toHaveLength(1);
    expect(found[0].details).toEqual({ sessionId: 'sess-1', n: 3 });
  });

  it('devuelve los más recientes primero y respeta el límite', async () => {
    await repo.save(baseLog({ id: 'old', timestamp: new Date('2026-06-18T09:00:00.000Z') }));
    await repo.save(baseLog({ id: 'new', timestamp: new Date('2026-06-18T11:00:00.000Z') }));

    const found = await repo.findByUserId('alice@example.com', 1);

    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('new');
  });

  it('filtra por rango de fechas (inclusivo)', async () => {
    await repo.save(baseLog({ id: 'before', timestamp: new Date('2026-06-18T08:00:00.000Z') }));
    await repo.save(baseLog({ id: 'inside', timestamp: new Date('2026-06-18T10:00:00.000Z') }));
    await repo.save(baseLog({ id: 'after', timestamp: new Date('2026-06-18T12:00:00.000Z') }));

    const found = await repo.findByDateRange(
      new Date('2026-06-18T09:00:00.000Z'),
      new Date('2026-06-18T11:00:00.000Z')
    );

    expect(found.map((l) => l.id)).toEqual(['inside']);
  });

  it('elimina logs más antiguos que la retención y devuelve el conteo', async () => {
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    await repo.save(baseLog({ id: 'old', timestamp: old }));
    await repo.save(baseLog({ id: 'recent', timestamp: recent }));

    const deleted = await repo.deleteOlderThan(90);

    expect(deleted).toBe(1);
    const remaining = await repo.findByUserId('alice@example.com');
    expect(remaining.map((l) => l.id)).toEqual(['recent']);
  });

  it('persiste un fallo con errorMessage y sin userId', async () => {
    await repo.save(
      baseLog({
        id: 'f1',
        eventType: 'LOGIN_FAILURE',
        status: 'FAILURE',
        userId: undefined,
        errorMessage: 'invalid signature',
      })
    );

    const found = await repo.findByEventType('LOGIN_FAILURE');

    expect(found).toHaveLength(1);
    expect(found[0].status).toBe('FAILURE');
    expect(found[0].errorMessage).toBe('invalid signature');
    expect(found[0].userId).toBeUndefined();
  });
});
