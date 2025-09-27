import { z } from 'zod';

export const Address = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  street1: z.string(),
  street2: z.string().optional(),
  city: z.string(),
  state: z.string().optional(),
  zip: z.string(),
  country: z.string().length(2),
  phone: z.string().optional(),
  email: z.string().optional(),
});
export type Address = z.infer<typeof Address>;

export const Parcel = z.object({
  length: z.number(),
  width: z.number(),
  height: z.number(),
  weight: z.number(),
  distance_unit: z.enum(['in','cm']).default('in').optional(),
  mass_unit: z.enum(['oz','lb','g','kg']).default('oz').optional()
});
export type Parcel = z.infer<typeof Parcel>;

export const ShipmentInput = z.object({
  to: Address,
  from: Address,
  parcel: Parcel,
  reference: z.string().optional(),
  veeqo: z.object({ allocationId: z.number() }).optional()
});
export type ShipmentInput = z.infer<typeof ShipmentInput>;

export type RateQuote = {
  provider: 'easypost'|'shippo'|'veeqo';
  rateId: string;
  shipmentId: string;
  service: string;
  carrier: string;
  amount: number;
  currency: string;
  estDeliveryDays?: number | null;
  serviceType?: string;
  subCarrierId?: string | null;
};

export type PurchaseResult = {
  provider: 'easypost'|'shippo'|'veeqo';
  shipmentId: string;
  labelUrl: string | null;
  trackingCode?: string | null;
  trackingUrl?: string | null;
};

export interface ProviderAdapter {
  readonly name: string;
  readonly enabled: boolean;

  quote(input: ShipmentInput): Promise<RateQuote[]>;
  purchase(rateId: string, shipmentId?: string): Promise<PurchaseResult>;

  // Health check method for circuit breaker
  healthCheck(): Promise<boolean>;
}

export interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  size: number;
  maxSize?: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  namespace?: string; // Optional namespace for key organization
}

export interface CacheInterface<T = any> {
  /**
   * Get a value from cache
   */
  get(key: string): Promise<T | null>;

  /**
   * Set a value in cache with optional TTL
   */
  set(key: string, value: T, options?: CacheOptions): Promise<void>;

  /**
   * Delete a value from cache
   */
  delete(key: string): Promise<boolean>;

  /**
   * Check if key exists in cache
   */
  has(key: string): Promise<boolean>;

  /**
   * Clear all cache entries
   */
  clear(): Promise<void>;

  /**
   * Get cache statistics
   */
  getStats(): Promise<CacheStats>;

  /**
   * Get all cache keys (optionally filtered by pattern)
   */
  keys(pattern?: string): Promise<string[]>;

  /**
   * Get cache size in bytes (approximate)
   */
  size(): Promise<number>;

  /**
   * Cleanup expired entries
   */
  cleanup(): Promise<void>;

  /**
   * Health check for cache connectivity/availability
   */
  healthCheck(): Promise<boolean>;
}
