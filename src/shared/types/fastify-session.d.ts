import '@fastify/session';

declare module '@fastify/session' {
  interface Session {
    relayState?: string;
    idp?: string;
    userId?: string;
    email?: string;
    sessionId?: string;
    authenticated?: boolean;
  }
}
