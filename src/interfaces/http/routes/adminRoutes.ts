// Rutas del panel de administración — /admin/*
//
// Todas las rutas exigen la clave maestra de administración en la cabecera
// `x-admin-key`, comparada de forma resistente a temporización. Si
// ADMIN_API_KEY no está configurada, el panel se deshabilita (503) para no
// exponer gestión sin protección.

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'crypto';
import { AdminController } from '../controllers/AdminController';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export async function adminRoutes(
  fastify: FastifyInstance,
  adminController: AdminController
) {
  // Login/logout de la consola. El login es público (valida la key en el body);
  // el resto de rutas exige sesión de admin o la cabecera x-admin-key.
  fastify.post('/login', (req, reply) => adminController.login(req, reply));
  fastify.post('/logout', (req, reply) => adminController.logout(req, reply));

  // Guard de administración: acepta sesión de admin (cookie) o ADMIN_API_KEY
  // en la cabecera x-admin-key, comparada de forma resistente a temporización.
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Las rutas de login/logout no pasan por el guard.
    if (request.url.endsWith('/login') || request.url.endsWith('/logout')) {
      return;
    }
    if (request.session?.isAdmin) {
      return;
    }
    const configured = process.env.ADMIN_API_KEY;
    if (!configured) {
      return reply.status(503).send({
        error: 'Admin disabled',
        message: 'ADMIN_API_KEY is not configured',
      });
    }
    const provided = request.headers['x-admin-key'];
    if (typeof provided !== 'string' || !safeEqual(provided, configured)) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Valid admin session or x-admin-key header is required',
      });
    }
  });

  fastify.post('/tenants', (req, reply) => adminController.createTenant(req, reply));
  fastify.get('/tenants', (req, reply) => adminController.listTenants(req, reply));
  fastify.get('/tenants/:id', (req, reply) => adminController.getTenant(req, reply));
  fastify.patch('/tenants/:id', (req, reply) => adminController.setTenantEnabled(req, reply));
  fastify.delete('/tenants/:id', (req, reply) => adminController.deleteTenant(req, reply));

  fastify.post('/tenants/:id/idps', (req, reply) => adminController.registerIdP(req, reply));
  fastify.get('/tenants/:id/idps', (req, reply) => adminController.listIdPs(req, reply));
  fastify.get('/tenants/:id/usage', (req, reply) => adminController.getUsage(req, reply));
  fastify.post('/tenants/:id/billing', (req, reply) => adminController.attachBilling(req, reply));
}
