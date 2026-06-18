import '@fastify/session';

declare module '@fastify/session' {
  interface FastifySessionObject {
    relayState?: string;
    idp?: string;
    userId?: string;
    email?: string;
    samlSessionId?: string;
    authenticated?: boolean;
  }
}
