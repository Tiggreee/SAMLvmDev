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

### Compatibilidad de rutas
- El contrato canónico es `/saml/*` (`/saml/metadata`, `/saml/acs`, `/saml/slo`, `/saml/login`, `/saml/login-options`, `/saml/status`).
- Se mantienen alias `/auth/saml/*` apuntando a los mismos handlers para no romper integraciones previas.
- Los alias `/auth/saml/*` quedan deprecados y podrán retirarse en una versión mayor futura.

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

## Dominios y subdominios

Arquitectura de subdominios sobre `tigrelabs.xyz`. Separa la superficie de
producto (el gateway SAML) de las superficies legales y operativas, de modo que
cada documento de cumplimiento tenga una URL estable y citable.

| Subdominio | Propósito | Destino |
|------------|-----------|---------|
| `sso.tigrelabs.xyz` | Gateway SAML (ACS, metadata, login, SLO). Superficie del producto. | Railway (app) |
| `privacy.tigrelabs.xyz` | Aviso de Privacidad (MX) / Privacy Policy (UE/EEUU). | Sitio estático |
| `legal.tigrelabs.xyz` | Hub legal: Términos, DPA, Política de Cookies, sub-encargados. | Sitio estático |
| `trust.tigrelabs.xyz` | Trust Center: postura de seguridad, certificaciones, sub-procesadores. | Sitio estático |
| `status.tigrelabs.xyz` | Estado del servicio y disponibilidad (transparencia de SLA). | Página de estado |
| `docs.tigrelabs.xyz` | Documentación de integración. | Sitio estático |

Notas:
- El gateway (`sso`) es la única superficie que procesa datos personales.
- Los subdominios legales sirven contenido estático; pueden alojarse aparte del
  runtime del gateway para reducir su superficie de ataque.
- El registro DNS del gateway es un `CNAME` al dominio que entrega Railway al
  añadir el dominio personalizado (ver Despliegue → Railway).

## Cumplimiento y aspectos legales

El gateway actúa como **encargado del tratamiento** (data processor): procesa
atributos de identidad (correo, nombre, identificadores del IdP) por cuenta de la
organización cliente, que es la **responsable** (data controller). Esta sección
es un mapa de referencia; no sustituye asesoría legal.

Regímenes aplicables según la ubicación de los titulares de los datos:

- **México — Ley Federal de Protección de Datos Personales en Posesión de los
  Particulares** (marco vigente tras la reforma de 2025). Exige **Aviso de
  Privacidad**, base de licitud/consentimiento y derechos **ARCO** (Acceso,
  Rectificación, Cancelación, Oposición).
- **Unión Europea — GDPR**. Exige base de licitud, **Acuerdo de Encargo (DPA)**
  con el responsable, derechos del titular, lista de sub-encargados, contacto de
  privacidad y notificación de brechas (72 h).
- **California — CCPA/CPRA**. Derechos del consumidor y transparencia sobre
  compartición de datos.
- **Enterprise readiness** — controles alineados a **SOC 2** e **ISO/IEC 27001**,
  habitualmente requeridos por compradores corporativos.

Documentos legales mínimos a publicar (en los subdominios anteriores):
- Aviso de Privacidad / Privacy Policy (`privacy`).
- Términos del Servicio y Data Processing Agreement (`legal`).
- Política de Cookies y lista de sub-encargados (`legal` / `trust`).

## Despliegue

### Railway

Railway hospeda el gateway como contenedor y termina el TLS en su edge (no se
necesita Caddy en este modo). El repositorio incluye `railway.json`, que indica
a Railway construir con el `Dockerfile` y usar `/health` como healthcheck.

1. Crear el proyecto en Railway y desplegar desde este repositorio (o imagen
   Docker). Railway detecta `railway.json` y construye con el `Dockerfile`.
2. Añadir servicios gestionados **PostgreSQL** y **Redis** al proyecto.
3. Configurar variables de entorno del servicio de la app:
   - `NODE_ENV=production`
   - `SESSION_SECRET` (32+ caracteres)
   - `DATABASE_URL` → referencia a la Postgres de Railway
   - `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` → referencias a la Redis de Railway
   - `SAML_SP_ENTITY_ID=https://sso.tigrelabs.xyz`
   - `SAML_SP_ACS_URL=https://sso.tigrelabs.xyz/saml/acs`
   - `SAML_SP_SLO_URL=https://sso.tigrelabs.xyz/saml/slo`
   - `HTTPS_ONLY=true`
   - `OIN_TEST_MODE=false`
   Railway inyecta `PORT` automáticamente; la app lo respeta.
4. En **Settings → Networking → Custom Domain**, añadir `sso.tigrelabs.xyz`.
   Railway entrega un destino `CNAME`.
5. En Namecheap (Advanced DNS) crear el registro:
   `Type=CNAME  Host=sso  Value=<destino-de-railway>  TTL=Automatic`.
6. Esperar la propagación y la emisión del certificado TLS por Railway.

### Local
```bash
npm run dev
# https://localhost:3000
```

### Docker (self-hosted con reverse proxy)
```bash
# Requiere PUBLIC_DOMAIN con DNS apuntando al host; Caddy emite el TLS.
docker compose up -d
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
