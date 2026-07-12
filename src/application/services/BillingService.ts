// Servicio de facturación por consumo (Stripe metered billing).
//
// Es opcional: si STRIPE_SECRET_KEY no está configurada, el servicio queda
// deshabilitado y todos sus métodos son no-op. Esto permite correr en
// desarrollo y pruebas sin Stripe, y activar la facturación solo en producción.
//
// El reporte de uso usa la API de Billing Meter Events de Stripe: cada
// autenticación exitosa emite un evento que Stripe agrega para facturar al
// cierre del periodo.

import Stripe from 'stripe';

export interface BillingConfig {
  secretKey?: string;
  priceId?: string;
  meterEventName?: string;
}

export class BillingService {
  private stripe: Stripe | null;
  private priceId?: string;
  private meterEventName: string;

  constructor(config: BillingConfig = {}) {
    this.stripe = config.secretKey ? new Stripe(config.secretKey) : null;
    this.priceId = config.priceId;
    this.meterEventName = config.meterEventName || 'saml_authentication';
  }

  get enabled(): boolean {
    return this.stripe !== null;
  }

  // Crea un customer en Stripe para un tenant. Devuelve el id del customer o
  // null si la facturación está deshabilitada.
  async createCustomer(name: string, tenantId: string): Promise<string | null> {
    if (!this.stripe) {
      return null;
    }
    const customer = await this.stripe.customers.create({
      name,
      metadata: { tenantId },
    });
    return customer.id;
  }

  // Suscribe a un customer al precio medido. Requiere STRIPE_PRICE_ID.
  async createSubscription(customerId: string): Promise<string | null> {
    if (!this.stripe || !this.priceId) {
      return null;
    }
    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: this.priceId }],
    });
    return subscription.id;
  }

  // Reporta una unidad de consumo (una autenticación) a Stripe. Fire-and-forget
  // desde el llamador: los errores se registran y no interrumpen el login.
  async reportUsage(stripeCustomerId: string, quantity = 1): Promise<void> {
    if (!this.stripe) {
      return;
    }
    await this.stripe.billing.meterEvents.create({
      event_name: this.meterEventName,
      payload: {
        stripe_customer_id: stripeCustomerId,
        value: String(quantity),
      },
    });
  }
}
