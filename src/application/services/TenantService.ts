// Servicio de gestión de tenants (organizaciones cliente).
//
// Crea tenants con una clave de API única. La clave se almacena hasheada
// (SHA-256), igual que un token de acceso personal: el texto plano solo se
// devuelve una vez, en la creación, y no puede recuperarse después.

import { randomUUID, randomBytes, createHash } from 'crypto';
import { ITenantRepository } from '@domain/saml/repositories/ITenantRepository';
import {
  ISAMLConfigRepository,
  IAuditLogRepository,
} from '@domain/saml/repositories/SAMLRepositories';
import { Tenant, IdPConfig } from '@shared/types/saml.types';

export interface TenantView {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  createdAt: Date;
}

export interface CreatedTenant extends TenantView {
  apiKey: string; // texto plano, solo en la creación
}

export interface TenantUsage {
  tenantId: string;
  authentications: number;
  periodDays: number;
  since: string;
}

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export class TenantService {
  constructor(
    private tenantRepository: ITenantRepository,
    private samlConfigRepository: ISAMLConfigRepository,
    // Registra el IdP en el validador SAML para que sus respuestas puedan
    // verificarse. Se inyecta desde el composition root para no acoplar la
    // aplicación al adaptador de infraestructura.
    private registerIdPInValidator?: (config: IdPConfig) => void,
    private auditLogRepository?: IAuditLogRepository
  ) {}

  async createTenant(name: string): Promise<CreatedTenant> {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw new Error('Tenant name is required');
    }

    const baseSlug = slugify(trimmed) || `tenant-${Date.now()}`;
    const slug = await this.ensureUniqueSlug(baseSlug);

    const apiKey = `vmd_${randomBytes(24).toString('hex')}`;
    const tenant: Tenant = {
      id: randomUUID(),
      name: trimmed,
      slug,
      apiKeyHash: hashApiKey(apiKey),
      enabled: true,
      createdAt: new Date(),
    };

    await this.tenantRepository.save(tenant);
    return { ...this.toView(tenant), apiKey };
  }

  async listTenants(): Promise<TenantView[]> {
    const tenants = await this.tenantRepository.getAll();
    return tenants.map((t) => this.toView(t));
  }

  async getTenant(id: string): Promise<TenantView | null> {
    const tenant = await this.tenantRepository.findById(id);
    return tenant ? this.toView(tenant) : null;
  }

  async getTenantBySlug(slug: string): Promise<TenantView | null> {
    const tenant = await this.tenantRepository.findBySlug(slug);
    return tenant ? this.toView(tenant) : null;
  }

  async setEnabled(id: string, enabled: boolean): Promise<TenantView | null> {
    const tenant = await this.tenantRepository.findById(id);
    if (!tenant) {
      return null;
    }
    const updated: Tenant = { ...tenant, enabled };
    await this.tenantRepository.save(updated);
    return this.toView(updated);
  }

  async deleteTenant(id: string): Promise<boolean> {
    const tenant = await this.tenantRepository.findById(id);
    if (!tenant) {
      return false;
    }
    await this.tenantRepository.delete(id);
    return true;
  }

  // Autentica una clave de API de tenant. Devuelve el tenant si la clave es
  // válida y el tenant está habilitado.
  async authenticateApiKey(apiKey: string): Promise<Tenant | null> {
    if (!apiKey) {
      return null;
    }
    const tenant = await this.tenantRepository.findByApiKeyHash(hashApiKey(apiKey));
    if (!tenant || !tenant.enabled) {
      return null;
    }
    return tenant;
  }

  async registerIdP(
    tenantId: string,
    config: Omit<IdPConfig, 'tenantId'>
  ): Promise<IdPConfig | null> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      return null;
    }
    const scoped: IdPConfig = { ...config, tenantId };
    await this.samlConfigRepository.save(scoped);
    if (this.registerIdPInValidator) {
      this.registerIdPInValidator(scoped);
    }
    return scoped;
  }

  async listIdPs(tenantId: string): Promise<IdPConfig[]> {
    const all = await this.samlConfigRepository.getAll();
    return all.filter((c) => c.tenantId === tenantId);
  }

  // Uso facturable: autenticaciones exitosas del tenant en los últimos N días,
  // agregadas desde el registro de auditoría (fuente de verdad persistida).
  async getUsage(tenantId: string, periodDays = 30): Promise<TenantUsage | null> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      return null;
    }
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    let authentications = 0;
    if (this.auditLogRepository) {
      const idps = await this.listIdPs(tenantId);
      authentications = await this.auditLogRepository.countAuthentications(
        idps.map((c) => c.id),
        since
      );
    }
    return {
      tenantId,
      authentications,
      periodDays,
      since: since.toISOString(),
    };
  }

  private async ensureUniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let suffix = 1;
    while (await this.tenantRepository.findBySlug(candidate)) {
      candidate = `${base}-${suffix++}`;
    }
    return candidate;
  }

  private toView(tenant: Tenant): TenantView {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      enabled: tenant.enabled,
      createdAt: tenant.createdAt,
    };
  }
}
