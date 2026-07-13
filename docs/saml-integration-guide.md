# SAMLvmDev SAML 2.0 Integration Guide

## Overview
This guide provides step-by-step instructions for configuring SAMLvmDev as a SAML 2.0 Service Provider (SP) with your identity provider.

## Prerequisites
- Administrator access to your identity provider
- Access to SAMLvmDev tenant

## Configuration Steps

### 1. Create SAML Application
In your identity provider, create a new SAML 2.0 application integration.

### 2. Configure Endpoints
Set the following endpoints:
- **Single Sign-On (SSO) URL / ACS URL**: `https://your-instance.example.com/saml/acs`
- **Entity ID (Audience URI)**: `https://your-instance.example.com`
- **Name ID Format**: EmailAddress
- **Application Username**: User email

### 3. Configure Attribute Mapping
Map the email attribute from your identity provider:
- **SAML Attribute Name**: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`
- **User Profile Value**: `user.email` or equivalent in your IdP

### 4. Obtain Identity Provider Metadata
Download or retrieve:
- SAML 2.0 metadata XML file, or
- Certificate (public key)
- Single Sign-On URL
- Entity ID / Issuer

### 5. Assign Users
Assign users or groups from your identity provider to the SAMLvmDev application.

### 6. Test Integration

#### Service Provider Initiated Flow
1. Navigate to: `https://your-instance.example.com/saml/login?idp={idp-name}`
2. You will be redirected to your identity provider login
3. Authenticate with your credentials
4. Upon success, you will be redirected back to SAMLvmDev with an active session

#### Identity Provider Initiated Flow
1. In your identity provider dashboard, locate the SAMLvmDev application tile
2. Click to launch
3. You will be automatically authenticated in SAMLvmDev

## Troubleshooting

### Common Issues
- **"Invalid Audience"**: Verify Entity ID matches configured value
- **"Signature invalid"**: Ensure certificate is current and properly configured
- **"Email attribute missing"**: Verify attribute statement is mapped correctly
- **"ACS URL mismatch"**: Confirm ACS endpoint is exactly as registered

### Support
For integration assistance, contact: hola@tigrelabs.xyz

## References
- [OASIS SAML 2.0 Specification](https://wiki.oasis-open.org/security)
- [Identity Provider Documentation](https://developer.okta.com)
