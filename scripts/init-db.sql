-- Esquema de base de datos para el SAML SSO Service Provider.
-- Idempotente: seguro de ejecutar en cada arranque y como init de Docker.

CREATE TABLE IF NOT EXISTS audit_logs (
  id            TEXT        PRIMARY KEY,
  timestamp     TIMESTAMPTZ NOT NULL,
  event_type    TEXT        NOT NULL,
  user_id       TEXT,
  idp_name      TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  details       JSONB,
  status        TEXT        NOT NULL,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp  ON audit_logs (timestamp);
