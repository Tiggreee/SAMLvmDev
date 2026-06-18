// Servicio de Auditoría

import { IAuditLogRepository } from '@domain/saml/repositories/SAMLRepositories';
import { AuditLog } from '@shared/types/saml.types';

export class AuditService {
  constructor(private auditLogRepository: IAuditLogRepository) {}

  async logLoginAttempt(
    email: string,
    idpName: string,
    ipAddress: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    const log: AuditLog = {
      id: this.generateLogId(),
      timestamp: new Date(),
      eventType: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE',
      userId: email,
      idpName,
      ipAddress,
      status: success ? 'SUCCESS' : 'FAILURE',
      errorMessage,
    };

    await this.auditLogRepository.save(log);
  }

  async logLogout(
    userId: string,
    idpName: string,
    ipAddress: string
  ): Promise<void> {
    const log: AuditLog = {
      id: this.generateLogId(),
      timestamp: new Date(),
      eventType: 'LOGOUT',
      userId,
      idpName,
      ipAddress,
      status: 'SUCCESS',
    };

    await this.auditLogRepository.save(log);
  }

  async logCertificateRotation(
    idpName: string,
    newExpiryDate: Date
  ): Promise<void> {
    const log: AuditLog = {
      id: this.generateLogId(),
      timestamp: new Date(),
      eventType: 'CERT_ROTATED',
      idpName,
      status: 'SUCCESS',
      details: { newExpiryDate },
    };

    await this.auditLogRepository.save(log);
  }

  async getUserLoginHistory(
    userId: string,
    limit: number = 50
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.findByUserId(userId, limit);
  }

  async getFailedLoginAttempts(
    hoursBack: number = 24,
    limit: number = 100
  ): Promise<AuditLog[]> {
    const startDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const endDate = new Date();
    const logs = await this.auditLogRepository.findByDateRange(startDate, endDate);
    return logs.slice(-limit);
  }

  async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    return this.auditLogRepository.deleteOlderThan(retentionDays);
  }

  private generateLogId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}
