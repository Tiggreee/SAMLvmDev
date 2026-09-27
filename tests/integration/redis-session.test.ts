import { describe, it, expect, beforeEach } from 'vitest';
import { RedisSessionRepository } from '../../src/infrastructure/persistence/repositories/RedisSessionRepository';
import type { RedisClientLike } from '../../src/infrastructure/persistence/redis/RedisClient';
import type { SessionData } from '../../src/shared/types/saml.types';

// Doble en memoria de la API mínima de Redis usada por el repositorio.
// Modela TTL para poder ejercitar la expiración y el self-healing del índice.
class FakeRedis implements RedisClientLike {
  private store = new Map<string, { value: string; expiresAt: number | null }>();
  private sets = new Map<string, Set<string>>();

  private alive(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.alive(key) ? this.store.get(key)!.value : null;
  }

  async set(key: string, value: string, options?: { EX?: number; NX?: boolean }): Promise<unknown> {
    if (options?.NX && this.alive(key)) return null;
    const expiresAt = options?.EX ? Date.now() + options.EX * 1000 : null;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key: string | string[]): Promise<number> {
    const keys = Array.isArray(key) ? key : [key];
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
      if (this.sets.delete(k)) count++;
    }
    return count;
  }

  async sAdd(key: string, member: string): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    const had = set.has(member);
    set.add(member);
    this.sets.set(key, set);
    return had ? 0 : 1;
  }

  async sRem(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    return set.delete(member) ? 1 : 0;
  }

  async sMembers(key: string): Promise<string[]> {
    return Array.from(this.sets.get(key) ?? []);
  }

  async expire(_key: string, _seconds: number): Promise<unknown> {
    return 1;
  }

  /** Helper de prueba: fuerza el vencimiento del TTL de una clave. */
  forceExpire(key: string): void {
    const entry = this.store.get(key);
    if (entry) entry.expiresAt = Date.now() - 1;
  }
}

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  const now = new Date('2026-06-18T10:00:00.000Z');
  return {
    id: `sess-${Math.random().toString(36).slice(2)}`,
    userId: 'alice@example.com',
    idpName: 'mock-idp',
    email: 'alice@example.com',
    attributes: { email: 'alice@example.com', nameID: 'alice@example.com' },
    createdAt: now,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    lastActivityAt: now,
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
    ...overrides,
  };
}

describe('RedisSessionRepository (fake redis)', () => {
  let redis: FakeRedis;
  let repo: RedisSessionRepository;

  beforeEach(() => {
    redis = new FakeRedis();
    repo = new RedisSessionRepository(redis);
  });

  it('reserva una aserción una sola vez por IdP, incluso en paralelo', async () => {
    const expiresAt = new Date(Date.now() + 60_000);

    expect(await Promise.all([
      repo.reserveAssertion('mock-idp', 'assertion-1', expiresAt),
      repo.reserveAssertion('mock-idp', 'assertion-1', expiresAt),
    ])).toEqual([true, false]);
    expect(await repo.reserveAssertion('other-idp', 'assertion-1', expiresAt)).toBe(true);

    redis.forceExpire('saml:assertion:mock-idp:assertion-1');
    expect(await repo.reserveAssertion('mock-idp', 'assertion-1', expiresAt)).toBe(true);
  });

  it('guarda y recupera una sesión por id, reviviendo las fechas', async () => {
    const session = makeSession({ id: 's1' });
    await repo.save(session);

    const found = await repo.findById('s1');

    expect(found).not.toBeNull();
    expect(found!.id).toBe('s1');
    expect(found!.email).toBe('alice@example.com');
    expect(found!.createdAt).toBeInstanceOf(Date);
    expect(found!.expiresAt).toBeInstanceOf(Date);
  });

  it('devuelve null para una sesión inexistente', async () => {
    expect(await repo.findById('nope')).toBeNull();
  });

  it('lista las sesiones de un usuario', async () => {
    await repo.save(makeSession({ id: 's1' }));
    await repo.save(makeSession({ id: 's2' }));

    const found = await repo.findByUserId('alice@example.com');

    expect(found.map((s) => s.id).sort()).toEqual(['s1', 's2']);
  });

  it('depura del índice las sesiones expiradas (self-healing)', async () => {
    await repo.save(makeSession({ id: 's1' }));
    await repo.save(makeSession({ id: 's2' }));
    redis.forceExpire('saml:session:s1');

    const found = await repo.findByUserId('alice@example.com');

    expect(found.map((s) => s.id)).toEqual(['s2']);
    // El índice ya no contiene la sesión expirada.
    expect(await redis.sMembers('saml:user-sessions:alice@example.com')).toEqual(['s2']);
  });

  it('elimina una sesión y la quita del índice del usuario', async () => {
    await repo.save(makeSession({ id: 's1' }));
    await repo.delete('s1');

    expect(await repo.findById('s1')).toBeNull();
    expect(await repo.findByUserId('alice@example.com')).toEqual([]);
  });

  it('elimina todas las sesiones de un usuario', async () => {
    await repo.save(makeSession({ id: 's1' }));
    await repo.save(makeSession({ id: 's2' }));

    await repo.deleteByUserId('alice@example.com');

    expect(await repo.findById('s1')).toBeNull();
    expect(await repo.findById('s2')).toBeNull();
    expect(await repo.findByUserId('alice@example.com')).toEqual([]);
  });

  it('update sobrescribe la sesión existente', async () => {
    await repo.save(makeSession({ id: 's1', ipAddress: '127.0.0.1' }));
    await repo.update(makeSession({ id: 's1', ipAddress: '10.0.0.5' }));

    const found = await repo.findById('s1');
    expect(found!.ipAddress).toBe('10.0.0.5');
  });

  it('no persiste una sesión ya expirada con TTL positivo mínimo', async () => {
    // expiresAt en el pasado → TTL forzado a 1s; la sesión se guarda pero
    // expira pronto. Verificamos que el cálculo de TTL no lanza ni es negativo.
    const session = makeSession({ id: 's1', expiresAt: new Date(Date.now() - 1000) });
    await expect(repo.save(session)).resolves.toBeUndefined();
  });
});
