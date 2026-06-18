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

export const PINGIDENTITY_SETUP_GUIDE = `
# PingIdentity SAML SSO Setup

## Prerequisites
- PingOne for Enterprise environment
- PingOne admin access
- PingIdentity license

## Step-by-Step Configuration

### 1. Access PingOne Admin

1. Go to your PingOne admin console
2. Select your environment

### 2. Create Application

1. Go to "Connections" → "Applications"
2. Click "Create Application"
3. Choose "Enterprise SAML Application"
4. Fill in:
   - Application Name: Your App Name
   - Application Description: Your description

### 3. Configure SAML

In Application Settings:

**Assertion Consumer Service (ACS) URL:**
https://yourapp.com/auth/saml/acs

**Entity ID (Issuer):**
https://yourapp.com

**SLO Endpoint (if using SLO):**
https://yourapp.com/auth/saml/logout

**Signing Options:**
- Sign Assertions: Enabled
- Encrypt Assertions: Recommended

### 4. Configure Attribute Mappings

Map these:
- Email → user.email
- Given Name → user.firstName
- Surname → user.lastName
- Groups → user.groups

### 5. Download PingIdentity Certificate

1. In Application settings
2. Download signing certificate
3. Save as: ./certificates/idp-public-certs/pingidentity.crt

### 6. Upload SP Metadata

1. Generate SP metadata: https://yourapp.com/auth/saml/metadata
2. Upload to PingIdentity application

### 7. Assign Users

1. Go to "Users" in your environment
2. Assign users to your application

### 8. Configuration File

\`\`\`env
PINGONE_ENVIRONMENT_ID=your-environment-id
PINGONE_APPLICATION_ID=your-app-id
PINGIDENTITY_ENTITY_ID=https://auth.pingone.com/your-environment-id
PINGIDENTITY_SSO_URL=https://auth.pingone.com/your-environment-id/as/authorization.oauth2
PINGIDENTITY_CERT_PATH=./certificates/idp-public-certs/pingidentity.crt
\`\`\`

### 9. Test Authentication

1. In PingIdentity, test SAML flow
2. Verify attributes are correctly mapped
3. Test logout

## Important Notes

- PingIdentity supports both SAML and OIDC
- For best security, always encrypt assertions
- Regularly rotate signing certificates
- Monitor failed authentication attempts
`;
