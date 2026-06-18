// Repositorio de configuración de IdP respaldado por PostgreSQL.
//
// Implementa el contrato de dominio `ISAMLConfigRepository`. Recibe un
// `PgQueryable` por inyección, de modo que el SQL es verificable con pg-mem.

import { ISAMLConfigRepository } from '@domain/saml/repositories/SAMLRepositories';
import { IdPConfig } from '@shared/types/saml.types';
import { PgQueryable } from '../database/PostgresPool';

export const IDP_CONFIGS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS idp_configs (
    id                  TEXT    PRIMARY KEY,
    name                TEXT    NOT NULL,
    entity_id           TEXT    NOT NULL,
    sso_url             TEXT    NOT NULL,
    slo_url             TEXT,
    identifier_format   TEXT    NOT NULL,
    certificate_path    TEXT    NOT NULL,
    certificate_content TEXT,
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,
    attribute_mapping   JSONB,
    signature_algorithm TEXT,
    digest_algorithm    TEXT
  );
`;

interface IdPConfigRow {
  id: string;
  name: string;
  entity_id: string;
  sso_url: string;
  slo_url: string | null;
  identifier_format: string;
  certificate_path: string;
  certificate_content: string | null;
  enabled: boolean;
  attribute_mapping: unknown;
  signature_algorithm: string | null;
  digest_algorithm: string | null;
}

export class PostgresSAMLConfigRepository implements ISAMLConfigRepository {
  constructor(private readonly db: PgQueryable) {}

  /** Crea el esquema si no existe. Idempotente. */
  async initialize(): Promise<void> {
    await this.db.query(IDP_CONFIGS_SCHEMA);
  }

  async getByIdP(idpName: string): Promise<IdPConfig | null> {
    const result = await this.db.query(
      `SELECT * FROM idp_configs WHERE id = $1`,
      [idpName]
    );
    const row = (result.rows as IdPConfigRow[])[0];
    return row ? this.mapRow(row) : null;
  }

  async getAll(): Promise<IdPConfig[]> {
    const result = await this.db.query(`SELECT * FROM idp_configs ORDER BY id ASC`);
    return (result.rows as IdPConfigRow[]).map((row) => this.mapRow(row));
  }

  async save(config: IdPConfig): Promise<void> {
    await this.db.query(
      `INSERT INTO idp_configs
         (id, name, entity_id, sso_url, slo_url, identifier_format,
          certificate_path, certificate_content, enabled, attribute_mapping,
          signature_algorithm, digest_algorithm)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         entity_id = EXCLUDED.entity_id,
         sso_url = EXCLUDED.sso_url,
         slo_url = EXCLUDED.slo_url,
         identifier_format = EXCLUDED.identifier_format,
         certificate_path = EXCLUDED.certificate_path,
         certificate_content = EXCLUDED.certificate_content,
         enabled = EXCLUDED.enabled,
         attribute_mapping = EXCLUDED.attribute_mapping,
         signature_algorithm = EXCLUDED.signature_algorithm,
         digest_algorithm = EXCLUDED.digest_algorithm`,
      [
        config.id,
        config.name,
        config.entityID,
        config.singleSignOnServiceUrl,
        config.singleLogoutServiceUrl ?? null,
        config.identifierFormat,
        config.certificatePath,
        config.certificateContent ?? null,
        config.enabled,
        config.attributeMapping ? JSON.stringify(config.attributeMapping) : null,
        config.signatureAlgorithm ?? null,
        config.digestAlgorithm ?? null,
      ]
    );
  }

  async delete(idpName: string): Promise<void> {
    await this.db.query(`DELETE FROM idp_configs WHERE id = $1`, [idpName]);
  }

  async updateCertificate(idpName: string, certificatePath: string): Promise<void> {
    await this.db.query(
      `UPDATE idp_configs SET certificate_path = $2 WHERE id = $1`,
      [idpName, certificatePath]
    );
  }

  private mapRow(row: IdPConfigRow): IdPConfig {
    const config: IdPConfig = {
      id: row.id,
      name: row.name,
      entityID: row.entity_id,
      singleSignOnServiceUrl: row.sso_url,
      identifierFormat: row.identifier_format,
      certificatePath: row.certificate_path,
      enabled: row.enabled,
    };
    if (row.slo_url !== null) config.singleLogoutServiceUrl = row.slo_url;
    if (row.certificate_content !== null) config.certificateContent = row.certificate_content;
    const mapping = this.parseMapping(row.attribute_mapping);
    if (mapping) config.attributeMapping = mapping;
    if (row.signature_algorithm !== null) config.signatureAlgorithm = row.signature_algorithm;
    if (row.digest_algorithm !== null) config.digestAlgorithm = row.digest_algorithm;
    return config;
  }

  private parseMapping(value: unknown): Record<string, string> | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as Record<string, string>;
      } catch {
        return undefined;
      }
    }
    return value as Record<string, string>;
  }
}
