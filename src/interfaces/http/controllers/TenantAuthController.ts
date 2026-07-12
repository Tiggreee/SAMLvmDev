// Controlador SSO multi-tenant — rutas bajo /saml/t/:slug/*.
//
// Aísla el flujo SAML por organización: el login solo permite IdP del tenant y
// el ACS resuelve la respuesta únicamente contra los IdP de ese tenant.

import { FastifyRequest, FastifyReply } from 'fastify';
import { TenantService } from '@application/services/TenantService';
import { SSOAuthenticationService } from '@application/services/SSOAuthenticationService';
import { AuditService } from '@application/services/AuditService';
import { tenantAuthentications } from '@infrastructure/observability/Metrics';

export class TenantAuthController {
  constructor(
    private tenantService: TenantService,
    private ssoAuthService: SSOAuthenticationService,
    private auditService: AuditService
  ) {}

  async initiateLogin(request: FastifyRequest, reply: FastifyReply) {
    const { slug } = request.params as { slug: string };
    const { idp } = request.query as { idp?: string };

    const tenant = await this.resolveEnabledTenant(slug, reply);
    if (!tenant) {
      return reply;
    }
    if (!idp) {
      return reply.status(400).send({ error: 'Missing IdP parameter', message: 'Query parameter "idp" is required' });
    }

    // El IdP solicitado debe pertenecer al tenant.
    const tenantIdps = await this.tenantService.listIdPs(tenant.id);
    if (!tenantIdps.some((c) => c.id === idp)) {
      return reply.status(404).send({ error: 'IdP not found', message: `IdP ${idp} is not registered for tenant ${slug}` });
    }

    try {
      const result = await this.ssoAuthService.initiateLogin(idp);
      request.session.relayState = result.relayState;
      request.session.idp = idp;
      request.session.tenantId = tenant.id;
      return reply.status(302).redirect(result.redirectUrl);
    } catch (error) {
      return reply.status(400).send({
        error: 'Login initiation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async assertionConsumerService(request: FastifyRequest, reply: FastifyReply) {
    const { slug } = request.params as { slug: string };
    const { SAMLResponse, RelayState } = (request.body as { SAMLResponse?: string; RelayState?: string }) || {};

    const tenant = await this.resolveEnabledTenant(slug, reply);
    if (!tenant) {
      return reply;
    }
    if (!SAMLResponse) {
      return reply.status(400).send({ error: 'Missing SAML Response', message: 'SAMLResponse field is required' });
    }

    // Resolución aislada: solo entre los IdP del tenant.
    const tenantIdps = await this.tenantService.listIdPs(tenant.id);
    const allowedIds = tenantIdps.map((c) => c.id);
    const idp =
      (request.session?.idp && allowedIds.includes(request.session.idp)
        ? request.session.idp
        : null) || this.ssoAuthService.resolveIdPByIssuerScoped(SAMLResponse, allowedIds);

    if (!idp) {
      return reply.status(400).send({
        error: 'Unresolved IdP',
        message: `No matching IdP for tenant ${slug}`,
      });
    }

    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'] || 'Unknown';

    try {
      const result = await this.ssoAuthService.processSAMLResponseAndCreateSession(
        SAMLResponse,
        idp,
        ipAddress,
        userAgent
      );
      request.session.userId = result.userId;
      request.session.email = result.email;
      request.session.samlSessionId = result.sessionId;
      request.session.idp = idp;
      request.session.tenantId = tenant.id;
      request.session.authenticated = true;

      await this.auditService.logLoginAttempt(result.email, idp, ipAddress, true);
      tenantAuthentications.labels(tenant.slug, 'success').inc();

      const redirectUrl = RelayState
        ? Buffer.from(RelayState, 'base64').toString('utf-8')
        : '/dashboard';
      return reply.status(302).redirect(redirectUrl);
    } catch (error) {
      await this.auditService.logLoginAttempt(
        'unknown',
        idp,
        ipAddress,
        false,
        error instanceof Error ? error.message : 'Unknown error'
      );
      tenantAuthentications.labels(tenant.slug, 'failure').inc();
      return reply.status(400).send({
        error: 'SAML validation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async resolveEnabledTenant(slug: string, reply: FastifyReply) {
    const tenant = await this.tenantService.getTenantBySlug(slug);
    if (!tenant) {
      reply.status(404).send({ error: 'Tenant not found', message: `Unknown tenant: ${slug}` });
      return null;
    }
    if (!tenant.enabled) {
      reply.status(403).send({ error: 'Tenant disabled', message: `Tenant ${slug} is disabled` });
      return null;
    }
    return tenant;
  }
}
