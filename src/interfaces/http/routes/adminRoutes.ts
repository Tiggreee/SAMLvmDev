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
  // Guard de administración: valida ADMIN_API_KEY en cada petición /admin/*.
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
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
        message: 'Valid x-admin-key header is required',
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
}
