// Repositorio de sesiones SAML respaldado por Redis.
//
// Implementa el contrato de dominio `ISessionRepository`. Cada sesión se guarda
// como JSON bajo `saml:session:<id>` con TTL derivado de `expiresAt`, y se
// mantiene un índice por usuario (`saml:user-sessions:<userId>`) como conjunto
// de identificadores para resolver `findByUserId` / `deleteByUserId`.

import { ISessionRepository } from '@domain/saml/repositories/SAMLRepositories';
import { SessionData } from '@shared/types/saml.types';
import { RedisClientLike } from '../redis/RedisClient';

const SESSION_PREFIX = 'saml:session:';
const USER_INDEX_PREFIX = 'saml:user-sessions:';

export class RedisSessionRepository implements ISessionRepository {
  constructor(private readonly redis: RedisClientLike) {}

  async save(session: SessionData): Promise<void> {
    const ttl = this.ttlSeconds(session.expiresAt);
    await this.redis.set(this.sessionKey(session.id), JSON.stringify(session), {
      EX: ttl,
    });
    await this.redis.sAdd(this.userKey(session.userId), session.id);
    await this.redis.expire(this.userKey(session.userId), ttl);
  }

  async reserveAssertion(idpName: string, assertionId: string, expiresAt: Date): Promise<boolean> {
    const key = `saml:assertion:${idpName}:${assertionId}`;
    return (await this.redis.set(key, '1', { EX: this.ttlSeconds(expiresAt), NX: true })) === 'OK';
  }

  async findById(sessionId: string): Promise<SessionData | null> {
    const raw = await this.redis.get(this.sessionKey(sessionId));
    return raw ? this.deserialize(raw) : null;
  }

  async findByUserId(userId: string): Promise<SessionData[]> {
    const ids = await this.redis.sMembers(this.userKey(userId));
    const sessions: SessionData[] = [];
    for (const id of ids) {
      const raw = await this.redis.get(this.sessionKey(id));
      if (raw) {
        sessions.push(this.deserialize(raw));
      } else {
        // Sesión expirada: depurar el índice (self-healing).
        await this.redis.sRem(this.userKey(userId), id);
      }
    }
    return sessions;
  }

  async delete(sessionId: string): Promise<void> {
    const raw = await this.redis.get(this.sessionKey(sessionId));
    await this.redis.del(this.sessionKey(sessionId));
    if (raw) {
      const session = this.deserialize(raw);
      await this.redis.sRem(this.userKey(session.userId), sessionId);
    }
  }

  async deleteByUserId(userId: string): Promise<void> {
    const ids = await this.redis.sMembers(this.userKey(userId));
    for (const id of ids) {
      await this.redis.del(this.sessionKey(id));
    }
    await this.redis.del(this.userKey(userId));
  }

  async update(session: SessionData): Promise<void> {
    await this.save(session);
  }

  private sessionKey(id: string): string {
    return `${SESSION_PREFIX}${id}`;
  }

  private userKey(userId: string): string {
    return `${USER_INDEX_PREFIX}${userId}`;
  }

  private ttlSeconds(expiresAt: Date): number {
    const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    const seconds = Math.ceil((expiry.getTime() - Date.now()) / 1000);
    return seconds > 0 ? seconds : 1;
  }

  private deserialize(raw: string): SessionData {
    const parsed = JSON.parse(raw) as SessionData;
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      expiresAt: new Date(parsed.expiresAt),
      lastActivityAt: new Date(parsed.lastActivityAt),
    };
  }
}
