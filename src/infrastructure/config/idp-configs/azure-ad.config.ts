// Configuración Azure AD / Entra ID

import { IdPConfig } from '@shared/types/saml.types';

export function createAzureADConfig(tenantId: string, appId: string): IdPConfig {
  return {
    id: 'azure-ad',
    name: `Azure AD / Entra ID (${appId})`,
    entityID: `https://sts.windows.net/${tenantId}/`,
    singleSignOnServiceUrl: `https://login.microsoftonline.com/${tenantId}/saml2`,
    singleLogoutServiceUrl: `https://login.microsoftonline.com/${tenantId}/saml2`,
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    certificatePath: './certificates/idp-public-certs/azure-ad.crt',
    enabled: true,
    attributeMapping: {
      email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      givenName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
      surname: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
      groups: 'http://schemas.xmlsoap.org/claims/Group',
      roles: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role',
    },
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  };
}
