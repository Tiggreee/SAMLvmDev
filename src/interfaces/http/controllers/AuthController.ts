// Controlador de Autenticación SAML - Endpoints HTTP

import { FastifyRequest, FastifyReply } from 'fastify';
import { SSOAuthenticationService } from '@application/services/SSOAuthenticationService';
import { SAMLMetadataService } from '@application/services/SAMLMetadataService';
import { AuditService } from '@application/services/AuditService';
import { samlValidationTotal, activeSessions } from '@infrastructure/observability/Metrics';
import { getRelayStateRedirect } from './RelayStateRedirect';

export class AuthController {
  constructor(
    private ssoAuthService: SSOAuthenticationService,
    private metadataService: SAMLMetadataService,
    private auditService: AuditService
  ) {}

  /**
   * GET /auth/saml/login
   * Inicia el flujo SSO redirigiendo al IdP
   */
  async initiateLogin(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { idp } = request.query as { idp: string };
      
      if (!idp) {
        return reply.status(400).send({
          error: 'Missing IdP parameter',
          message: 'Query parameter "idp" is required',
        });
      }

      const result = await this.ssoAuthService.initiateLogin(idp);

      // Guardar RelayState en sesión para verificación posterior
      request.session.relayState = result.relayState;
      request.session.samlRequestId = result.requestId;
      request.session.idp = idp;

      return reply.status(302).redirect(result.redirectUrl);
    } catch (error) {
      return reply.status(400).send({
        error: 'Login initiation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * POST /auth/saml/acs
   * Assertion Consumer Service - Procesa la respuesta SAML del IdP
   */
  async assertionConsumerService(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { SAMLResponse, RelayState } = request.body as {
        SAMLResponse: string;
        RelayState?: string;
      };

      if (!SAMLResponse) {
        return reply.status(400).send({
          error: 'Missing SAML Response',
          message: 'SAMLResponse field is required',
        });
      }

      // Determinar el IdP: parámetro explícito o sesión (flujo SP-initiated) y,
      // como respaldo, descubrirlo por el Issuer de la propia respuesta (flujo
      // IdP-initiated / ACS multi-tenant: el IdP da clic en su panel y postea
      // aquí sin `idp` ni sesión previa).
      const idp =
        (request.query as { idp?: string })?.idp ||
        request.session?.idp ||
        this.ssoAuthService.resolveIdPByIssuer(SAMLResponse);
      if (!idp) {
        return reply.status(400).send({
          error: 'Missing IdP information',
          message: 'Cannot determine which IdP to use for validation',
        });
      }

      const redirectUrl = getRelayStateRedirect(RelayState, request.session?.relayState);
      if (redirectUrl === null) {
        return reply.status(400).send({ error: 'Invalid RelayState' });
      }

      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'] || 'Unknown';

      // Procesar SAML Response
      const result = await this.ssoAuthService.processSAMLResponseAndCreateSession(
        SAMLResponse,
        idp,
        ipAddress,
        userAgent,
        request.session?.samlRequestId
      );

      // Crear sesión segura
      request.session.userId = result.userId;
      request.session.email = result.email;
      request.session.samlSessionId = result.sessionId;
      request.session.idp = idp;
      request.session.authenticated = true;
      request.session.relayState = undefined;
      request.session.samlRequestId = undefined;

      // Log de auditoría
      await this.auditService.logLoginAttempt(
        result.email,
        idp,
        ipAddress,
        true
      );

      samlValidationTotal.labels(idp, 'success').inc();
      activeSessions.inc();

      return reply.status(302).redirect(redirectUrl);
    } catch (error) {
      const ipAddress = request.ip;
      const idp = request.session?.idp || 'unknown';

      // Log de error
      await this.auditService.logLoginAttempt(
        'unknown',
        idp,
        ipAddress,
        false,
        error instanceof Error ? error.message : 'Unknown error'
      );

      samlValidationTotal.labels(idp, 'failure').inc();

      return reply.status(400).send({
        error: 'SAML validation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * GET /auth/saml/metadata
   * Retorna el metadata XML del Service Provider
   * Los clientes usan esto para configurar el IdP
   */
  async getMetadata(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const metadata = await this.metadataService.getServiceProviderMetadata();

      reply.header('Content-Type', 'application/samlmetadata+xml');
      reply.header('Content-Disposition', 'attachment; filename="sp-metadata.xml"');

      return reply.send(metadata);
    } catch (error) {
      return reply.status(500).send({
        error: 'Metadata generation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * POST /auth/saml/logout (Opcional)
   * Cierra la sesión en el SP y opcionalmente en el IdP
   */
  async logout(request: FastifyRequest, reply: FastifyReply) {
    try {
      const sessionId = request.session?.samlSessionId;
      const userId = request.session?.userId;
      const idp = request.session?.idp || 'unknown';

      if (!sessionId || !userId) {
        return reply.status(401).send({
          error: 'Not authenticated',
          message: 'No active session found',
        });
      }

      const ipAddress = request.ip;

      // Cerrar sesión
      await this.ssoAuthService.logout(sessionId, userId, ipAddress);

      // Log de auditoría
      await this.auditService.logLogout(userId, idp, ipAddress);

      // Destruir sesión
      await request.session.destroy();

      activeSessions.dec();

      return reply.status(200).send({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      return reply.status(500).send({
        error: 'Logout failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * GET /auth/saml/login-options
   * Retorna lista de IdP disponibles
   */
  async getLoginOptions(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const idps = this.ssoAuthService.getAvailableIdPs();

      return reply.status(200).send({
        idps,
        loginUrl: '/auth/saml/login',
      });
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to retrieve login options',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * GET /auth/saml/status
   * Health check del sistema SAML
   */
  async getStatus(request: FastifyRequest, reply: FastifyReply) {
    try {
      const isAuthenticated = request.session?.authenticated ?? false;
      const idp = request.session?.idp;

      return reply.status(200).send({
        status: 'ok',
        authenticated: isAuthenticated,
        idp,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return reply.status(500).send({
        error: 'Status check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
