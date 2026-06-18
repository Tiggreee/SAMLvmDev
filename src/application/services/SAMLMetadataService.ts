// Servicio de Metadata SAML

import { SAMLAdapter } from '@infrastructure/saml/SAMLAdapter';

export class SAMLMetadataService {
  constructor(private samlAdapter: SAMLAdapter) {}

  async getServiceProviderMetadata(): Promise<string> {
    return this.samlAdapter.generateMetadata();
  }

  async getFormattedMetadata(): Promise<string> {
    const metadata = await this.getServiceProviderMetadata();
    return this.formatXML(metadata);
  }

  private formatXML(xml: string): string {
    // Minificar XML (eliminar espacios innecesarios)
    return xml.replace(/>\s+</g, '><').trim();
  }

  async validateMetadata(metadata: string): Promise<boolean> {
    try {
      // Validación ligera de metadata XML
      if (!metadata.includes('<EntityDescriptor')) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}
