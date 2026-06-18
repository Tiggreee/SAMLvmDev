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

export const ONELOGIN_SETUP_GUIDE = `
# OneLogin SAML SSO Setup

## Prerequisites
- OneLogin account with admin access
- Subdomain assigned by OneLogin

## Step-by-Step Configuration

### 1. Access OneLogin Admin

1. Go to your OneLogin admin dashboard
2. Click "Applications" → "Add App"
3. Search for "SAML Test Connector (Advanced)"
4. Click "Save"

### 2. Configure SAML

In the app configuration:

**Display Name:**
Your App Name

**Audience (EntityID):**
https://yourapp.com

**Recipient:**
https://yourapp.com/auth/saml/acs

**ACS (Consumer) URL Validator:**
https://yourapp\.com/auth/saml/acs

**Single Logout Service URL:**
https://yourapp.com/auth/saml/logout

### 3. Configure Attributes

Map these attributes:
- Email (required): email
- First Name: firstname
- Last Name: lastname
- Groups: groups (if applicable)

### 4. Configuration Parameters Tab

1. **SAML Login URL (Issuer URL):**
   https://your-subdomain.onelogin.com/trust/saml2/http-post/sso/your-app-id

2. **SAML Logout URL:**
   https://your-subdomain.onelogin.com/trust/saml2/http-redirect/slo/your-app-id

3. **Certificate:**
   Download OneLogin's public certificate
   Save as: ./certificates/idp-public-certs/onelogin.crt

### 5. Upload SP Certificate

1. In OneLogin, click "More actions" → "Upload Certificate"
2. Upload your SP certificate (from /auth/saml/metadata)

### 6. Configuration File

\`\`\`env
ONELOGIN_SUBDOMAIN=your-subdomain
ONELOGIN_APP_ID=your-app-id
ONELOGIN_ENTITY_ID=https://your-subdomain.onelogin.com/saml/metadata/your-app-id
ONELOGIN_SSO_URL=https://your-subdomain.onelogin.com/trust/saml2/http-post/sso/your-app-id
ONELOGIN_CERT_PATH=./certificates/idp-public-certs/onelogin.crt
\`\`\`

### 7. Assign Users

1. In OneLogin, click "Users" → Find users
2. Assign them to your application

### 8. Test

1. Click "Test" in the app configuration
2. Follow the SAML flow
3. Verify successful authentication
`;
