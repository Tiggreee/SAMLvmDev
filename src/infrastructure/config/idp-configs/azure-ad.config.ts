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

export const AZURE_AD_SETUP_GUIDE = `
# Azure AD / Entra ID SAML SSO Setup

## Prerequisites
- Azure AD tenant with admin access
- Application already created or ready to create

## Step-by-Step Configuration

### 1. Register Application in Azure AD

1. Go to Azure Portal → Azure Active Directory
2. Click "App registrations" → "New registration"
3. Fill in:
   - Name: "Your App Name"
   - Supported account types: Choose based on your needs
   - Redirect URI: https://yourapp.com/auth/saml/acs

### 2. Configure SAML

1. Go to "Certificates & secrets"
2. Upload your SP certificate (from /auth/saml/metadata)
3. In "Enterprise applications" → Your App
4. Go to "Single sign-on"
5. Choose "SAML"
6. In Basic SAML Configuration:

   **Identifier (Entity ID):**
   https://yourapp.com

   **Reply URL (Assertion Consumer Service URL):**
   https://yourapp.com/auth/saml/acs

   **Sign-on URL:**
   https://yourapp.com/auth/saml/login?idp=azure-ad

   **Logout URL:**
   https://yourapp.com/auth/saml/logout

### 3. Download Certificate

1. In "SAML Signing Certificate" section
2. Download the "Certificate (Base64)"
3. Save as: ./certificates/idp-public-certs/azure-ad.crt

### 4. Configure Attributes & Claims

Edit claims:
- Unique User Identifier (Name ID): user.userPrincipalName
- Email: user.mail
- Given Name: user.givenname
- Surname: user.surname
- Groups: user.groups (if using group-based access)

### 5. Test

1. Click "Test this SAML configuration"
2. Sign in with your Azure AD account
3. Verify you see your attributes in the response

### 6. Configuration File

Update your IdP config:

\`\`\`env
AZURE_AD_TENANT_ID=your-tenant-id
AZURE_AD_APP_ID=your-app-id
AZURE_AD_ENTITY_ID=https://sts.windows.net/your-tenant-id/
AZURE_AD_SSO_URL=https://login.microsoftonline.com/your-tenant-id/saml2
AZURE_AD_CERT_PATH=./certificates/idp-public-certs/azure-ad.crt
\`\`\`
`;
