// Configuración PingIdentity

import { IdPConfig } from '@shared/types/saml.types';

export function createPingIdentityConfig(
  pingOneEnvironmentId: string,
  applicationId: string
): IdPConfig {
  return {
    id: 'pingidentity',
    name: 'PingIdentity',
    entityID: `https://auth.pingone.com/${pingOneEnvironmentId}`,
    singleSignOnServiceUrl: `https://auth.pingone.com/${pingOneEnvironmentId}/as/authorization.oauth2?client_id=${applicationId}&response_type=code&redirect_uri=https://yourapp.com/auth/saml/acs`,
    singleLogoutServiceUrl: `https://auth.pingone.com/${pingOneEnvironmentId}/as/signoff`,
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    certificatePath: './certificates/idp-public-certs/pingidentity.crt',
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
