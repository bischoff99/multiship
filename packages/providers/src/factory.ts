import { ProviderAdapter, ShipmentInput, RateQuote, PurchaseResult } from './types.js';
import { EasyPostAdapter } from './adapters/easypost-adapter.js';
import { ShippoAdapter } from './adapters/shippo-adapter.js';
import { VeeqoAdapter } from './adapters/veeqo-adapter.js';

export class ProviderFactory {
  private static instance: ProviderFactory;
  private adapters: Map<string, ProviderAdapter> = new Map();

  private constructor() {
    this.initializeAdapters();
  }

  public static getInstance(): ProviderFactory {
    if (!ProviderFactory.instance) {
      ProviderFactory.instance = new ProviderFactory();
    }
    return ProviderFactory.instance;
  }

  private initializeAdapters(): void {
    // Initialize all available adapters
    this.adapters.set('easypost', new EasyPostAdapter());
    this.adapters.set('shippo', new ShippoAdapter());
    this.adapters.set('veeqo', new VeeqoAdapter());
  }

  public getAdapter(provider: string): ProviderAdapter | null {
    return this.adapters.get(provider) || null;
  }

  public getAllAdapters(): ProviderAdapter[] {
    return Array.from(this.adapters.values()).filter(adapter => adapter.enabled);
  }

  public getEnabledProviders(): string[] {
    return this.getAllAdapters().map(adapter => adapter.name);
  }

  public async getAllQuotes(input: ShipmentInput): Promise<RateQuote[]> {
    const adapters = this.getAllAdapters();
    const quotePromises = adapters.map(adapter =>
      adapter.quote(input).catch(error => {
        console.warn(`${adapter.name} provider failed:`, error.message);
        return [];
      })
    );

    const results = await Promise.all(quotePromises);
    return results.flat().sort((a, b) => a.amount - b.amount);
  }

  public async purchaseWithProvider(
    provider: string,
    rateId: string,
    shipmentId?: string
  ): Promise<PurchaseResult> {
    const adapter = this.getAdapter(provider);
    if (!adapter) {
      throw new Error(`Provider ${provider} not found`);
    }

    if (!adapter.enabled) {
      throw new Error(`Provider ${provider} is not enabled`);
    }

    return adapter.purchase(rateId, shipmentId);
  }

  public async healthCheckAll(): Promise<Record<string, boolean>> {
    const adapters = this.getAllAdapters();
    const healthPromises = adapters.map(async (adapter) => {
      try {
        const isHealthy = await adapter.healthCheck();
        return { [adapter.name]: isHealthy };
      } catch (error) {
        return { [adapter.name]: false };
      }
    });

    const results = await Promise.all(healthPromises);
    return results.reduce((acc, curr) => ({ ...acc, ...curr }), {});
  }
}

// Export singleton instance
export const providerFactory = ProviderFactory.getInstance();