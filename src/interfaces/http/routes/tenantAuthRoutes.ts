// Rutas SSO multi-tenant — /saml/t/:slug/*
//
// Cada tenant tiene su propio espacio de nombres SAML. El aislamiento lo
// garantiza el controlador: login y ACS operan solo sobre los IdP del tenant.

import { FastifyInstance } from 'fastify';
import { TenantAuthController } from '../controllers/TenantAuthController';

export async function tenantAuthRoutes(
  fastify: FastifyInstance,
  controller: TenantAuthController
) {
  fastify.get('/t/:slug/login', (req, reply) => controller.initiateLogin(req, reply));
  fastify.post('/t/:slug/acs', (req, reply) => controller.assertionConsumerService(req, reply));
}
