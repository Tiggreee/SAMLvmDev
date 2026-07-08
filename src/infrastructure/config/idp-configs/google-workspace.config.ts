// Configuración Google Workspace

import { IdPConfig } from '@shared/types/saml.types';

export function createGoogleWorkspaceConfig(): IdPConfig {
  return {
    id: 'google-workspace',
    name: 'Google Workspace',
    entityID: 'https://accounts.google.com/o/saml2/idp?idpid=your-idp-id',
    singleSignOnServiceUrl: 'https://accounts.google.com/o/saml2/idp?idpid=your-idp-id',
    singleLogoutServiceUrl: 'https://accounts.google.com/Logout',
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    certificatePath: './certificates/idp-public-certs/google-workspace.crt',
    enabled: true,
    attributeMapping: {
      email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      givenName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
      surname: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
      groups: 'http://schemas.xmlsoap.org/claims/Group',
      roles: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role',
    },
  };
}
