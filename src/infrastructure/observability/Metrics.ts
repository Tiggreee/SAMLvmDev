// Observabilidad: métricas Prometheus.
// Expone métricas de proceso (Node/GC/heap), latencia HTTP por ruta y
// resultados de validación SAML por IdP. Se scrapean en GET /metrics.

import { Registry, collectDefaultMetrics, Histogram, Counter, Gauge } from 'prom-client';

export const registry = new Registry();

// Métricas por defecto del runtime (CPU, memoria, event loop, GC).
collectDefaultMetrics({ register: registry, prefix: 'saml_' });

// Latencia y volumen de peticiones HTTP.
export const httpRequestDuration = new Histogram({
  name: 'saml_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

// Resultado de validaciones SAML, etiquetado por IdP y éxito/fallo.
// Base para tasas de error y para facturación por autenticación.
export const samlValidationTotal = new Counter({
  name: 'saml_validation_total',
  help: 'Total SAML response validations by IdP and result',
  labelNames: ['idp', 'result'] as const,
  registers: [registry],
});

// Sesiones autenticadas activas creadas por el gateway (aproximación en proceso).
export const activeSessions = new Gauge({
  name: 'saml_active_sessions',
  help: 'Number of active authenticated sessions (in-process gauge)',
  registers: [registry],
});

// Autenticaciones por tenant y resultado. Base para dashboards de uso y para
// la medición de consumo (billing) por organización cliente.
export const tenantAuthentications = new Counter({
  name: 'saml_tenant_authentications_total',
  help: 'Authentications per tenant and result',
  labelNames: ['tenant', 'result'] as const,
  registers: [registry],
});
