// Configuración OneLogin

import { IdPConfig } from '@shared/types/saml.types';

export function createOneLoginConfig(subdomain: string, appId: string): IdPConfig {
  return {
    id: 'onelogin',
    name: 'OneLogin',
    entityID: `https://${subdomain}.onelogin.com/saml/metadata/${appId}`,
    singleSignOnServiceUrl: `https://${subdomain}.onelogin.com/trust/saml2/http-post/sso/${appId}`,
    singleLogoutServiceUrl: `https://${subdomain}.onelogin.com/trust/saml2/http-redirect/slo/${appId}`,
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    certificatePath: './certificates/idp-public-certs/onelogin.crt',
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
