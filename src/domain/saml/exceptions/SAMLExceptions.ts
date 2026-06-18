// Excepciones del dominio SAML

export abstract class DomainException extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    Object.setPrototypeOf(this, DomainException.prototype);
  }
}

export class InvalidSAMLResponseException extends DomainException {
  constructor(message: string = 'Invalid SAML Response') {
    super(message, 'INVALID_SAML_RESPONSE');
    Object.setPrototypeOf(this, InvalidSAMLResponseException.prototype);
  }
}

export class InvalidSignatureException extends DomainException {
  constructor(message: string = 'Invalid SAML Signature') {
    super(message, 'INVALID_SIGNATURE');
    Object.setPrototypeOf(this, InvalidSignatureException.prototype);
  }
}

export class InvalidAssertionException extends DomainException {
  constructor(message: string = 'Invalid SAML Assertion') {
    super(message, 'INVALID_ASSERTION');
    Object.setPrototypeOf(this, InvalidAssertionException.prototype);
  }
}

export class InvalidIssuerException extends DomainException {
  constructor(message: string = 'Invalid Issuer') {
    super(message, 'INVALID_ISSUER');
    Object.setPrototypeOf(this, InvalidIssuerException.prototype);
  }
}

export class InvalidAudienceException extends DomainException {
  constructor(message: string = 'Invalid Audience') {
    super(message, 'INVALID_AUDIENCE');
    Object.setPrototypeOf(this, InvalidAudienceException.prototype);
  }
}

export class AssertionExpiredException extends DomainException {
  constructor(message: string = 'Assertion has expired') {
    super(message, 'ASSERTION_EXPIRED');
    Object.setPrototypeOf(this, AssertionExpiredException.prototype);
  }
}

export class AssertionNotYetValidException extends DomainException {
  constructor(message: string = 'Assertion is not yet valid') {
    super(message, 'ASSERTION_NOT_YET_VALID');
    Object.setPrototypeOf(this, AssertionNotYetValidException.prototype);
  }
}

export class ClockSkewException extends DomainException {
  constructor(message: string = 'Clock skew detected and outside tolerance') {
    super(message, 'CLOCK_SKEW_OUT_OF_TOLERANCE');
    Object.setPrototypeOf(this, ClockSkewException.prototype);
  }
}

export class AuthenticationException extends DomainException {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_FAILED');
    Object.setPrototypeOf(this, AuthenticationException.prototype);
  }
}

export class IdPConfigurationException extends DomainException {
  constructor(message: string = 'IdP configuration error') {
    super(message, 'IDP_CONFIG_ERROR');
    Object.setPrototypeOf(this, IdPConfigurationException.prototype);
  }
}

export class CertificateException extends DomainException {
  constructor(message: string = 'Certificate error') {
    super(message, 'CERTIFICATE_ERROR');
    Object.setPrototypeOf(this, CertificateException.prototype);
  }
}

export class SessionException extends DomainException {
  constructor(message: string = 'Session error') {
    super(message, 'SESSION_ERROR');
    Object.setPrototypeOf(this, SessionException.prototype);
  }
}
