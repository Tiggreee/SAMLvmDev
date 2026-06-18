// Caso de Uso: Procesar SAML Response

import {
  InvalidSAMLResponseException,
  InvalidSignatureException,
  InvalidAudienceException,
  AssertionExpiredException,
} from '../exceptions/SAMLExceptions';
import { ISAMLConfigRepository, ISessionRepository, IAuditLogRepository } from '../repositories/SAMLRepositories';
import { SAMLAttributes } from '@shared/types/saml.types';

export class ProcessSAMLResponse {
  constructor(
    private samlConfigRepository: ISAMLConfigRepository,
    private sessionRepository: ISessionRepository,
    private auditLogRepository: IAuditLogRepository
  ) {}

  async execute(
    encodedSAMLResponse: string,
    idpName: string,
    ipAddress: string,
    userAgent: string
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

      // Decodificar y validar SAML Response
      const samlResponse = this.decodeSAMLResponse(encodedSAMLResponse);
      
      // Validar firma
      this.validateSignature(samlResponse);
      
      // Validar audiencia
      this.validateAudience(samlResponse);
      
      // Validar temporalidad
      this.validateTimestamps(samlResponse);

      // Extraer atributos
      const attributes = this.extractAttributes(samlResponse);

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

  private decodeSAMLResponse(encoded: string): any {
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
      return decoded; // En la implementación real, parsear XML
    } catch (error) {
      throw new InvalidSAMLResponseException('Failed to decode SAML Response');
    }
  }

  private validateSignature(response: any): void {
    // Implementación con el adaptador SAML
    if (!response.signature) {
      throw new InvalidSignatureException('SAML Response is not signed');
    }
  }

  private validateAudience(response: any): void {
    // Validar que la audiencia sea nuestra entidad
    const expectedAudience = process.env.SAML_SP_ENTITY_ID;
    if (response.audience !== expectedAudience) {
      throw new InvalidAudienceException(`Invalid audience: ${response.audience}`);
    }
  }

  private validateTimestamps(response: any): void {
    const clockSkew = 60; // segundos
    const now = Date.now();
    const notBefore = response.notBefore.getTime();
    const notOnOrAfter = response.notOnOrAfter.getTime();

    if (now < notBefore - clockSkew * 1000) {
      throw new InvalidSAMLResponseException('Assertion is not yet valid');
    }

    if (now > notOnOrAfter + clockSkew * 1000) {
      throw new AssertionExpiredException('Assertion has expired');
    }
  }

  private extractAttributes(response: any): SAMLAttributes {
    return {
      email: response.email,
      nameID: response.nameID,
      givenName: response.givenName,
      surname: response.surname,
      groups: response.groups || [],
      roles: response.roles || [],
    };
  }

  private generateSessionId(): string {
    return Buffer.from(Math.random().toString()).toString('hex');
  }

  private generateAuditId(): string {
    return `${Date.now()}-${Math.random()}`;
  }
}
