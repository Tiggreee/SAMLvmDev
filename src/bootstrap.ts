// Configuración Fastify

import Fastify, { FastifyInstance, FastifyError } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifySession from '@fastify/session';
import fastifyCookie from '@fastify/cookie';
import RedisStore from 'connect-redis';
import redis from 'redis';

export async function createFastifyServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
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

  // Cookies
  await fastify.register(fastifyCookie);

  // Session Management
  const redisUrl = `redis://${
    process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : ''
  }${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}/${process.env.REDIS_DB || '0'}`;

  const redisClient = redis.createClient({
    url: redisUrl,
  });

  await redisClient.connect();

  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'session:',
  });

  await fastify.register(fastifySession, {
    store: redisStore,
    secret: process.env.SESSION_SECRET || 'dev-secret-key',
    cookie: {
      maxAge: parseInt(process.env.SESSION_TTL || '86400') * 1000,
      secure: process.env.HTTPS_ONLY === 'true',
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
