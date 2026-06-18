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

export const OKTA_SETUP_GUIDE = `
# Okta SAML SSO Setup

## Prerequisites
- Okta tenant with admin access
- Application admin user

## Step-by-Step Configuration

### 1. Access Okta Admin

1. Go to your Okta admin dashboard
2. Navigate to Applications → Applications

### 2. Create SAML Application

1. Click "Create App Integration"
2. Choose "SAML 2.0"
3. Fill in:
   - App name: "Your App Name"
   - Choose "This is an internal app that we host"

### 3. Configure SAML

In "General" tab, fill:

**Single sign-on URL:**
https://yourapp.com/auth/saml/acs

**Audience URI (SP Entity ID):**
https://yourapp.com

**Default Relay State:**
https://yourapp.com/dashboard

**Name ID format:**
EmailAddress

**Assertion Encryption:**
Encrypt assertion (recommended)

### 4. Configure Attribute Statements

Add attributes:
- Name: email, Value: user.email
- Name: first_name, Value: user.firstName
- Name: last_name, Value: user.lastName
- Name: groups, Value: user.groups

### 5. Upload SP Certificate

1. Go to "Signing Credentials"
2. Upload your SP certificate
3. Download Okta's signing certificate
4. Save as: ./certificates/idp-public-certs/okta.crt

### 6. Assign Users/Groups

1. Go to "Assignments"
2. Assign users or groups to the application
3. Users will now see the app in their Okta portal

### 7. Configuration File

\`\`\`env
OKTA_DOMAIN=dev-12345.okta.com
OKTA_APP_ID=exk1a2b3c4d5e6f7g
OKTA_ENTITY_ID=https://dev-12345.okta.com
OKTA_SSO_URL=https://dev-12345.okta.com/app/amazon_aws/exk1a2b3c4d5e6f7g/sso/saml
OKTA_CERT_PATH=./certificates/idp-public-certs/okta.crt
\`\`\`

### 8. Test

1. In Okta admin, go to the app
2. Click "Preview the app"
3. Sign in with your Okta account
4. Verify successful authentication
`;
