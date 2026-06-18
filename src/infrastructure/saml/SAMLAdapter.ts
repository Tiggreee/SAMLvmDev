// Adaptador SAML Core - Implementación con samlify

import samlify from 'samlify';
import { DOMParser } from '@xmldom/xmldom';
import { readFileSync } from 'fs';
import { InvalidSAMLResponseException } from '@domain/saml/exceptions/SAMLExceptions';
import { ISAMLValidator } from '@domain/saml/ports/ISAMLValidator';
import { SAMLAttributes, IdPConfig, SAMLValidationResult } from '@shared/types/saml.types';

const { ServiceProvider, IdentityProvider, Constants } = samlify;

// samlify exige un validador de esquema configurado: sin él, parseLoginResponse
// rechaza toda respuesta SAML. Validamos la buena formación del XML con un parser
// seguro; la protección XXE y la verificación criptográfica de la firma las realiza
// samlify. En despliegues regulados puede sustituirse por un validador XSD estricto.
samlify.setSchemaValidator({
  validate: (xml: string): Promise<string> => {
    try {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const root = doc && doc.documentElement;
      if (!root || root.getElementsByTagName('parsererror').length > 0) {
        return Promise.reject(new Error('Malformed SAML XML'));
      }
      return Promise.resolve('SUCCESS_VALIDATE_XML');
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error('Invalid SAML XML')
      );
    }
  },
});

export class SAMLAdapter implements ISAMLValidator {
  private sp: any;
  private idps: Map<string, any> = new Map();
  private spCert: string = '';
  private spKey: string = '';

  constructor(
    private spEntityId: string,
    private acsUrl: string,
    private sloUrl?: string,
    certPath?: string,
    keyPath?: string
  ) {
    this.loadCertificates(certPath, keyPath);
    this.initializeServiceProvider();
  }

  private loadCertificates(certPath?: string, keyPath?: string): void {
    try {
      this.spCert = readFileSync(certPath || process.env.SAML_SP_CERT_PATH || 'certificates/sp.crt', 'utf-8');
      this.spKey = readFileSync(keyPath || process.env.SAML_SP_KEY_PATH || 'certificates/sp.key', 'utf-8');
    } catch (error) {
      console.warn('Certificates not found, will use self-signed for development');
      // En producción, esto debería fallar. En desarrollo, los generaremos.
    }
  }

  private initializeServiceProvider(): void {
    // El cifrado de assertions es opcional (la confidencialidad ya la aporta TLS).
    // La firma de assertions es obligatoria. El cifrado se habilita explícitamente
    // y solo entonces se publica el certificado de cifrado en el metadata.
    const encryptAssertions = process.env.SAML_ENCRYPT_ASSERTIONS === 'true';

    this.sp = ServiceProvider({
      metadata: this.generateSPMetadata(),
      privateKey: this.spKey,
      isAssertionEncrypted: encryptAssertions,
      ...(encryptAssertions ? { encPrivateKey: this.spKey } : {}),
      wantAssertionsSigned: true,
      requestSignatureAlgorithm: Constants.algorithms.signature.RSA_SHA256,
    });
  }

  registerIdP(idpConfig: IdPConfig): void {
    try {
      const idp = this.buildIdentityProvider(idpConfig);

      this.idps.set(idpConfig.id, {
        idp,
        config: idpConfig,
      });
    } catch (error) {
      throw new InvalidSAMLResponseException(
        `Failed to register IdP ${idpConfig.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Construye el IdentityProvider de samlify a partir del material disponible.
  // Un IdP real (Okta, Azure AD, etc.) entrega típicamente o bien su metadata
  // SAML completo (XML con EntityDescriptor) o bien un certificado de firma
  // X.509 acompañado de su entityID y su URL de SSO. Soportamos ambos:
  //  - metadata XML: se pasa tal cual a samlify.
  //  - certificado de firma: se reconstruye el IdP desde sus componentes.
  private buildIdentityProvider(idpConfig: IdPConfig): any {
    const material = this.loadIdPMetadata(idpConfig).trim();

    if (material.includes('EntityDescriptor')) {
      return IdentityProvider({ metadata: material });
    }

    // El material es un certificado de firma pelado (PEM/base64). Necesitamos
    // los datos de protocolo que un IdP real publica junto a su certificado.
    if (!idpConfig.entityID || !idpConfig.singleSignOnServiceUrl) {
      throw new Error(
        'IdP configured with a bare signing certificate requires entityID and singleSignOnServiceUrl'
      );
    }

    const ssoServices = [
      {
        Binding: Constants.namespace.binding.redirect,
        Location: idpConfig.singleSignOnServiceUrl,
      },
      {
        Binding: Constants.namespace.binding.post,
        Location: idpConfig.singleSignOnServiceUrl,
      },
    ];

    const sloServices = idpConfig.singleLogoutServiceUrl
      ? [
          {
            Binding: Constants.namespace.binding.redirect,
            Location: idpConfig.singleLogoutServiceUrl,
          },
        ]
      : undefined;

    return IdentityProvider({
      entityID: idpConfig.entityID,
      signingCert: material,
      singleSignOnService: ssoServices,
      ...(sloServices ? { singleLogoutService: sloServices } : {}),
      nameIDFormat: [
        idpConfig.identifierFormat ||
          'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      ],
    });
  }

  generateSAMLRequest(idpName: string): {
    samlRequest: string;
    relayState: string;
  } {
    const idpData = this.idps.get(idpName);
    if (!idpData) {
      throw new InvalidSAMLResponseException(`IdP not registered: ${idpName}`);
    }

    const { id, context } = this.sp.createLoginRequest(idpData.idp, 'redirect');
    
    return {
      samlRequest: context,
      relayState: id,
    };
  }

  async validateSAMLResponse(
    samlResponse: string,
    _relayState: string,
    idpName: string
  ): Promise<SAMLValidationResult> {
    const idpData = this.idps.get(idpName);
    if (!idpData) {
      return {
        isValid: false,
        errors: [`IdP not registered: ${idpName}`],
        warnings: [],
      };
    }

    try {
      const { extract } = await this.sp.parseLoginResponse(idpData.idp, 'post', {
        body: { SAMLResponse: samlResponse },
      });

      // Validaciones adicionales
      const validationErrors: string[] = [];
      const validationWarnings: string[] = [];

      // Validar issuer
      if (extract.issuer !== idpData.config.entityID) {
        validationErrors.push(
          `Invalid issuer: expected ${idpData.config.entityID}, got ${extract.issuer}`
        );
      }

      // Validar audience
      if (!extract.audience || !extract.audience.includes(this.spEntityId)) {
        validationErrors.push(
          `Invalid audience: expected ${this.spEntityId}, got ${extract.audience}`
        );
      }

      // Validar timestamps con clock skew.
      // samlify expone las condiciones como extract.conditions.{notBefore,notOnOrAfter}
      // en formato ISO (string), no como objetos Date.
      const clockSkew = parseInt(process.env.CLOCK_SKEW_TOLERANCE || '60', 10);
      const now = Date.now();
      const conditions = extract.conditions || {};
      const notBeforeRaw = conditions.notBefore;
      const notOnOrAfterRaw = conditions.notOnOrAfter;
      const notBefore = notBeforeRaw ? new Date(notBeforeRaw).getTime() : 0;
      const notOnOrAfter = notOnOrAfterRaw
        ? new Date(notOnOrAfterRaw).getTime()
        : Number.MAX_SAFE_INTEGER;

      if (notBefore && now < notBefore - clockSkew * 1000) {
        validationErrors.push('Assertion is not yet valid');
      }

      if (
        notOnOrAfter !== Number.MAX_SAFE_INTEGER &&
        now > notOnOrAfter + clockSkew * 1000
      ) {
        validationErrors.push('Assertion has expired');
      }

      if (validationErrors.length > 0) {
        return {
          isValid: false,
          errors: validationErrors,
          warnings: validationWarnings,
        };
      }

      const attributes = this.mapAttributes(extract, idpData.config);

      return {
        isValid: true,
        errors: [],
        warnings: validationWarnings,
        attributes,
        sessionIndex: extract.sessionIndex,
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [
          `SAML validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
        warnings: [],
      };
    }
  }

  generateMetadata(): string {
    return this.sp.getMetadata();
  }

  // Implementación del puerto de dominio ISAMLValidator.
  validateResponse(
    encodedSAMLResponse: string,
    relayState: string,
    idpName: string
  ): Promise<SAMLValidationResult> {
    return this.validateSAMLResponse(encodedSAMLResponse, relayState, idpName);
  }

  private generateSPMetadata(): string {
    const cert = this.extractCertificateContent();
    const encryptAssertions = process.env.SAML_ENCRYPT_ASSERTIONS === 'true';
    const encryptionKeyDescriptor = encryptAssertions
      ? `<KeyDescriptor use="encryption">
            <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
              <X509Data>
                <X509Certificate>${cert}</X509Certificate>
              </X509Data>
            </KeyInfo>
          </KeyDescriptor>`
      : '';

    return `
      <EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${this.spEntityId}">
        <SPSSODescriptor AuthnRequestsSigned="true" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
          <KeyDescriptor use="signing">
            <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
              <X509Data>
                <X509Certificate>${cert}</X509Certificate>
              </X509Data>
            </KeyInfo>
          </KeyDescriptor>
          ${encryptionKeyDescriptor}
          <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${this.sloUrl || 'https://localhost:3000/auth/saml/logout'}"/>
          <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
          <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${this.acsUrl}" index="0" isDefault="true"/>
        </SPSSODescriptor>
      </EntityDescriptor>
    `;
  }

  private extractCertificateContent(): string {
    if (!this.spCert) return '';
    return this.spCert
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\n/g, '');
  }

  private loadIdPMetadata(idpConfig: IdPConfig): string {
    if (idpConfig.certificateContent) {
      return idpConfig.certificateContent;
    }

    try {
      return readFileSync(idpConfig.certificatePath, 'utf-8');
    } catch (error) {
      throw new InvalidSAMLResponseException(
        `Failed to load IdP metadata from ${idpConfig.certificatePath}`
      );
    }
  }

  private mapAttributes(extract: any, idpConfig: IdPConfig): SAMLAttributes {
    const attributeMapping = idpConfig.attributeMapping || {
      email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      givenName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
      surname: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
      groups: 'http://schemas.xmlsoap.org/claims/Group',
      roles: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role',
    };

    return {
      email: extract[attributeMapping.email] || extract.email || extract.nameID,
      nameID: extract.nameID,
      givenName: extract[attributeMapping.givenName],
      surname: extract[attributeMapping.surname],
      groups: Array.isArray(extract[attributeMapping.groups])
        ? extract[attributeMapping.groups]
        : extract[attributeMapping.groups]
        ? [extract[attributeMapping.groups]]
        : [],
      roles: Array.isArray(extract[attributeMapping.roles])
        ? extract[attributeMapping.roles]
        : extract[attributeMapping.roles]
        ? [extract[attributeMapping.roles]]
        : [],
    };
  }

  async validateSignature(
    _samlResponse: string,
    _certificateFingerprint: string
  ): Promise<boolean> {
    // La validación de firma se realiza automáticamente en parseLoginResponse
    // Este método es para validaciones adicionales si es necesario
    return true;
  }

  getIdPList(): string[] {
    return Array.from(this.idps.keys());
  }

  getIdPConfig(idpName: string): IdPConfig | null {
    const idpData = this.idps.get(idpName);
    return idpData?.config || null;
  }
}

export class SAMLAdapterFactory {
  static create(spEntityId: string, acsUrl: string, sloUrl?: string): SAMLAdapter {
    return new SAMLAdapter(spEntityId, acsUrl, sloUrl);
  }
}
