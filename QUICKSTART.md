# Quick Start

Puesta en marcha del Service Provider SAML en local.

### Paso 1: Instalación de Dependencias

```bash
cd SAMLvmDev

# Instalar dependencias
npm install

# (Esto descarga: Fastify, SAML libraries, Redis client, tipos, etc.)
```

### Paso 2: Generar Certificados SP

```bash
# Para desarrollo (self-signed):
mkdir -p certificates
npm run generate:certs

# Para producción:
# Obtener certificado válido de CA y colocar en:
# - certificates/sp.crt
# - certificates/sp.key
```

### Paso 3: Configurar Variables de Entorno

```bash
# Copiar template
cp .env.example .env.local

# Editar .env.local (mínimo necesario):
cat > .env.local << 'EOF'
NODE_ENV=development
PORT=3000
SAML_SP_ENTITY_ID=https://localhost:3000
SAML_SP_ACS_URL=https://localhost:3000/auth/saml/acs
REDIS_HOST=localhost
REDIS_PORT=6379
SESSION_SECRET=dev-secret-key
CLOCK_SKEW_TOLERANCE=60
EOF
```

### Paso 4: Iniciar Redis

```bash
# Opción A: Docker
docker run -d -p 6379:6379 redis:7-alpine

# Opción B: Instalado localmente
redis-server

# Opción C: docker-compose (con DB incluida)
docker-compose up -d redis postgres
```

### Paso 5: Iniciar Servidor

```bash
npm run dev

# Output esperado:
# [10:30:45] INFO: Server running at https://localhost:3000
# [10:30:45] INFO: SAML endpoints ready at /auth/saml/*
```

Endpoints disponibles:
- `GET /auth/saml/metadata` - Metadata SAML del SP
- `GET /auth/saml/login-options` - IdP disponibles
- `GET /health` - Health check

---

## Integrar el primer IdP (Azure AD)

### 1. Registrar App en Azure AD

```
1. Ir a: Azure Portal → Azure Active Directory
2. Apps → App registrations → New registration
3. Name: "My SAML App"
4. Redirect URI: https://localhost:3000/auth/saml/acs
5. Click Register
```

### 2. Configurar SAML

```
1. En tu app → Single sign-on → SAML
2. Basic SAML Configuration:
   - Identifier: https://localhost:3000
   - Reply URL: https://localhost:3000/auth/saml/acs
   - Sign-on URL: https://localhost:3000/auth/saml/login?idp=azure-ad
3. Save
```

### 3. Descargar Certificado

```
1. SAML Signing Certificate → Download "Certificate (Base64)"
2. Guardar como: ./certificates/idp-public-certs/azure-ad.crt
```

### 4. Actualizar .env

```bash
cat >> .env.local << 'EOF'
AZURE_AD_TENANT_ID=xxxxx-xxxxx-xxxxx
AZURE_AD_ENTITY_ID=https://sts.windows.net/xxxxx-xxxxx-xxxxx/
AZURE_AD_SSO_URL=https://login.microsoftonline.com/xxxxx-xxxxx-xxxxx/saml2
EOF
```

### 5. Probar Login

```
URL: https://localhost:3000/auth/saml/login?idp=azure-ad

Debería:
1. Redireccionar a Azure AD
2. Autenticarte con tu cuenta
3. Volver a tu app
4. Crear sesión segura
```

---

## Testing rápido (sin IdP real)

# Respuesta esperada:
# {
#   "idps": ["azure-ad", "okta", "google-workspace", "onelogin", "pingidentity"],
#   "loginUrl": "/auth/saml/login"
# }
```

---

## Documentación

| Necesitas | Ir a |
|-----------|------|
| Cómo funciona SAML | [ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Integrar otro IdP | [README.md](README.md) |
| Deploy a producción | [README.md](README.md) |

---

## Verificar que todo funciona

```bash
# 1. Verificar que el servidor está corriendo
curl https://localhost:3000/health

# 2. Obtener metadata SP
curl https://localhost:3000/auth/saml/metadata

# 3. Listar IdP disponibles
curl https://localhost:3000/auth/saml/login-options

# 4. Revisar logs
tail -f logs/app.log
```

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| `Port 3000 already in use` | Cambiar `PORT=3001` en .env |
| `Redis connection refused` | Ejecutar `docker run -d -p 6379:6379 redis:7` |
| `Certificate not found` | Ejecutar `npm run generate:certs` |
| `Invalid IdP config` | Verificar certificado IdP en ruta correcta |
| `Clock skew error` | Sincronizar reloj: `timedatectl status` |

---

## Próximos pasos

1. [ ] Terminar la integración con Azure AD / Okta
2. [ ] Hacer el primer login real
3. [ ] Revisar los logs de auditoría
4. [ ] Configurar PostgreSQL
5. [ ] Integrar un segundo IdP

---

## Comandos útiles

```bash
# Desarrollar
npm run dev

# Compilar
npm run build

# Testing
npm test

# Linting
npm run lint

# Ver estructura
tree -I 'node_modules|dist|coverage' src

# Generar certificados nuevos
rm -rf certificates/*
npm run generate:certs
```

### Archivos Clave

- **main.ts** - Entry point
- **src/infrastructure/saml/SAMLAdapter.ts** - Core SAML
- **src/interfaces/http/controllers/AuthController.ts** - Endpoints
- **src/infrastructure/config/idp-configs/** - Configuraciones IdP

---

## Checklist de setup

- [ ] `npm install` completado
- [ ] Certificados generados (`certificates/sp.crt`, `certificates/sp.key`)
- [ ] Redis corriendo
- [ ] `.env.local` configurado
- [ ] `npm run dev` sin errores
- [ ] `https://localhost:3000/health` retorna 200
- [ ] Metadata descargable desde `/auth/saml/metadata`
- [ ] Primer IdP configurado (Azure AD / Okta)
- [ ] Primer login exitoso
- [ ] Sesión activa tras login

---

## Atajos de desarrollo

```bash
# Terminal 1: Redis
docker run -it -p 6379:6379 redis:7

# Terminal 2: App en watch mode
npm run dev

# Terminal 3: Tests
npm test -- --watch

# Terminal 4: Lint
npm run lint -- --watch
```

Ver [ARCHITECTURE.md](docs/ARCHITECTURE.md) para la estructura del proyecto.
