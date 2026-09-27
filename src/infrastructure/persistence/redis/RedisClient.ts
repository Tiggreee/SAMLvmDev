// Cliente Redis y puerto mínimo de acceso.
//
// El repositorio de sesiones depende de `RedisClientLike` (un subconjunto de la
// API de node-redis v4), lo que permite inyectar el cliente real o un doble en
// memoria en pruebas, sin acoplar el dominio al driver.

import { createClient } from 'redis';

export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number; NX?: boolean }): Promise<unknown>;
  del(key: string | string[]): Promise<number>;
  sAdd(key: string, member: string): Promise<number>;
  sRem(key: string, member: string): Promise<number>;
  sMembers(key: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<unknown>;
}

/**
 * Construye la URL de conexión a Redis desde variables de entorno, con el mismo
 * formato que usa el almacén de sesiones de Fastify.
 *
 * Si `REDIS_URL` está definido (proveedores gestionados como Upstash o Railway
 * entregan una URL completa `rediss://...` con TLS), se usa tal cual. En su
 * ausencia, se construye desde host/port/password; `REDIS_TLS=true` selecciona
 * el esquema `rediss://` para conexiones cifradas.
 */
export function buildRedisUrl(): string {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }
  const scheme = process.env.REDIS_TLS === 'true' ? 'rediss' : 'redis';
  const password = process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : '';
  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  const db = process.env.REDIS_DB || '0';
  return `${scheme}://${password}${host}:${port}/${db}`;
}

export interface ConnectedRedis {
  client: RedisClientLike;
  close(): Promise<void>;
}

/**
 * Crea y conecta un cliente Redis. Lanza si la conexión falla; el llamador
 * decide el comportamiento (obligatorio en producción, degradable en dev).
 */
export async function connectRedis(url: string): Promise<ConnectedRedis> {
  const client = createClient({ url });
  await client.connect();
  return {
    client: client as unknown as RedisClientLike,
    close: () => client.quit().then(() => undefined),
  };
}
