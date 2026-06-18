// Caso de Uso: Validar Assertion SAML

import { SAMLAssertionEntity } from '../entities/SAMLEntities';
import {
  InvalidAssertionException,
  AssertionExpiredException,
} from '../exceptions/SAMLExceptions';

export class ValidateSAMLAssertion {
  async execute(
    assertion: SAMLAssertionEntity,
    expectedAudience: string,
    clockSkewTolerance: number = 60
  ): Promise<boolean> {
    try {
      // Validar que la assertion exista
      if (!assertion) {
        throw new InvalidAssertionException('No assertion provided');
      }

      // Validar temporalidad con clock skew
      if (!assertion.isValid(clockSkewTolerance)) {
        throw new AssertionExpiredException(
          `Assertion is outside valid time range. NotBefore: ${assertion.notBefore}, NotOnOrAfter: ${assertion.notOnOrAfter}`
        );
      }

      // Validar audiencia
      if (!assertion.conditions.isAudienceValid(expectedAudience)) {
        throw new InvalidAssertionException(
          `Invalid audience. Expected: ${expectedAudience}, Got: ${assertion.conditions.audience}`
        );
      }

      // Validar que está dentro del período de validez
      if (!assertion.conditions.isWithinValidityPeriod(clockSkewTolerance)) {
        throw new InvalidAssertionException('Assertion is outside validity period');
      }

      return true;
    } catch (error) {
      if (error instanceof DomainException) {
        throw error;
      }
      throw new InvalidAssertionException(`Assertion validation failed: ${error}`);
    }
  }
}

abstract class DomainException extends Error {
  constructor(message: string) {
    super(message);
  }
}
