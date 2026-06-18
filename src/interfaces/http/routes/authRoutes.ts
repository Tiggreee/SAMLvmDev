// Rutas de Autenticación SAML

import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/AuthController';

export async function authRoutes(
  fastify: FastifyInstance,
  authController: AuthController
) {
  // Contrato canónico: /saml/*
  // Alias de compatibilidad: /auth/saml/* (deprecado, conservado para no romper integraciones existentes)
  const canonical = '/saml';
  const legacy = '/auth/saml';

  const register = (
    method: 'get' | 'post',
    path: string,
    handler: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<unknown>
  ) => {
    fastify[method](`${canonical}${path}`, handler);
    fastify[method](`${legacy}${path}`, handler);
  };

  // Iniciar login SSO — /saml/login?idp=azure-ad
  register('get', '/login', (request, reply) =>
    authController.initiateLogin(request, reply)
  );

  // Assertion Consumer Service — /saml/acs
  register('post', '/acs', (request, reply) =>
    authController.assertionConsumerService(request, reply)
  );

  // Metadata del Service Provider — /saml/metadata
  register('get', '/metadata', (request, reply) =>
    authController.getMetadata(request, reply)
  );

  // Single Logout — /saml/slo
  register('post', '/slo', (request, reply) =>
    authController.logout(request, reply)
  );

  // Opciones de login disponibles — /saml/login-options
  register('get', '/login-options', (request, reply) =>
    authController.getLoginOptions(request, reply)
  );

  // Estado del sistema SAML — /saml/status
  register('get', '/status', (request, reply) =>
    authController.getStatus(request, reply)
  );
}
