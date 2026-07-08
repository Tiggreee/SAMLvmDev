// Configuración Okta

import { IdPConfig } from '@shared/types/saml.types';

export function createOktaConfig(oktaDomain: string, appId: string): IdPConfig {
  return {
    id: 'okta',
    name: 'Okta',
    entityID: `https://${oktaDomain}.okta.com`,
    singleSignOnServiceUrl: `https://${oktaDomain}.okta.com/app/amazon_aws/exk${appId}/sso/saml`,
    singleLogoutServiceUrl: `https://${oktaDomain}.okta.com/app/amazon_aws/exk${appId}/slo/saml`,
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    certificatePath: './certificates/idp-public-certs/okta.crt',
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
