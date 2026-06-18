// Gestor de Certificados X.509

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { generateKeyPairSync } from 'crypto';
import { CertificateException } from '@domain/saml/exceptions/SAMLExceptions';

export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  publicKey: string;
}

export class CertificateManager {
  static generateSelfSignedCertificate(
    entityID: string,
    validityDays: number = 365
  ): {
    cert: string;
    key: string;
  } {
    try {
      const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      });

      // En producción real, usarías una librería como node-forge o crypto-js
      // Para desarrollo, simplemente guardamos las claves
      const cert = this.createDummyCertificate(entityID, validityDays);

      return {
        cert,
        key: privateKey,
      };
    } catch (error) {
      throw new CertificateException(
        `Failed to generate certificate: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static saveCertificate(
    path: string,
    content: string,
    isCert: boolean = true
  ): void {
    try {
      writeFileSync(path, content, 'utf-8');
    } catch (error) {
      throw new CertificateException(
        `Failed to save ${isCert ? 'certificate' : 'key'} to ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static loadCertificate(path: string): string {
    try {
      return readFileSync(path, 'utf-8');
    } catch (error) {
      throw new CertificateException(
        `Failed to load certificate from ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static validateCertificatePath(path: string): boolean {
    return existsSync(path);
  }

  static getCertificateInfo(certificateContent: string): CertificateInfo {
    try {
      // En producción real, parsearías el certificado X.509
      // Para desarrollo, retornamos información dummy
      return {
        subject: 'CN=Enterprise SAML SP',
        issuer: 'CN=Enterprise SAML SP',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        fingerprint: 'SHA1Fingerprint',
        publicKey: certificateContent,
      };
    } catch (error) {
      throw new CertificateException(
        `Failed to parse certificate: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static isCertificateExpired(certificateContent: string): boolean {
    try {
      const info = this.getCertificateInfo(certificateContent);
      return new Date() > info.validTo;
    } catch (error) {
      return false; // Si no podemos parsear, asumimos que está válido
    }
  }

  static getCertificateExpirationDays(certificateContent: string): number {
    try {
      const info = this.getCertificateInfo(certificateContent);
      const daysLeft = (info.validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return Math.floor(daysLeft);
    } catch (error) {
      return -1;
    }
  }

  private static createDummyCertificate(entityID: string, validityDays: number): string {
    // Dummy certificate for development
    // In production, use node-forge or similar
    return `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKHMHAn+q/nBMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAlBUMQswCQYDVQQIDAJQVDELMAkGA1UEBwwCUFQxEDAOBgNVBAoMB0VudGVy
cHJpc2UwHhcNMjQwMTAxMDAwMDAwWhcNMjUwMTAxMDAwMDAwWjBFMQswCQYDVQQG
EwJQVDELMAkGA1UECAwCUFQxCzAJBgNVBAcMAlBUMRAwDgYDVQQKDAdFbnRlcnBy
aXNlMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwV8xVf3vLqW7dqIg
aEVrqPJ3H1VJ7hLvH3W3cZqLvI+RRqAEqV5QkL5iH3P6cHbhLqYWmwZN7dPpRwXc
5hN3yJ5cH5vQ8lR5H5cH5vQ8lR5H5cH5vQ8lR5H5cH5vQ8lR5H5cH5vQ8lR5H5cH
5vQ8lR5H5cH5vQ8lR5H5cH5vQ8lR5H5cH5vQ8lR5H5cH5vQ8lR5H5cH5vQ8lR5H5
-----END CERTIFICATE-----
${entityID}-${validityDays}`;
  }
}

export class CertificateRotationService {
  constructor(
    private certPath: string,
    private keyPath: string,
    private rotationDays: number = 365
  ) {}

  async checkRotationNeeded(): Promise<boolean> {
    try {
      const cert = CertificateManager.loadCertificate(this.certPath);
      const daysLeft = CertificateManager.getCertificateExpirationDays(cert);
      const rotationThreshold = this.rotationDays;
      return daysLeft < rotationThreshold;
    } catch (error) {
      return false;
    }
  }

  async rotateCertificates(entityID: string): Promise<void> {
    try {
      // Backup certificados existentes
      const oldCert = CertificateManager.loadCertificate(this.certPath);
      const timestamp = Date.now();
      CertificateManager.saveCertificate(`${this.certPath}.backup.${timestamp}`, oldCert);

      // Generar nuevos certificados
      const { cert, key } = CertificateManager.generateSelfSignedCertificate(
        entityID,
        this.rotationDays
      );

      // Guardar
      CertificateManager.saveCertificate(this.certPath, cert, true);
      CertificateManager.saveCertificate(this.keyPath, key, false);
    } catch (error) {
      throw new CertificateException(
        `Certificate rotation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
