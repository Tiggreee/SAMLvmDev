// Caso de Uso: Iniciar login SSO

import { IdPConfigurationException } from '../exceptions/SAMLExceptions';
import { ISAMLConfigRepository } from '../repositories/SAMLRepositories';

export class InitiateSSOLogin {
  constructor(private samlConfigRepository: ISAMLConfigRepository) {}

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

    // En la implementación real, esto generará el SAML Request
    // Por ahora, retornamos la estructura
    const relayState = this.generateRelayState();
    const samlRequest = await this.generateSAMLRequest();

    return {
      samlRequest,
      relayState,
      redirectUrl: `${idpConfig.singleSignOnServiceUrl}?SAMLRequest=${encodeURIComponent(samlRequest)}&RelayState=${relayState}`,
    };
  }

  private generateRelayState(): string {
    return Buffer.from(JSON.stringify({ timestamp: Date.now() })).toString('base64');
  }

  private async generateSAMLRequest(): Promise<string> {
    // Implementación en el adaptador SAML
    return 'base64-encoded-saml-request';
  }
}
