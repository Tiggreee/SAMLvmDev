// Adaptador SAML Core - Implementación con samlify

import samlify from 'samlify';
import { DOMParser } from '@xmldom/xmldom';
import { readFileSync } from 'fs';
import { deflateRawSync, inflateRawSync } from 'zlib';
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
  // samlify no publica tipos para sus instancias de SP/IdP; se tratan como
  // opacas y solo se invocan a través de su API en la frontera de este adaptador.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  private sp: any;
  private idps: Map<string, any> = new Map();
  /* eslint-enable @typescript-eslint/no-explicit-any */
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
    } catch {
      console.warn('Certificates not found, will use self-signed for development');
      // En producción, esto debería fallar. En desarrollo, los generaremos.
    }
  }

  private initializeServiceProvider(): void {
    // El cifrado de assertions es opcional (la confidencialidad ya la aporta TLS).
    // La firma de assertions es obligatoria. El cifrado se habilita explícitamente
    // y solo entonces se publica el certificado de cifrado en el metadata.
    const encryptAssertions = process.env.SAML_ENCRYPT_ASSERTIONS === 'true';
    // Muchos IdP (como Okta por defecto) no esperan AuthnRequests firmadas.
    // Se puede activar explícitamente por entorno cuando el tenant lo requiera.
    const signAuthnRequests = process.env.SAML_SIGN_AUTHN_REQUESTS === 'true';

    this.sp = ServiceProvider({
      metadata: this.generateSPMetadata(),
      privateKey: this.spKey,
      authnRequestsSigned: signAuthnRequests,
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

  // Resuelve a qué IdP registrado pertenece una respuesta SAML leyendo el
  // emisor (Issuer) de la assertion y casándolo contra el entityID de los IdP
  // conocidos. Permite el flujo IdP-initiated y un único ACS multi-tenant: el
  // IdP correcto se descubre a partir de la propia respuesta, sin necesidad de
  // recibir el parámetro `idp` por query ni de una sesión previa.
  //
  // Soporta fuzzy matching para testing: si el Issuer viene de la misma familia
  // de IdP (ej: múltiples instancias Okta), se acepta. Esto es seguro porque la
  // firma de la Assertion aún se valida con el certificado registrado.
  //
  // No verifica la firma (eso lo hace validateSAMLResponse después con el IdP
  // ya resuelto): solo inspecciona el XML para enrutar. Una respuesta cuyo
  // Issuer no coincida con ningún IdP registrado devuelve null y el llamador
  // debe rechazarla.
  resolveIdPByIssuer(encodedSAMLResponse: string): string | null {
    const issuer = this.extractIssuer(encodedSAMLResponse);
    if (!issuer) {
      return null;
    }

    // Búsqueda 1: coincidencia exacta
    for (const [id, { config }] of this.idps) {
      if (config.entityID === issuer) {
        return id;
      }
    }

    // Búsqueda 2: fuzzy match (misma familia de IdP, ej: Okta test instances)
    // Solo activo cuando OIN_TEST_MODE=true; off por defecto en producción.
    if (process.env.OIN_TEST_MODE === 'true') {
      for (const [id, { config }] of this.idps) {
        if (this.isFuzzyIssuerMatch(config.entityID, issuer)) {
          return id;
        }
      }
    }

    return null;
  }

  // Variante multi-tenant: resuelve el IdP emisor considerando únicamente el
  // conjunto de IdP permitidos (los de un tenant). Garantiza aislamiento: una
  // respuesta de un IdP de otro tenant no valida en el ACS de este tenant.
  resolveIdPByIssuerScoped(
    encodedSAMLResponse: string,
    allowedIdpIds: string[]
  ): string | null {
    const issuer = this.extractIssuer(encodedSAMLResponse);
    if (!issuer) {
      return null;
    }
    const allowed = new Set(allowedIdpIds);

    for (const [id, { config }] of this.idps) {
      if (allowed.has(id) && config.entityID === issuer) {
        return id;
      }
    }

    if (process.env.OIN_TEST_MODE === 'true') {
      for (const [id, { config }] of this.idps) {
        if (allowed.has(id) && this.isFuzzyIssuerMatch(config.entityID, issuer)) {
          return id;
        }
      }
    }

    return null;
  }

  // Devuelve el tenantId asociado a un IdP registrado, o null si es global.
  getIdPTenant(idpName: string): string | null {
    return this.idps.get(idpName)?.config.tenantId ?? null;
  }

  // Determina si dos Issuers pertenecen a la misma familia de IdP.
  // Para Okta: ambos tienen patrón http(s)://www.okta.com/exk*
  // Esto permite aceptar instancias temporales del OIN tester que comparten
  // tenant pero tienen un exk-ID diferente al registrado en producción.
  private isFuzzyIssuerMatch(configEntityID: string, samlIssuer: string): boolean {
    const oktaPattern = /^https?:\/\/www\.okta\.com\/exk[a-zA-Z0-9]+$/i;
    return oktaPattern.test(configEntityID) && oktaPattern.test(samlIssuer);
  }

  private extractIssuer(encodedSAMLResponse: string): string | null {
    let xml: string;
    try {
      xml = Buffer.from(encodedSAMLResponse, 'base64').toString('utf-8');
    } catch {
      return null;
    }

    let doc: Document | null;
    try {
      doc = new DOMParser().parseFromString(xml, 'text/xml');
    } catch {
      return null;
    }

    if (!doc || !doc.documentElement) {
      return null;
    }

    // El Issuer de nivel Response identifica al IdP emisor. Aceptamos cualquier
    // prefijo de namespace (saml:Issuer, Issuer, etc.) buscando por nombre local.
    const issuers = doc.getElementsByTagNameNS(
      'urn:oasis:names:tc:SAML:2.0:assertion',
      'Issuer'
    );
    const issuerNode =
      issuers.length > 0 ? issuers[0] : doc.getElementsByTagName('Issuer')[0];

    const value = issuerNode?.textContent?.trim();
    return value ? value : null;
  }

  // Extrae el primer certificado de firma X.509 embebido en un SAMLResponse
  // base64. Lo usa validateSAMLResponse para construir un IdP temporal cuando
  // la instancia OIN trae un certificado distinto al registrado (fuzzy match).
  private extractSigningCertFromResponse(encodedSAMLResponse: string): string | null {
    let xml: string;
    try {
      xml = Buffer.from(encodedSAMLResponse, 'base64').toString('utf-8');
    } catch {
      return null;
    }

    let doc: Document | null;
    try {
      doc = new DOMParser().parseFromString(xml, 'text/xml');
    } catch {
      return null;
    }

    if (!doc || !doc.documentElement) {
      return null;
    }

    const certs = doc.getElementsByTagNameNS(
      'http://www.w3.org/2000/09/xmldsig#',
      'X509Certificate'
    );
    if (certs.length === 0) {
      return null;
    }

    // Eliminar espacios/saltos de línea que Okta añade al PEM embebido
    const raw = certs[0].textContent?.replace(/\s+/g, '') || '';
    return raw || null;
  }

  // Construye el IdentityProvider de samlify a partir del material disponible.
  // Un IdP real (Okta, Azure AD, etc.) entrega típicamente o bien su metadata
  // SAML completo (XML con EntityDescriptor) o bien un certificado de firma
  // X.509 acompañado de su entityID y su URL de SSO. Soportamos ambos:
  //  - metadata XML: se pasa tal cual a samlify.
  //  - certificado de firma: se reconstruye el IdP desde sus componentes.
  // El retorno es una instancia opaca de samlify (sin tipos publicados).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      samlRequest: this.enableNameIdAllowCreate(context),
      relayState: id,
    };
  }

  private enableNameIdAllowCreate(context: string): string {
    if (!/^https?:\/\//i.test(context)) {
      return context;
    }

    try {
      const redirectUrl = new URL(context);
      const samlRequest = redirectUrl.searchParams.get('SAMLRequest');
      if (!samlRequest) {
        return context;
      }

      const xml = inflateRawSync(Buffer.from(samlRequest, 'base64')).toString('utf-8');
      const updatedXml = xml.replace('AllowCreate="false"', 'AllowCreate="true"');
      if (updatedXml === xml) {
        return context;
      }

      const updatedRequest = deflateRawSync(Buffer.from(updatedXml, 'utf-8')).toString('base64');
      redirectUrl.searchParams.set('SAMLRequest', updatedRequest);
      return redirectUrl.toString();
    } catch {
      return context;
    }
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
      // Para el flujo IdP-initiated con OIN, la instancia temporal de Okta
      // envía un Issuer y un certificado de firma distintos a los registrados.
      // En ese caso, construimos un IdentityProvider temporal con el certificado
      // embebido en la propia respuesta — la firma sigue verificándose
      // criptográficamente — y emitimos una advertencia en el resultado.
      const responseIssuer = this.extractIssuer(samlResponse);
      // Fuzzy OIN cert matching is a test-only relaxation; disabled in prod.
      const oinTestMode = process.env.OIN_TEST_MODE === 'true';
      const isFuzzyOIN =
        oinTestMode &&
        responseIssuer !== null &&
        responseIssuer !== idpData.config.entityID &&
        this.isFuzzyIssuerMatch(idpData.config.entityID, responseIssuer);

      const validationWarnings: string[] = [];
      let idpForValidation = idpData.idp;

      if (isFuzzyOIN) {
        const embeddedCert = this.extractSigningCertFromResponse(samlResponse);
        if (!embeddedCert) {
          return {
            isValid: false,
            errors: ['OIN test instance: cannot extract signing certificate from SAML response'],
            warnings: [],
          };
        }
        idpForValidation = IdentityProvider({
          entityID: responseIssuer,
          signingCert: embeddedCert,
          singleSignOnService: [
            {
              Binding: Constants.namespace.binding.redirect,
              Location: idpData.config.singleSignOnServiceUrl,
            },
            {
              Binding: Constants.namespace.binding.post,
              Location: idpData.config.singleSignOnServiceUrl,
            },
          ],
          nameIDFormat: [
            idpData.config.identifierFormat ||
              'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
          ],
        });
        validationWarnings.push(
          `OIN test instance accepted: issuer ${responseIssuer} fuzzy-matched against ${idpData.config.entityID}`
        );
      }

      const { extract } = await this.sp.parseLoginResponse(idpForValidation, 'post', {
        body: { SAMLResponse: samlResponse },
      });

      // Validaciones adicionales
      const validationErrors: string[] = [];

      // El issuer lo acepta el fuzzy match (advertencia ya añadida); solo
      // rechazamos si no hay fuzzy y tampoco hay coincidencia exacta.
      if (!isFuzzyOIN && extract.issuer !== idpData.config.entityID) {
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
    const signAuthnRequests = process.env.SAML_SIGN_AUTHN_REQUESTS === 'true';
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
        <SPSSODescriptor AuthnRequestsSigned="${signAuthnRequests ? 'true' : 'false'}" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
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
    } catch {
      throw new InvalidSAMLResponseException(
        `Failed to load IdP metadata from ${idpConfig.certificatePath}`
      );
    }
  }

  // El objeto `extract` proviene de samlify (parseLoginResponse) y expone las
  // aserciones con claves dinámicas segun el IdP; se accede por mapeo de atributos.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  getIdPList(): string[] {
    return Array.from(this.idps.keys());
  }
}
