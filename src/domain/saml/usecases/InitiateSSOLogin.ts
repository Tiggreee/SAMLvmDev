// Caso de Uso: Iniciar login SSO

import { IdPConfigurationException } from '../exceptions/SAMLExceptions';
import { ISAMLConfigRepository } from '../repositories/SAMLRepositories';

type SAMLRequestBuilder = (idpName: string) => {
  samlRequest: string;
  relayState: string;
};

export class InitiateSSOLogin {
  constructor(
    private samlConfigRepository: ISAMLConfigRepository,
    private buildSAMLRequest: SAMLRequestBuilder
  ) {}

  async execute(idpName: string): Promise<{
    samlRequest: string;
    relayState: string;
    redirectUrl: string;
  }> {
    // Obtener configuración del IdP
    const idpConfig = await this.samlConfigRepository.getByIdP(idpName);
    
    if (!idpConfig) {
      throw new IdPConfigurationException(`IdP configuration not found for: ${idpName}`);
    }

    if (!idpConfig.enabled) {
      throw new IdPConfigurationException(`IdP is disabled: ${idpName}`);
    }

    const { relayState, samlRequest } = this.buildSAMLRequest(idpName);
    const redirectUrl = /^https?:\/\//i.test(samlRequest)
      ? samlRequest
      : `${idpConfig.singleSignOnServiceUrl}?SAMLRequest=${encodeURIComponent(samlRequest)}&RelayState=${encodeURIComponent(relayState)}`;

    return {
      samlRequest,
      relayState,
      redirectUrl,
    };
  }
}
