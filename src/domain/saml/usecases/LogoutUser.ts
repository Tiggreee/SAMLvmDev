// Caso de Uso: Logout del usuario

import { ISessionRepository, IAuditLogRepository } from '../repositories/SAMLRepositories';
import { SessionException } from '../exceptions/SAMLExceptions';
import { SessionData } from '@shared/types/saml.types';

export class LogoutUser {
  constructor(
    private sessionRepository: ISessionRepository,
    private auditLogRepository: IAuditLogRepository
  ) {}

  async execute(
    sessionId: string,
    userId: string,
    ipAddress: string,
    sendToIdP: boolean = false
  ): Promise<{
    success: boolean;
    sloUrl?: string;
  }> {
    try {
      // Obtener sesión
      const session = await this.sessionRepository.findById(sessionId);
      if (!session) {
        throw new SessionException(`Session not found: ${sessionId}`);
      }

      // Eliminar sesión
      await this.sessionRepository.delete(sessionId);

      // Auditoría
      await this.auditLogRepository.save({
        id: this.generateAuditId(),
        timestamp: new Date(),
        eventType: 'LOGOUT',
        userId,
        idpName: session.idpName,
        ipAddress,
        status: 'SUCCESS',
      });

      // Si se requiere, generar SAML Logout Request
      let sloUrl: string | undefined;
      if (sendToIdP) {
        sloUrl = await this.generateSAMLLogoutRequest(session);
      }

      return {
        success: true,
        sloUrl,
      };
    } catch (error) {
      await this.auditLogRepository.save({
        id: this.generateAuditId(),
        timestamp: new Date(),
        eventType: 'LOGOUT',
        userId,
        ipAddress,
        status: 'FAILURE',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  private async generateSAMLLogoutRequest(session: SessionData): Promise<string> {
    // Implementación en el adaptador SAML
    // Por ahora, retornamos una URL placeholder
    return `${process.env.SAML_SP_SLO_URL || 'https://localhost:3000/auth/saml/logout'}?sessionIndex=${session.id}`;
  }

  private generateAuditId(): string {
    return `${Date.now()}-${Math.random()}`;
  }
}
