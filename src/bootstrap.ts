// Configuración Fastify

import Fastify, { FastifyInstance, FastifyError } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyFormbody from '@fastify/formbody';
import fastifySession from '@fastify/session';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import RedisStore from 'connect-redis';
import redis from 'redis';
import { registry, httpRequestDuration } from '@infrastructure/observability/Metrics';

export async function createFastifyServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    // Behind the Caddy reverse proxy: trust X-Forwarded-* so req.ip and
    // req.protocol reflect the real client (correct rate-limit keying and
    // audit logging) instead of the proxy's address.
    trustProxy: true,
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Security Headers
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 año
      includeSubDomains: true,
      preload: true,
    },
  });

  // CORS
  await fastify.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
    credentials: true,
  });

  // Cuerpo application/x-www-form-urlencoded: los IdP entregan la respuesta
  // SAML al ACS mediante un POST form-urlencoded (SAMLResponse, RelayState).
  // Sin este parser, el ACS rechazaría el POST real del IdP con 415.
  await fastify.register(fastifyFormbody);

  // Rate-limiting global — protects all endpoints including the public ACS.
  // ACS is the highest-risk surface (unauthenticated POST, SAML XML parsing).
  // Limit: 60 req/min globally; individual routes can override downward.
  await fastify.register(fastifyRateLimit, {
    global: true,
    max: 60,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
      error: 'TooManyRequests',
      message: `Rate limit exceeded. Retry after ${Math.ceil(context.ttl / 1000)} seconds.`,
      statusCode: 429,
    }),
  });

  // Cookies
  await fastify.register(fastifyCookie);

  // Session Management
  const redisUrl = `redis://${
    process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : ''
  }${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}/${process.env.REDIS_DB || '0'}`;

  const isProduction = process.env.NODE_ENV === 'production';
  let sessionStore: InstanceType<typeof RedisStore> | undefined;

  try {
    const redisClient = redis.createClient({ url: redisUrl });
    await redisClient.connect();
    sessionStore = new RedisStore({
      client: redisClient,
      prefix: 'session:',
    });
  } catch (error) {
    if (isProduction) {
      throw error;
    }
    fastify.log.warn(
      'Redis no disponible: usando almacén de sesión en memoria (solo desarrollo)'
    );
    sessionStore = undefined;
  }

  // El secreto de sesión debe tener al menos 32 caracteres (requisito de
  // @fastify/session). En producción es obligatorio definirlo; en desarrollo
  // se usa un placeholder con la longitud mínima.
  const sessionSecret = process.env.SESSION_SECRET;
  if (isProduction && (!sessionSecret || sessionSecret.length < 32)) {
    throw new Error(
      'SESSION_SECRET es obligatorio en producción y debe tener al menos 32 caracteres'
    );
  }

  await fastify.register(fastifySession, {
    ...(sessionStore ? { store: sessionStore } : {}),
    secret: sessionSecret || 'dev-session-secret-change-me-please-32',
    cookie: {
      maxAge: parseInt(process.env.SESSION_TTL || '86400') * 1000,
      secure: isProduction || process.env.HTTPS_ONLY === 'true',
      httpOnly: true,
      sameSite: process.env.SAMSITE_COOKIES === 'Strict' ? 'strict' : 'lax',
    },
  });

  // Global Error Handler
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    fastify.log.error({
      error,
      url: request.url,
      method: request.method,
      ip: request.ip,
    });

    const statusCode = error.statusCode || 500;
    const response: Record<string, unknown> = {
      error: error.name || 'InternalServerError',
      message: error.message,
      statusCode,
      timestamp: new Date().toISOString(),
    };

    if (process.env.NODE_ENV === 'development') {
      response['stack'] = error.stack;
    }

    reply.status(statusCode).send(response);
  });

  // Health Check
  fastify.get('/health', async (_request, _reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Métricas Prometheus. Excluido del rate-limit para no perder scrapes.
  fastify.get('/metrics', { config: { rateLimit: false } }, async (_request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  // Instrumentación de latencia HTTP por método/ruta/código.
  fastify.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions?.url || request.url;
    httpRequestDuration
      .labels(request.method, route, String(reply.statusCode))
      .observe(reply.elapsedTime / 1000);
  });

  // Landing mínima para flujos SSO exitosos cuando no llega RelayState.
  fastify.get('/dashboard', async (request, _reply) => {
    return {
      authenticated: Boolean(request.session?.authenticated),
      email: request.session?.email || null,
      idp: request.session?.idp || null,
      status: 'ok',
    };
  });

  // Ready Hook
  fastify.addHook('onReady', async () => {
    fastify.log.info('Server is ready');
  });

  return fastify;
}

export async function startServer(fastify: FastifyInstance): Promise<void> {
  const port = parseInt(process.env.PORT || '3000');
  const host = process.env.HOST || '0.0.0.0';
  const protocol = process.env.PROTOCOL || 'https';

  await fastify.listen({ port, host });
  fastify.log.info(`Server running at ${protocol}://${host}:${port}`);
}
