// Controlador del panel de administración.
//
// Gestiona el ciclo de vida de los tenants y sus IdP. Protegido por la clave
// maestra de administración (ADMIN_API_KEY) mediante el hook en adminRoutes.

import { FastifyRequest, FastifyReply } from 'fastify';
import { TenantService } from '@application/services/TenantService';
import { IdPConfig } from '@shared/types/saml.types';

interface CreateTenantBody {
  name: string;
}

interface SetEnabledBody {
  enabled: boolean;
}

type RegisterIdPBody = Omit<IdPConfig, 'tenantId'>;

export class AdminController {
  constructor(private tenantService: TenantService) {}

  async createTenant(request: FastifyRequest, reply: FastifyReply) {
    const { name } = (request.body as CreateTenantBody) || {};
    try {
      const created = await this.tenantService.createTenant(name);
      // La apiKey se devuelve una sola vez; el cliente debe almacenarla.
      return reply.status(201).send(created);
    } catch (error) {
      return reply.status(400).send({
        error: 'Tenant creation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async listTenants(_request: FastifyRequest, reply: FastifyReply) {
    const tenants = await this.tenantService.listTenants();
    return reply.status(200).send({ tenants });
  }

  async getTenant(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const tenant = await this.tenantService.getTenant(id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Not found', message: `Tenant ${id} not found` });
    }
    return reply.status(200).send(tenant);
  }

  async setTenantEnabled(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { enabled } = (request.body as SetEnabledBody) || {};
    if (typeof enabled !== 'boolean') {
      return reply.status(400).send({ error: 'Bad request', message: 'enabled (boolean) is required' });
    }
    const tenant = await this.tenantService.setEnabled(id, enabled);
    if (!tenant) {
      return reply.status(404).send({ error: 'Not found', message: `Tenant ${id} not found` });
    }
    return reply.status(200).send(tenant);
  }

  async deleteTenant(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const deleted = await this.tenantService.deleteTenant(id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Not found', message: `Tenant ${id} not found` });
    }
    return reply.status(204).send();
  }

  async registerIdP(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as RegisterIdPBody;
    if (!body?.id || !body?.entityID || !body?.singleSignOnServiceUrl) {
      return reply.status(400).send({
        error: 'Bad request',
        message: 'IdP requires id, entityID and singleSignOnServiceUrl',
      });
    }
    const registered = await this.tenantService.registerIdP(id, body);
    if (!registered) {
      return reply.status(404).send({ error: 'Not found', message: `Tenant ${id} not found` });
    }
    return reply.status(201).send(registered);
  }

  async listIdPs(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const tenant = await this.tenantService.getTenant(id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Not found', message: `Tenant ${id} not found` });
    }
    const idps = await this.tenantService.listIdPs(id);
    return reply.status(200).send({ idps });
  }

  async getUsage(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { days } = request.query as { days?: string };
    const periodDays = days ? Math.max(1, Math.min(365, parseInt(days, 10) || 30)) : 30;
    const usage = await this.tenantService.getUsage(id, periodDays);
    if (!usage) {
      return reply.status(404).send({ error: 'Not found', message: `Tenant ${id} not found` });
    }
    return reply.status(200).send(usage);
  }
}
