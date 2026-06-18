# SAML 2.0 Service Provider (SP) – Node.js

Implementación de un Service Provider (SP) SAML 2.0 en Node.js, compatible con proveedores de identidad empresariales como Azure AD, Google Workspace, Okta, Auth0 y Keycloak.  
El objetivo es ofrecer una base sólida, modular y lista para producción para integraciones SSO corporativas.

---

## Objetivos

- Implementar un SP SAML 2.0 real y conforme a la especificación.
- Mantener una arquitectura clara, predecible y fácil de extender.
- Permitir configuraciones por cliente (multi‑tenant opcional).
- Servir como base para un producto comercial o integración empresarial.
- Cumplir estándares de calidad para ecosistemas profesionales.

---

## Estructura del proyecto

```bash
/src
  /config
    saml.js
    tenants.js
  /controllers
    auth.controller.js
  /routes
    auth.routes.js
  /services
    saml.service.js
  /utils
    xml.js
    certificates.js
app.js
server.js
