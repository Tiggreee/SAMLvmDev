# Arquitectura

## Diagrama de Flujo SAML

```
┌─────────────────┐
│   User Browser  │
└────────┬────────┘
         │
         │ 1. Click "Login with [IdP]"
         ▼
┌─────────────────────────────┐
│  Your SaaS (Service Provider)│
│  GET /auth/saml/login?idp=  │
│  ├─ Generate SAMLRequest    │
│  ├─ Sign & Encode           │
│  └─ Redirect to IdP SSO URL │
└────────┬────────────────────┘
         │
         │ 2. Redirect with SAMLRequest
         ▼
┌──────────────────────────────┐
│  Identity Provider (IdP)      │
│  Azure AD / Okta / Google... │
│  ├─ Authenticate user        │
│  ├─ Create SAMLResponse      │
│  ├─ Sign & Encrypt           │
│  └─ POST to ACS endpoint     │
└────────┬─────────────────────┘
         │
         │ 3. POST SAMLResponse to ACS
         ▼
┌──────────────────────────────────────┐
│  Your SaaS (ACS - /auth/saml/acs)    │
│  ├─ Receive SAMLResponse             │
│  ├─ Verify Signature (IdP cert)      │
│  ├─ Validate Issuer                  │
│  ├─ Validate Audience                │
│  ├─ Check timestamps (+ clock skew)  │
│  ├─ Extract Attributes               │
│  ├─ Map to User Profile              │
│  ├─ Create/Update User               │
│  ├─ Create Session                   │
│  ├─ Log Audit Event                  │
│  └─ Set Secure Session Cookie        │
└────────┬─────────────────────────────┘
         │
         │ 4. Redirect to Dashboard
         ▼
┌──────────────────────────┐
│  User Authenticated      │
│  Access to Application   │
└──────────────────────────┘
```

## Capas de Arquitectura

### 1. Domain Layer (src/domain/)
**Independiente de frameworks - Pura lógica de negocio**

```
domain/
├── saml/
│   ├── entities/           # Objetos de dominio
│   │   ├── SAMLResponseEntity
│   │   ├── SAMLAssertionEntity
│   │   └── UserProfile
│   │
│   ├── repositories/       # Interfaces (contratos)
│   │   ├── ISAMLConfigRepository
│   │   ├── ISessionRepository
│   │   └── IAuditLogRepository
│   │
│   ├── usecases/           # Casos de uso
│   │   ├── InitiateSSOLogin
│   │   ├── ProcessSAMLResponse
│   │   ├── GenerateMetadata
│   │   ├── ValidateSAMLAssertion
│   │   └── LogoutUser
│   │
│   └── exceptions/         # Excepciones de dominio
│       ├── InvalidSAMLResponseException
│       ├── InvalidSignatureException
│       └── ClockSkewException
```

**Características:**
- Sin dependencias externas
- Validaciones de negocio
- Reglas SAML puras

### 2. Application Layer (src/application/)
**Orquestación de casos de uso**

```
application/
├── services/               # Orquestadores
│   ├── SSOAuthenticationService
│   ├── SAMLValidationService
│   ├── SAMLMetadataService
│   └── AuditService
│
├── dtos/                   # Data Transfer Objects
│   ├── LoginRequestDTO
│   ├── SAMLResponseDTO
│   └── UserProfileDTO
│
└── mappers/                # Transformaciones
    └── SAMLAttributeMapper
```

**Características:**
- Conecta dominio con infraestructura
- Transacciones
- Validaciones de aplicación

### 3. Infrastructure Layer (src/infrastructure/)
**Implementaciones técnicas específicas**

```
infrastructure/
├── saml/
│   ├── SAMLAdapter.ts      # Wrapper de passport-saml + samlify
│   ├── MetadataGenerator.ts
│   ├── SignatureValidator.ts
│   └── AssertionProcessor.ts
│
├── certificate/
│   ├── CertificateManager.ts
│   ├── CertificateRotationService.ts
│   └── KeyRotationService.ts
│
├── persistence/
│   ├── repositories/       # Implementaciones reales
│   │   ├── SAMLConfigRepository (SQL)
│   │   ├── SessionRepository (Redis)
│   │   └── AuditLogRepository (TimescaleDB)
│   │
│   └── database/
│       └── models/         # Schemas
│
├── config/
│   ├── idp-configs/        # Templates de IdP
│   │   ├── azure-ad.config.ts
│   │   ├── okta.config.ts
│   │   └── ...
│   │
│   └── saml-settings.ts
│
└── logger/
    └── AuditLogger.ts
```

**Características:**
- Implementaciones específicas
- Integración con BD
- Herramientas externas

### 4. Interfaces Layer (src/interfaces/)
**HTTP Controllers & Middleware**

```
interfaces/
├── http/
│   ├── controllers/
│   │   └── AuthController.ts
│   │
│   └── routes/
│       └── authRoutes.ts
│
└── middleware/
    ├── SAMLValidationMiddleware.ts
    ├── SessionMiddleware.ts
    ├── ErrorHandlingMiddleware.ts
    └── AuditMiddleware.ts
```

**Características:**
- Endpoints REST
- Validación de entrada
- Manejo de errores HTTP

## Flujo de Validación SAML Rigurosa

```typescript
// En ProcessSAMLResponse Use Case

async execute(samlResponse, idpName, ipAddress, userAgent) {
  
  // 1. Obtener config IdP
  const idpConfig = await this.configRepository.getByIdP(idpName);
  
  // 2. Decodificar SAML Response
  const samlResponse = decode(encodedSAMLResponse);
  
  // 3. Validar firma con certificado del IdP
  if (!validateSignature(samlResponse, idpConfig.certificate)) {
    throw InvalidSignatureException();
  }
  
  // 4. Validar Issuer
  if (samlResponse.issuer !== idpConfig.entityID) {
    throw InvalidIssuerException();
  }
  
  // 5. Validar Audience
  if (samlResponse.audience !== process.env.SAML_SP_ENTITY_ID) {
    throw InvalidAudienceException();
  }
  
  // 6. Validar Timestamps con Clock Skew
  const clockSkew = 60; // segundos (configurable)
  const now = Date.now();
  
  if (now < assertion.notBefore - clockSkew) {
    throw AssertionNotYetValidException();
  }
  
  if (now > assertion.notOnOrAfter + clockSkew) {
    throw AssertionExpiredException();
  }
  
  // 7. Extraer atributos
  const attributes = mapAttributes(samlResponse);
  
  // 8. Validar atributos esenciales
  if (!attributes.email) {
    throw InvalidAssertionException("Email attribute required");
  }
  
  // 9. Crear/actualizar usuario
  const user = await createOrUpdateUser(attributes);
  
  // 10. Crear sesión segura
  const session = await createSession(user, idpName);
  
  // 11. Log de auditoría
  await logLoginSuccess(user.email, idpName, ipAddress);
  
  return { sessionId: session.id, userId: user.id, attributes };
}
```

## Mecanismos de Seguridad

### 1. Firma de SAML Requests
```
POST /auth/saml/login?idp=azure-ad
→ Genera SAMLRequest
→ Firma con clave privada SP
→ Codifica en Base64
→ Redirige a IdP con SAMLRequest firmado
```

### 2. Validación de SAML Response
```
IdP POST SAMLResponse
→ Validar firma con cert público del IdP
→ Validar no-malleability (no puede ser modificado)
→ Validar timestamps contra reloj del servidor
→ Validar issuer vs IdP conocido
→ Validar audience vs SP Entity ID
→ Validar subject confirmation recipient
```

### 3. Clock Skew Handling
```
Server Time: 10:00:00
Assertion NotBefore: 10:00:30 (30 segundos en el futuro)
Clock Skew Tolerance: 60 segundos

VÁLIDO (dentro de tolerancia)

Si skew > 60 segundos → RECHAZO
```

### 4. Cookies Seguras
```
Set-Cookie: sessionId=abc123; 
  HttpOnly;                    // No accesible desde JavaScript
  Secure;                      // Solo HTTPS
  SameSite=Strict;            // No enviar en cross-site requests
  Max-Age=86400;              // 24 horas
  Path=/;
  Domain=yourdomain.com;
```

### 5. Session Management
```
Session almacenada en Redis
├─ Clave: session:{sessionId}
├─ TTL: 24 horas (renovable)
└─ Contenido encriptado

Validaciones por request:
├─ Session existe
├─ No expirada
├─ IP del cliente sin cambios (opcional)
├─ User-Agent sin cambios (opcional)
└─ Renovar TTL (sliding window)
```

## Mapeo de Atributos por IdP

### Azure AD
```
Attribute SAML              → App Attribute
emailaddress               → email
givenname                  → givenName
surname                    → surname
http://schemas.xmlsoap.org/claims/Group → groups
```

### Okta
```
Attribute SAML              → App Attribute
email                      → email
firstName                  → givenName
lastName                   → surname
groups                     → groups
```

### Google Workspace
```
Attribute SAML              → App Attribute
email                      → email
firstName                  → givenName
lastName                   → surname
title                      → jobTitle
```

## Rotación de Certificados

### Flujo Automático
```
Cron job cada 24 horas:
  1. Verificar expiración de SP cert
  2. Si faltan <90 días:
     ├─ Generar nuevo par RSA 2048-bit
     ├─ Hacer backup del viejo
     ├─ Guardar nuevo en almacenamiento seguro
     └─ Log de auditoría
  3. Notificar a clientes si cambio importante
  4. Actualizar metadata si sea necesario
```

## Checklist de Deployment Seguro

- [ ] HTTPS habilitado en todos endpoints
- [ ] Certificados X.509 válidos (no autofirmados en prod)
- [ ] Variables de entorno configuradas
- [ ] BD configurada y accesible
- [ ] Redis configurado para sesiones
- [ ] Audit logs configurado
- [ ] CORS correctamente restringido
- [ ] Rate limiting activado
- [ ] Logs monitoreados
- [ ] Certificados de IdP verificados
- [ ] Metadata descargada de cada IdP
- [ ] Clock sincronizado con NTP
- [ ] Backup de certificados privados
- [ ] Rotación de certificados programada
- [ ] Alertas de login fallidos
- [ ] Alertas de certificados próximos a expirar
