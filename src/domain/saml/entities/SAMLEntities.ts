// Entidades del dominio SAML

import { SAMLAttributes } from '@shared/types/saml.types';

export class SAMLResponseEntity {
  constructor(
    public readonly id: string,
    public readonly destination: string,
    public readonly issueInstant: Date,
    public readonly issuer: string,
    public readonly assertion: SAMLAssertionEntity,
    public readonly signature: SAMLSignature
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.id) throw new Error('SAMLResponse must have an ID');
    if (!this.issuer) throw new Error('SAMLResponse must have an Issuer');
    if (!this.assertion) throw new Error('SAMLResponse must have an Assertion');
  }

  isExpired(): boolean {
    return new Date() > this.assertion.notOnOrAfter;
  }

  isNotYetValid(): boolean {
    return new Date() < this.assertion.notBefore;
  }

  getNameID(): string {
    return this.assertion.subject.nameID;
  }
}

export class SAMLAssertionEntity {
  constructor(
    public readonly id: string,
    public readonly issueInstant: Date,
    public readonly subject: SAMLSubject,
    public readonly conditions: SAMLConditions,
    public readonly authnStatement: SAMLAuthnStatement,
    public readonly attributes: SAMLAttributes,
    public readonly notBefore: Date,
    public readonly notOnOrAfter: Date
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.id) throw new Error('Assertion must have an ID');
    if (!this.subject) throw new Error('Assertion must have a Subject');
    if (!this.conditions) throw new Error('Assertion must have Conditions');
  }

  isValid(tolerance: number = 60): boolean {
    const now = new Date();
    const notBeforeWithTolerance = new Date(this.notBefore.getTime() - tolerance * 1000);
    const notOnOrAfterWithTolerance = new Date(this.notOnOrAfter.getTime() + tolerance * 1000);

    return now >= notBeforeWithTolerance && now <= notOnOrAfterWithTolerance;
  }
}

export class SAMLSubject {
  constructor(
    public readonly nameID: string,
    public readonly nameIDFormat: string,
    public readonly confirmationMethod: string,
    public readonly confirmationRecipient: string,
    public readonly confirmationNotOnOrAfter: Date
  ) {}
}

export class SAMLConditions {
  constructor(
    public readonly notBefore: Date,
    public readonly notOnOrAfter: Date,
    public readonly audience: string
  ) {
    if (notBefore >= notOnOrAfter) {
      throw new Error('NotBefore must be before NotOnOrAfter');
    }
  }

  isAudienceValid(expectedAudience: string): boolean {
    return this.audience === expectedAudience;
  }

  isWithinValidityPeriod(clockSkew: number = 60): boolean {
    const now = new Date();
    return (
      now.getTime() >= this.notBefore.getTime() - clockSkew * 1000 &&
      now.getTime() <= this.notOnOrAfter.getTime() + clockSkew * 1000
    );
  }
}

export class SAMLAuthnStatement {
  constructor(
    public readonly authnInstant: Date,
    public readonly sessionIndex: string,
    public readonly authnContextClassRef: string
  ) {
    if (authnInstant > new Date()) {
      throw new Error('AuthnInstant cannot be in the future');
    }
  }
}

export class SAMLSignature {
  constructor(
    public readonly signatureValue: string,
    public readonly digestValue: string,
    public readonly certificateFingerprint: string
  ) {
    if (!signatureValue) throw new Error('Signature value is required');
    if (!digestValue) throw new Error('Digest value is required');
  }

  validate(expectedFingerprint: string): boolean {
    return this.certificateFingerprint === expectedFingerprint;
  }
}

export class UserProfile {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly givenName?: string,
    public readonly surname?: string,
    public readonly roles?: string[],
    public readonly attributes?: Record<string, any>
  ) {
    this.validateEmail();
  }

  private validateEmail(): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      throw new Error('Invalid email format');
    }
  }

  getFullName(): string {
    if (this.givenName && this.surname) {
      return `${this.givenName} ${this.surname}`;
    }
    return this.email;
  }

  hasRole(role: string): boolean {
    return this.roles?.includes(role) ?? false;
  }
}

export class AuthenticationContext {
  constructor(
    public readonly sessionId: string,
    public readonly userId: string,
    public readonly idpName: string,
    public readonly userProfile: UserProfile,
    public readonly attributes: SAMLAttributes,
    public readonly sessionIndex?: string,
    public readonly createdAt: Date = new Date(),
    public readonly expiresAt: Date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  ) {}

  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  getSessionDurationSeconds(): number {
    return (this.expiresAt.getTime() - this.createdAt.getTime()) / 1000;
  }
}
