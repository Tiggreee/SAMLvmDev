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

export const GOOGLE_WORKSPACE_SETUP_GUIDE = `
# Google Workspace SAML SSO Setup

## Prerequisites
- Google Workspace admin account
- Admin console access
- Custom domain configured in Google Workspace

## Step-by-Step Configuration

### 1. Access Google Admin Console

1. Go to admin.google.com
2. Login with your Google Workspace admin account
3. Go to Security → Authentication (on left menu)
4. Click "Set up single sign-on (SSO) with third-party IdP"

### 2. Configure SAML Application

In Google Admin:

**Sign-in page URL:**
https://accounts.google.com/o/saml2/idp?idpid=your-idp-id

**Certificate:**
Download Google's public certificate

**Service Provider Details:**
Click "Download Service Provider metadata" and upload to your app

### 3. Generate Your SP Metadata

1. Download your SP metadata:
   https://yourapp.com/auth/saml/metadata

2. Upload it to Google Workspace

### 4. Configure Attributes

In your app, ensure these attributes are mapped:
- Email: user.email
- First Name: user.firstName
- Last Name: user.lastName

### 5. Download Google's Certificate

1. In Google Admin, download the public certificate
2. Save as: ./certificates/idp-public-certs/google-workspace.crt

### 6. Configuration File

\`\`\`env
GOOGLE_WORKSPACE_ENTITY_ID=https://accounts.google.com/o/saml2/idp?idpid=your-idp-id
GOOGLE_WORKSPACE_SSO_URL=https://accounts.google.com/o/saml2/idp?idpid=your-idp-id
GOOGLE_WORKSPACE_CERT_PATH=./certificates/idp-public-certs/google-workspace.crt
\`\`\`

### 7. Test

1. Have a Google Workspace user try to log in
2. Verify successful authentication
3. Check that email and name attributes are mapped correctly

## Important Notes

- Google Workspace uses EmailAddress as NameID format
- Ensure your custom domain is verified in Google Workspace
- Users must be assigned to the SAML application in the admin console
`;
