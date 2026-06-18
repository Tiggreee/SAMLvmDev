# SAML 2.0 Service Provider

Service Provider SAML 2.0 para Single Sign-On corporativo. Implementa el flujo
SP-initiated, validación de aserciones, gestión de certificados X.509 y registro
de eventos de autenticación.

## Alcance

- SAML 2.0 como Service Provider conforme a la especificación OASIS.
- Validación de firma, issuer, audience, condiciones temporales y clock skew.
- Sesiones con cookies HTTPOnly y almacenamiento en Redis.
- Certificados X.509 (RSA 2048) con soporte de rotación.
- Registro de eventos de autenticación.
- Integración con Azure AD, Okta, Google Workspace, OneLogin y PingIdentity.

## Stack

| Capa | Tecnología |
|------|------------|
| Runtime | Node.js 18+ |
| Lenguaje | TypeScript 5.x |
| HTTP | Fastify 4.x |
| SAML | samlify |
| Sesiones | Redis |
| Persistencia | PostgreSQL |
| Logging | Pino |
| Arquitectura | Capas (domain / application / infrastructure / interfaces) |

## Estructura del proyecto

```
SAMLvmDev/
├── src/
│   ├── domain/              # Lógica de negocio pura
│   ├── application/         # Orquestación
│   ├── infrastructure/      # Implementaciones técnicas
│   ├── interfaces/          # HTTP controllers & routes
│   ├── shared/              # Tipos y utilidades
│   ├── bootstrap.ts         # Configuración Fastify
│   └── main.ts              # Entry point
│
├── config/                  # Configuración
├── certificates/            # Almacén de certificados (NO en git)
├── docs/                    # Documentación
├── tests/                   # Suite de tests
└── package.json

```

## Instalación

### Requisitos previos
- Node.js 18.x o superior
- npm 9.x o superior
- Redis (para sesiones)
- PostgreSQL 12+ (opcional; en desarrollo se usa un mock)

### Pasos

```bash
# 1. Clonar repositorio
cd SAMLvmDev

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local

# 4. Generar certificados SP (para desarrollo)
npm run generate:certs

# 5. Iniciar servidor en desarrollo
npm run dev

# 6. Compilar para producción
npm run build

# 7. Iniciar en producción
npm start
```

### Configuración inicial (.env)

```env
# Server
NODE_ENV=development
PORT=3000
HOST=localhost
PROTOCOL=https

# SAML SP
SAML_SP_ENTITY_ID=https://localhost:3000
SAML_SP_ACS_URL=https://localhost:3000/auth/saml/acs
SAML_SP_CERT_PATH=./certificates/sp.crt
SAML_SP_KEY_PATH=./certificates/sp.key

# Session
SESSION_SECRET=dev-secret-change-in-production
SESSION_TTL=86400

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# IdP Specific (rellenar con tus datos)
AZURE_AD_TENANT_ID=your-tenant-id
OKTA_DOMAIN=your-domain.okta.com
```

---

## Endpoints SAML

### GET /saml/metadata
Entrega el XML de configuración del SP para que el IdP pueda integrarse.

### POST /saml/acs
Assertion Consumer Service.
Recibe el SAMLResponse, valida firma, condiciones y atributos, y establece sesión.

### GET /saml/slo
Single Logout opcional.

### Estado actual del código
- Implementado hoy bajo prefijo /auth/saml/*.
- Existe metadata y ACS en /auth/saml/metadata y /auth/saml/acs.
- El flujo de logout actual usa POST /auth/saml/logout.
- Si quieres enforcing estricto en /saml/*, la siguiente iteración es crear alias /saml/metadata, /saml/acs y /saml/slo y deprecación gradual de /auth/saml/*.

## Flujo SAML soportado

1. El usuario accede a un recurso protegido.
2. El SP redirige al IdP con una AuthnRequest.
3. El IdP autentica al usuario.
4. El IdP envía un SAMLResponse firmado al ACS.
5. El SP valida la respuesta y crea sesión.
6. El usuario accede a la aplicación autenticado.

## Configuración

Variables de entorno requeridas:

```bash
SP_ENTITY_ID=
SP_ASSERTION_CONSUMER_SERVICE=
SP_SINGLE_LOGOUT_SERVICE=
SP_PRIVATE_KEY_PATH=
SP_CERTIFICATE_PATH=

IDP_ENTITY_ID=
IDP_SSO_URL=
IDP_SLO_URL=
IDP_CERTIFICATE_PATH=
```

Nota: el proyecto hoy usa nombres SAML_SP_* y por proveedor (AZURE_AD_*, OKTA_*). Se incluyen alias sugeridos en .env.example para converger.

## Integración con proveedores de identidad

### Azure AD
- Crear una Enterprise Application.
- Activar SAML.
- Configurar Entity ID y ACS.
- Descargar certificado y URL de SSO.
- Cargar el metadata del SP.

### Google Workspace
- Crear una aplicación SAML personalizada.
- Configurar ACS y Entity ID.
- Subir el certificado del SP.

### Okta
- Crear una integración SAML.
- Configurar Single Sign-On URL y Audience URI.
- Descargar certificado y endpoints del IdP.

## Reglas de arquitectura

Estas reglas definen cómo debe evolucionar el proyecto y evitan cambios no deseados.

### Permitido
- Extender lógica dentro de /controllers, /services, /routes y /utils.
- Crear funciones auxiliares relacionadas con XML, certificados o validaciones.
- Agregar pruebas unitarias o de integración.

### No permitido
- Crear rutas fuera del prefijo /saml/* sin autorización explícita.
- Modificar app.js o server.js sin instrucción directa.
- Alterar la estructura de carpetas definida.
- Introducir dependencias no relacionadas con HTTP, seguridad o SAML.

## Inicio rápido

```bash
npm install
npm run dev
```

Asegúrate de configurar las variables de entorno y certificados antes de iniciar el flujo SAML.

## Ejemplo de integración: Azure AD

1. Obtener el metadata del SP:
   ```
   GET https://yourapp.com/auth/saml/metadata
   ```

2. Registrar la aplicación en Azure AD:
   - Azure Portal → App registrations → New registration
   - Redirect URI: `https://yourapp.com/auth/saml/acs`

3. Configurar SAML (Single sign-on → SAML):
   - Identifier: `https://yourapp.com`
   - Reply URL: `https://yourapp.com/auth/saml/acs`
   - Sign-on URL: `https://yourapp.com/auth/saml/login?idp=azure-ad`

4. Descargar el certificado de firma (Base64) y guardarlo en
   `./certificates/idp-public-certs/azure-ad.crt`.

5. Definir las variables del proveedor:
   ```env
   AZURE_AD_TENANT_ID=xxxx-xxxx-xxxx
   AZURE_AD_ENTITY_ID=https://sts.windows.net/{tenant-id}/
   AZURE_AD_SSO_URL=https://login.microsoftonline.com/{tenant-id}/saml2
   ```

6. Iniciar el flujo:
   ```
   https://yourapp.com/auth/saml/login?idp=azure-ad
   ```

Las guías por proveedor se encuentran en `docs/idp-guides/`.

## Testing

```bash
# Tests unitarios
npm test

# Tests de integración
npm run test:integration

# Tests end-to-end
npm run test:e2e

# Cobertura
npm run test:coverage
```

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Diseño técnico |
| [Guías IdP](docs/idp-guides/) | Configuración por proveedor |

## Desarrollo

### Herramientas
```bash
npm install -g typescript ts-node

# Lint
npm run lint

# Formato
npm run format

# Type checking
npm run typecheck
```

### Estructura modular

```
src/domain/              ← Entidades y casos de uso
src/application/         ← Servicios
src/infrastructure/      ← Implementaciones técnicas
src/interfaces/          ← Endpoints HTTP
src/shared/              ← Tipos compartidos
```

### Agregar un nuevo IdP

1. Crear configuración:
   ```typescript
   // src/infrastructure/config/idp-configs/newprovider.config.ts
   export function createNewProviderConfig(): IdPConfig { ... }
   ```

2. Registrar en main.ts:
   ```typescript
   const config = createNewProviderConfig();
   await samlConfigRepo.save(config);
   samlAdapter.registerIdP(config);
   ```

3. Documentar el setup en docs/idp-guides/

## Despliegue

### Local
```bash
npm run dev
# https://localhost:3000
```

### Docker
```bash
docker build -t saml-sp .

docker run -p 3000:3000 \
  -e SAML_SP_ENTITY_ID=https://app.example.com \
  -e REDIS_HOST=redis-server \
  -v ./certificates:/app/certificates \
  saml-sp
```

### Verificaciones para producción
- [ ] HTTPS con certificado válido (no self-signed)
- [ ] PostgreSQL persistente
- [ ] Redis con persistencia
- [ ] Respaldo de base de datos y logs
- [ ] Monitoreo de disponibilidad
- [ ] Pipeline de CI/CD

## Resolución de problemas

**Login falla con "Invalid Signature"**
- Verificar la ruta del certificado del IdP.
- Confirmar que el certificado no ha expirado.

**Los atributos no se mapean**
- Revisar `attributeMapping` en la configuración del IdP.
- Comprobar el nombre del atributo en el SAMLResponse.

**Errores de clock skew**
- Sincronizar el reloj del servidor con NTP.
- Ajustar `CLOCK_SKEW_TOLERANCE` si es necesario.

## Roadmap

- [ ] Encriptación de aserciones
- [ ] Single Logout (SLO) completo
- [ ] Mapeo dinámico de atributos por usuario
- [ ] Integración MFA
- [ ] API de administración
- [ ] Configuración multi-tenant

## Licencia

MIT. Ver [LICENSE](LICENSE).
