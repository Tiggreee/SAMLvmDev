// Servicio de Autenticación SSO - Orquestación de casos de uso

import { SAMLAdapter } from '@infrastructure/saml/SAMLAdapter';
import { InitiateSSOLogin } from '@domain/saml/usecases/InitiateSSOLogin';
import { ProcessSAMLResponse } from '@domain/saml/usecases/ProcessSAMLResponse';
import { LogoutUser } from '@domain/saml/usecases/LogoutUser';
import { 
  ISAMLConfigRepository, 
  ISessionRepository, 
  IAuditLogRepository 
} from '@domain/saml/repositories/SAMLRepositories';

export class SSOAuthenticationService {
  private initiateSSOLogin: InitiateSSOLogin;
  private processSAMLResponse: ProcessSAMLResponse;
  private logoutUser: LogoutUser;

  constructor(
    private samlAdapter: SAMLAdapter,
    samlConfigRepository: ISAMLConfigRepository,
    sessionRepository: ISessionRepository,
    auditLogRepository: IAuditLogRepository
  ) {
    this.initiateSSOLogin = new InitiateSSOLogin(samlConfigRepository);
    this.processSAMLResponse = new ProcessSAMLResponse(
      samlConfigRepository,
      sessionRepository,
      auditLogRepository,
      samlAdapter
    );
    this.logoutUser = new LogoutUser(sessionRepository, auditLogRepository);
  }

  async initiateLogin(idpName: string): Promise<{
    samlRequest: string;
    relayState: string;
    redirectUrl: string;
  }> {
    return this.initiateSSOLogin.execute(idpName);
  }

  async processSAMLResponseAndCreateSession(
    samlResponse: string,
    idpName: string,
    ipAddress: string,
    userAgent: string
  ): Promise<{
    sessionId: string;
    userId: string;
    email: string;
  }> {
    const result = await this.processSAMLResponse.execute(
      samlResponse,
      idpName,
      ipAddress,
      userAgent
    );

    return {
      sessionId: result.sessionId,
      userId: result.userId,
      email: result.attributes.email,
    };
  }

  async logout(
    sessionId: string,
    userId: string,
    ipAddress: string
  ): Promise<void> {
    await this.logoutUser.execute(sessionId, userId, ipAddress, false);
  }

  getAvailableIdPs(): string[] {
    return this.samlAdapter.getIdPList();
  }
}
