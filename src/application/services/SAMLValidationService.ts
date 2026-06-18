// Servicio de Validación SAML

import { SAMLAdapter } from '@infrastructure/saml/SAMLAdapter';
import { SAMLValidationResult } from '@shared/types/saml.types';

export class SAMLValidationService {
  private clockSkewTolerance: number;

  constructor(
    private samlAdapter: SAMLAdapter,
    clockSkewTolerance: number = 60
  ) {
    this.clockSkewTolerance = clockSkewTolerance;
  }

  async validateSAMLResponse(
    samlResponse: string,
    idpName: string
  ): Promise<SAMLValidationResult> {
    return this.samlAdapter.validateSAMLResponse(samlResponse, '', idpName);
  }

  async validateClockSkew(
    assertionTimestamp: Date,
    tolerance: number = this.clockSkewTolerance
  ): Promise<{
    isValid: boolean;
    skewSeconds: number;
  }> {
    const now = new Date();
    const skewMs = Math.abs(now.getTime() - assertionTimestamp.getTime());
    const skewSeconds = Math.floor(skewMs / 1000);

    return {
      isValid: skewSeconds <= tolerance,
      skewSeconds,
    };
  }

  setClockSkewTolerance(seconds: number): void {
    if (seconds < 0 || seconds > 300) {
      throw new Error('Clock skew tolerance must be between 0 and 300 seconds');
    }
    this.clockSkewTolerance = seconds;
  }

  getClockSkewTolerance(): number {
    return this.clockSkewTolerance;
  }
}
