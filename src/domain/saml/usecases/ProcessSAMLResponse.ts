// Caso de Uso: Procesar SAML Response

import { randomUUID } from 'crypto';
import {
  InvalidSAMLResponseException,
} from '../exceptions/SAMLExceptions';
import { ISAMLConfigRepository, ISessionRepository, IAuditLogRepository } from '../repositories/SAMLRepositories';
import { ISAMLValidator } from '../ports/ISAMLValidator';
import { SAMLAttributes } from '@shared/types/saml.types';

export class ProcessSAMLResponse {
  constructor(
    private samlConfigRepository: ISAMLConfigRepository,
    private sessionRepository: ISessionRepository,
    private auditLogRepository: IAuditLogRepository,
    private samlValidator: ISAMLValidator
  ) {}

  async execute(
    encodedSAMLResponse: string,
    idpName: string,
    ipAddress: string,
    userAgent: string,
    expectedRequestId?: string
  ): Promise<{
    sessionId: string;
    userId: string;
    attributes: SAMLAttributes;
  }> {
    try {
      // Obtener config del IdP
      const idpConfig = await this.samlConfigRepository.getByIdP(idpName);
      if (!idpConfig) {
        throw new InvalidSAMLResponseException(`Unknown IdP: ${idpName}`);
      }

      // Validar la respuesta SAML con el validador real (firma, issuer,
      // audiencia y temporalidad se verifican en la infraestructura samlify).
      const validation = await this.samlValidator.validateResponse(
        encodedSAMLResponse,
        '',
        idpName,
        expectedRequestId
      );

      if (!validation.isValid || !validation.attributes) {
        throw new InvalidSAMLResponseException(
          validation.errors.length > 0
            ? validation.errors.join('; ')
            : 'SAML Response validation failed'
        );
      }

      const attributes = validation.attributes;
      if (!validation.assertionId || !validation.assertionExpiresAt ||
        !(await this.sessionRepository.reserveAssertion(idpName, validation.assertionId, validation.assertionExpiresAt))) {
        throw new InvalidSAMLResponseException('SAML assertion has already been used');
      }

      // Crear sesión
      const sessionId = this.generateSessionId();
      const userId = attributes.email; // O el nameID según tu lógica

      // Persistir sesión
      await this.sessionRepository.save({
        id: sessionId,
        userId,
        idpName,
        email: attributes.email,
        attributes,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastActivityAt: new Date(),
        ipAddress,
        userAgent,
      });

      // Auditoría
      await this.auditLogRepository.save({
        id: this.generateAuditId(),
        timestamp: new Date(),
        eventType: 'LOGIN_SUCCESS',
        userId,
        idpName,
        ipAddress,
        userAgent,
        status: 'SUCCESS',
        details: { sessionId },
      });

      return { sessionId, userId, attributes };
    } catch (error) {
      // Auditoría de error
      await this.auditLogRepository.save({
        id: this.generateAuditId(),
        timestamp: new Date(),
        eventType: 'LOGIN_FAILURE',
        idpName,
        ipAddress,
        userAgent,
        status: 'FAILURE',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  private generateSessionId(): string {
    return randomUUID();
  }

  private generateAuditId(): string {
    return randomUUID();
  }
}
