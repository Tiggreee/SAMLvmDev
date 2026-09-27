// Puerto de dominio: validación de respuestas SAML.
// La infraestructura (SAMLAdapter con samlify) implementa este contrato,
// de modo que el dominio no depende de la librería SAML concreta.

import { SAMLValidationResult } from '@shared/types/saml.types';

export interface ISAMLValidator {
  /**
   * Valida una SAML Response codificada (base64) proveniente del IdP indicado.
   * Debe verificar firma, issuer, audiencia y temporalidad.
   */
  validateResponse(
    encodedSAMLResponse: string,
    relayState: string,
    idpName: string,
    expectedRequestId?: string
  ): Promise<SAMLValidationResult>;
}
