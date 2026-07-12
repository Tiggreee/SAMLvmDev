// Tipos SAML estándar para toda la plataforma

export interface SAMLSettings {
  entityID: string;
  assertionConsumerServiceUrl: string;
  singleLogoutServiceUrl?: string;
  identifierFormat: string;
  authnContext?: string;
  wantAssertionSigned: boolean;
  wantResponseSigned: boolean;
  requestShouldBeSigned: boolean;
  signatureAlgorithm: string;
  digestAlgorithm: string;
  decryptionPvk?: string;
}

export interface SAMLAttributes {
  email: string;
  nameID: string;
  givenName?: string;
  surname?: string;
  groups?: string[];
  roles?: string[];
  [key: string]: unknown;
}

export interface SAMLResponse {
  ID: string;
  Destination: string;
  IssueInstant: Date;
  Issuer: {
    Format: string;
    Text: string;
  };
  Status: {
    StatusCode: {
      Value: string;
    };
    StatusMessage?: string;
  };
  Assertion?: SAMLAssertion;
}

export interface SAMLAssertion {
  ID: string;
  IssueInstant: Date;
  Subject: {
    NameID: {
      Format: string;
      Text: string;
    };
    SubjectConfirmation: {
      Method: string;
      SubjectConfirmationData: {
        NotOnOrAfter: Date;
        Recipient: string;
      };
    };
  };
  Conditions: {
    NotBefore: Date;
    NotOnOrAfter: Date;
    AudienceRestriction: {
      Audience: string;
    };
  };
  AuthnStatement: {
    AuthnInstant: Date;
    SessionIndex: string;
    AuthnContext: {
      AuthnContextClassRef: string;
    };
  };
  AttributeStatement: {
    Attribute: Array<{
      Name: string;
      AttributeValue: string | string[];
    }>;
  };
  Signature: {
    SignatureValue: string;
    SignedInfo: {
      Reference: {
        DigestValue: string;
      };
    };
  };
}

export interface SAMLRequest {
  ID: string;
  IssueInstant: Date;
  Destination: string;
  AssertionConsumerServiceURL: string;
  Issuer: string;
  NameIDPolicy: {
    Format: string;
    AllowCreate: boolean;
  };
  RequestedAuthnContext: {
    AuthnContextClassRef: string;
  };
}

export interface IdPConfig {
  id: string;
  name: string;
  entityID: string;
  singleSignOnServiceUrl: string;
  singleLogoutServiceUrl?: string;
  identifierFormat: string;
  certificatePath: string;
  certificateContent?: string;
  enabled: boolean;
  attributeMapping?: Record<string, string>;
  signatureAlgorithm?: string;
  digestAlgorithm?: string;
}

export interface SAMLValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  attributes?: SAMLAttributes;
  sessionIndex?: string;
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  eventType: 'LOGIN_ATTEMPT' | 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGOUT' | 'CERT_ROTATED' | 'CONFIG_UPDATED' | 'VALIDATION_ERROR';
  userId?: string;
  idpName?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  status: 'SUCCESS' | 'FAILURE';
  errorMessage?: string;
}

export interface SessionData {
  id: string;
  userId: string;
  idpName: string;
  email: string;
  attributes: SAMLAttributes;
  sessionIndex?: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  ipAddress: string;
  userAgent: string;
}

export enum ClockSkewStatus {
  WITHIN_TOLERANCE = 'WITHIN_TOLERANCE',
  OUTSIDE_TOLERANCE = 'OUTSIDE_TOLERANCE',
  CRITICAL = 'CRITICAL',
}

export interface ClockSkewCheck {
  status: ClockSkewStatus;
  skewSeconds: number;
  tolerance: number;
}
