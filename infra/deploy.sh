#!/usr/bin/env bash
#
# Despliegue de vmDev (SAML SSO gateway) a Azure Container Apps.
#
# Crea toda la infraestructura y publica la app en un solo comando. Usa
# `az acr build` para construir la imagen Docker EN Azure (no requiere Docker
# local). Idempotente: puede re-ejecutarse; los recursos existentes se reutilizan.
#
# Requisitos:
#   - Azure CLI (`az`) instalada y sesión iniciada (`az login`).
#   - Una suscripción activa (free trial $200 o Founders Hub).
#
# Uso:
#   SESSION_SECRET=... ADMIN_API_KEY=... PG_ADMIN_PASSWORD=... ./infra/deploy.sh
#
# Variables opcionales: LOCATION, NAME_PREFIX, PUBLIC_DOMAIN.

set -euo pipefail

# --- Configuración -----------------------------------------------------------
LOCATION="${LOCATION:-eastus}"
NAME_PREFIX="${NAME_PREFIX:-vmdev}"
RG="${NAME_PREFIX}-rg"
ACR="${NAME_PREFIX}acr$RANDOM"
ENV_NAME="${NAME_PREFIX}-env"
APP_NAME="${NAME_PREFIX}-sso"
PG_SERVER="${NAME_PREFIX}-pg-$RANDOM"
PG_DB="saml_sso"
PG_ADMIN_USER="samladmin"
REDIS_NAME="${NAME_PREFIX}-redis-$RANDOM"
IMAGE_TAG="${APP_NAME}:$(date +%Y%m%d%H%M%S)"

# --- Secretos (obligatorios) -------------------------------------------------
: "${SESSION_SECRET:?Define SESSION_SECRET (32+ caracteres)}"
: "${ADMIN_API_KEY:?Define ADMIN_API_KEY (24+ caracteres)}"
: "${PG_ADMIN_PASSWORD:?Define PG_ADMIN_PASSWORD (12+ caracteres, complejo)}"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-}"

echo "==> Suscripción activa:"
az account show --query "{name:name, id:id}" -o table

# --- 1. Resource group -------------------------------------------------------
echo "==> Resource group: $RG"
az group create -n "$RG" -l "$LOCATION" -o none

# --- 2. Container Registry + build de la imagen en la nube -------------------
echo "==> Container Registry: $ACR"
az acr create -n "$ACR" -g "$RG" --sku Basic --admin-enabled true -o none
echo "==> Construyendo imagen en Azure (az acr build)…"
az acr build -r "$ACR" -t "$IMAGE_TAG" -f Dockerfile . -o none
ACR_SERVER=$(az acr show -n "$ACR" -g "$RG" --query loginServer -o tsv)
ACR_USER=$(az acr credential show -n "$ACR" -g "$RG" --query username -o tsv)
ACR_PASS=$(az acr credential show -n "$ACR" -g "$RG" --query "passwords[0].value" -o tsv)

# --- 3. PostgreSQL Flexible Server (Burstable, económico) --------------------
echo "==> PostgreSQL: $PG_SERVER"
az postgres flexible-server create \
  --name "$PG_SERVER" -g "$RG" -l "$LOCATION" \
  --tier Burstable --sku-name Standard_B1ms \
  --storage-size 32 --version 16 \
  --admin-user "$PG_ADMIN_USER" --admin-password "$PG_ADMIN_PASSWORD" \
  --public-access 0.0.0.0-255.255.255.255 \
  --yes -o none
az postgres flexible-server db create -g "$RG" -s "$PG_SERVER" -d "$PG_DB" -o none
PG_HOST=$(az postgres flexible-server show -n "$PG_SERVER" -g "$RG" --query fullyQualifiedDomainName -o tsv)
DATABASE_URL="postgresql://${PG_ADMIN_USER}:${PG_ADMIN_PASSWORD}@${PG_HOST}:5432/${PG_DB}?sslmode=require"

# --- 4. Azure Cache for Redis (Basic C0) ------------------------------------
echo "==> Redis: $REDIS_NAME (puede tardar varios minutos)…"
az redis create -n "$REDIS_NAME" -g "$RG" -l "$LOCATION" \
  --sku Basic --vm-size c0 --minimum-tls-version 1.2 -o none
REDIS_HOST=$(az redis show -n "$REDIS_NAME" -g "$RG" --query hostName -o tsv)
REDIS_KEY=$(az redis list-keys -n "$REDIS_NAME" -g "$RG" --query primaryKey -o tsv)
REDIS_URL="rediss://:${REDIS_KEY}@${REDIS_HOST}:6380/0"

# --- 5. Container Apps environment ------------------------------------------
echo "==> Container Apps environment: $ENV_NAME"
az containerapp env create -n "$ENV_NAME" -g "$RG" -l "$LOCATION" -o none

# --- 6. Container App -------------------------------------------------------
echo "==> Container App: $APP_NAME"
az containerapp create \
  --name "$APP_NAME" -g "$RG" --environment "$ENV_NAME" \
  --image "${ACR_SERVER}/${IMAGE_TAG}" \
  --registry-server "$ACR_SERVER" \
  --registry-username "$ACR_USER" \
  --registry-password "$ACR_PASS" \
  --target-port 3000 --ingress external \
  --min-replicas 1 --max-replicas 3 \
  --secrets "session-secret=${SESSION_SECRET}" "admin-key=${ADMIN_API_KEY}" \
            "database-url=${DATABASE_URL}" "redis-url=${REDIS_URL}" \
  --env-vars \
    NODE_ENV=production \
    HTTPS_ONLY=true \
    OIN_TEST_MODE=false \
    DATABASE_SSL=true \
    "SESSION_SECRET=secretref:session-secret" \
    "ADMIN_API_KEY=secretref:admin-key" \
    "DATABASE_URL=secretref:database-url" \
    "REDIS_URL=secretref:redis-url" \
  -o none

APP_FQDN=$(az containerapp show -n "$APP_NAME" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)

# --- 7. URLs SAML del SP (dominio de Azure o el público que definas) ---------
BASE_URL="https://${PUBLIC_DOMAIN:-$APP_FQDN}"
az containerapp update -n "$APP_NAME" -g "$RG" \
  --set-env-vars \
    "SAML_SP_ENTITY_ID=${BASE_URL}" \
    "SAML_SP_ACS_URL=${BASE_URL}/saml/acs" \
    "SAML_SP_SLO_URL=${BASE_URL}/saml/slo" \
  -o none

echo ""
echo "============================================================"
echo " Deploy completo."
echo "   App:        https://${APP_FQDN}"
echo "   Health:     https://${APP_FQDN}/health"
echo "   Metadata:   https://${APP_FQDN}/saml/metadata"
echo "   Admin:      https://${APP_FQDN}/admin/tenants (x-admin-key)"
echo ""
echo " Para dominio propio (sso.tigrelabs.xyz):"
echo "   1) az containerapp hostname add -n ${APP_NAME} -g ${RG} --hostname sso.tigrelabs.xyz"
echo "   2) Crea el CNAME en Namecheap apuntando a: ${APP_FQDN}"
echo "   3) Re-ejecuta con PUBLIC_DOMAIN=sso.tigrelabs.xyz para fijar las URLs SAML"
echo "============================================================"
