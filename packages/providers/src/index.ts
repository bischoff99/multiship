import { z } from 'zod';
import { ShipmentInput, type RateQuote, type PurchaseResult } from './types.js';
import { epQuote, epBuy } from './easypost.js';
import { spQuote, spBuy } from './shippo.js';
import { vqSetAllocationPackage, vqQuote, vqBuy } from './veeqo.js';
import { ProviderFactory } from './factory.js';

export async function quoteAll(input: unknown): Promise<RateQuote[]> {
  const parsed = ShipmentInput.parse(input);

  const tasks: Promise<RateQuote[]>[] = [
    epQuote(parsed).catch(() => []),
    spQuote(parsed).catch(() => []),
  ];

  if (parsed.veeqo?.allocationId && process.env.VEEQO_API_KEY) {
    tasks.push((async () => {
      await vqSetAllocationPackage(parsed.veeqo!.allocationId, parsed.parcel);
      const rates = await vqQuote(parsed.veeqo!.allocationId);
      return rates.map(r => ({
        provider: 'veeqo' as const,
        rateId: r.remote_shipment_id,
        shipmentId: String(parsed.veeqo!.allocationId),
        service: r.service_id,
        carrier: r.service_carrier,
        amount: Math.round(Number(r.base_rate) * 100),
        currency: r.currency,
        serviceType: r.name,
        subCarrierId: r.sub_carrier_id ?? null
      }));
    })().catch(() => []));
  }

  const settled = await Promise.all(tasks);
  return settled.flat().sort((a,b) => a.amount - b.amount);
}

export async function purchase(choice: {
  provider: 'easypost'|'shippo'|'veeqo';
  rateId: string;
  shipmentId?: string;
  allocationId?: number;
  serviceType?: string;
  subCarrierId?: string | null;
}): Promise<PurchaseResult> {
  if (choice.provider === 'easypost') {
    if (!choice.shipmentId) throw new Error('shipmentId required for EasyPost');
    return epBuy(choice.shipmentId, choice.rateId);
  }
  if (choice.provider === 'shippo') {
    return spBuy(choice.rateId);
  }
  if (!choice.allocationId || !choice.serviceType) {
    throw new Error('allocationId and serviceType required for Veeqo');
  }
  const res = await vqBuy({
    allocationId: choice.allocationId,
    remoteShipmentId: choice.rateId,
    serviceType: choice.serviceType,
    subCarrierId: choice.subCarrierId ?? null
  });
  return {
    provider: 'veeqo',
    shipmentId: res.shipmentId,
    labelUrl: res.labelUrl,
    trackingUrl: res.trackingUrl ?? null,
    trackingCode: null
  };
}

// Export ProviderFactory and other utilities for API usage
export { ProviderFactory } from './factory.js';
export { Logger } from './utils/logger.js';
export { RateLimiter } from './utils/rate-limiter.js';
export { EnhancedRateLimiter, RateLimiterFactory } from './utils/enhanced-rate-limiter.js';
export { MetricsCollector, metricsCollector } from './monitoring/metrics-collector.js';
export * from './errors/provider-errors.js';
