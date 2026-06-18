// Rutas de Autenticación SAML

import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/AuthController';

export async function authRoutes(
  fastify: FastifyInstance,
  authController: AuthController
) {
  /**
   * Endpoint para iniciar login SSO
   * GET /auth/saml/login?idp=azure-ad
   */
  fastify.get('/auth/saml/login', async (request, reply) => {
    return authController.initiateLogin(request, reply);
  });

  /**
   * Assertion Consumer Service - POST de vuelta del IdP
   * POST /auth/saml/acs
   */
  fastify.post('/auth/saml/acs', async (request, reply) => {
    return authController.assertionConsumerService(request, reply);
  });

  /**
   * Metadata del Service Provider (descargable)
   * GET /auth/saml/metadata
   */
  fastify.get('/auth/saml/metadata', async (request, reply) => {
    return authController.getMetadata(request, reply);
  });

  /**
   * Logout (destruye sesión)
   * POST /auth/saml/logout
   */
  fastify.post('/auth/saml/logout', async (request, reply) => {
    return authController.logout(request, reply);
  });

  /**
   * Obtener opciones de login disponibles
   * GET /auth/saml/login-options
   */
  fastify.get('/auth/saml/login-options', async (request, reply) => {
    return authController.getLoginOptions(request, reply);
  });

  /**
   * Estado del sistema SAML
   * GET /auth/saml/status
   */
  fastify.get('/auth/saml/status', async (request, reply) => {
    return authController.getStatus(request, reply);
  });
}
