// Configuración genérica de IdP por variables de entorno.
//
// Permite registrar cualquier IdP SAML real (Okta, Azure AD, Ping, etc.) sin
// tocar el código: basta con publicar el certificado de firma que entrega el
// IdP y declarar su entityID y su URL de SSO. Es la vía de despliegue
// "bring your own IdP".

import { IdPConfig } from '@shared/types/saml.types';

// Construye un IdPConfig desde el entorno. Devuelve null si no hay un IdP
// declarado (faltan los datos mínimos), de modo que el arranque no cambia
// cuando no se configura ninguno.
export function createEnvIdPConfig(
  env: NodeJS.ProcessEnv = process.env
): IdPConfig | null {
  const entityID = env.IDP_ENTITY_ID?.trim();
  const singleSignOnServiceUrl = env.IDP_SSO_URL?.trim();
  const certificatePath = env.IDP_CERT_PATH?.trim();

  if (!entityID || !singleSignOnServiceUrl || !certificatePath) {
    return null;
  }

  const config: IdPConfig = {
    id: env.IDP_ID?.trim() || 'env-idp',
    name: env.IDP_NAME?.trim() || 'Configured IdP',
    entityID,
    singleSignOnServiceUrl,
    identifierFormat:
      env.IDP_NAMEID_FORMAT?.trim() ||
      'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    certificatePath,
    enabled: true,
  };

  const singleLogoutServiceUrl = env.IDP_SLO_URL?.trim();
  if (singleLogoutServiceUrl) {
    config.singleLogoutServiceUrl = singleLogoutServiceUrl;
  }

  return config;
}
