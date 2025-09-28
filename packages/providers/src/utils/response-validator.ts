import { z } from 'zod';
import { RateQuote, PurchaseResult, ShipmentInput } from '../types.js';

/**
 * Response validation schemas
 */
export const ApiResponseSchemas = {
  // Health response schema
  health: z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    timestamp: z.number(),
    uptime: z.number(),
    version: z.string(),
    summary: z.object({
      providers: z.number(),
      healthyProviders: z.number(),
      cacheHitRate: z.number(),
      averageResponseTime: z.number()
    })
  }),

  // Error response schema
  error: z.object({
    error: z.string(),
    message: z.string().optional(),
    code: z.string().optional(),
    correlationId: z.string().optional(),
    timestamp: z.string().optional(),
    path: z.string().optional(),
    method: z.string().optional()
  }),

  // Rate limiting error response
  rateLimitError: z.object({
    error: z.string(),
    message: z.string(),
    retryAfter: z.number(),
    correlationId: z.string().optional()
  }),

  // Quote response schema
  quoteResponse: z.object({
    rates: z.array(z.object({
      provider: z.enum(['easypost', 'shippo', 'veeqo']),
      rateId: z.string(),
      shipmentId: z.string(),
      service: z.string(),
      carrier: z.string(),
      amount: z.number(),
      currency: z.string(),
      estDeliveryDays: z.number().nullable().optional(),
      serviceType: z.string().optional(),
      subCarrierId: z.string().nullable().optional()
    }))
  }),

  // Purchase response schema
  purchaseResponse: z.object({
    result: z.object({
      provider: z.enum(['easypost', 'shippo', 'veeqo']),
      shipmentId: z.string(),
      labelUrl: z.string().nullable(),
      trackingCode: z.string().nullable().optional(),
      trackingUrl: z.string().nullable().optional()
    })
  }),

  // Provider health response
  providerHealth: z.object({
    timestamp: z.number(),
    providers: z.record(z.string(), z.boolean())
  }),

  // Metrics response
  metrics: z.object({
    contentType: z.string(),
    body: z.string()
  }),

  // Dashboard response
  dashboard: z.object({
    timestamp: z.number(),
    timeRange: z.string(),
    widgets: z.record(z.string(), z.any()),
    summary: z.object({
      totalRequests: z.number(),
      successfulRequests: z.number(),
      failedRequests: z.number(),
      averageResponseTime: z.number(),
      uptime: z.number(),
      healthScore: z.number(),
      activeProviders: z.number(),
      cacheHitRate: z.number(),
      systemLoad: z.object({
        memory: z.number(),
        cpu: z.number()
      })
    }),
    alerts: z.array(z.any()),
    trends: z.array(z.any())
  })
};

/**
 * Response validation utilities
 */
export class ResponseValidator {
  /**
   * Validate and sanitize API response
   */
  static validateResponse<T>(response: unknown, schema: z.ZodSchema<T>): {
    success: boolean;
    data?: T;
    errors?: string[];
  } {
    try {
      const validatedData = schema.parse(response);
      return {
        success: true,
        data: validatedData
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
        };
      }

      return {
        success: false,
        errors: ['Unknown validation error']
      };
    }
  }

  /**
   * Validate quote response
   */
  static validateQuoteResponse(response: unknown) {
    return this.validateResponse(response, ApiResponseSchemas.quoteResponse);
  }

  /**
   * Validate purchase response
   */
  static validatePurchaseResponse(response: unknown) {
    return this.validateResponse(response, ApiResponseSchemas.purchaseResponse);
  }

  /**
   * Validate health response
   */
  static validateHealthResponse(response: unknown) {
    return this.validateResponse(response, ApiResponseSchemas.health);
  }

  /**
   * Validate error response
   */
  static validateErrorResponse(response: unknown) {
    return this.validateResponse(response, ApiResponseSchemas.error);
  }

  /**
   * Sanitize provider response data
   */
  static sanitizeProviderResponse(provider: string, data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data };

    // Remove sensitive fields based on provider
    switch (provider) {
      case 'easypost':
        this.removeSensitiveFields(sanitized, ['api_key', 'test_api_key']);
        break;
      case 'shippo':
        this.removeSensitiveFields(sanitized, ['api_key', 'test_api_key']);
        break;
      case 'veeqo':
        this.removeSensitiveFields(sanitized, ['api_key', 'secret_key']);
        break;
    }

    // Ensure numeric fields are properly formatted
    this.sanitizeNumericFields(sanitized);

    return sanitized;
  }

  /**
   * Validate and sanitize rate quote data
   */
  static validateAndSanitizeRateQuote(quote: any): RateQuote | null {
    try {
      // Basic structure validation
      if (!quote || typeof quote !== 'object') {
        return null;
      }

      const sanitizedQuote = this.sanitizeProviderResponse(quote.provider || 'unknown', quote);

      // Validate required fields
      const requiredFields = ['provider', 'rateId', 'service', 'carrier', 'amount', 'currency'];
      for (const field of requiredFields) {
        if (!(field in sanitizedQuote)) {
          console.warn(`Missing required field '${field}' in rate quote`);
          return null;
        }
      }

      // Ensure amount is in cents (integer)
      if (typeof sanitizedQuote.amount === 'number' && sanitizedQuote.amount < 100) {
        sanitizedQuote.amount = Math.round(sanitizedQuote.amount * 100);
      }

      // Validate provider enum
      if (!['easypost', 'shippo', 'veeqo'].includes(sanitizedQuote.provider)) {
        console.warn(`Invalid provider '${sanitizedQuote.provider}' in rate quote`);
        return null;
      }

      return sanitizedQuote as RateQuote;
    } catch (error) {
      console.error('Error validating rate quote:', error);
      return null;
    }
  }

  /**
   * Validate and sanitize purchase result data
   */
  static validateAndSanitizePurchaseResult(purchase: any): PurchaseResult | null {
    try {
      if (!purchase || typeof purchase !== 'object') {
        return null;
      }

      const sanitizedPurchase = this.sanitizeProviderResponse(purchase.provider || 'unknown', purchase);

      // Validate required fields
      const requiredFields = ['provider', 'shipmentId'];
      for (const field of requiredFields) {
        if (!(field in sanitizedPurchase)) {
          console.warn(`Missing required field '${field}' in purchase result`);
          return null;
        }
      }

      // Validate provider enum
      if (!['easypost', 'shippo', 'veeqo'].includes(sanitizedPurchase.provider)) {
        console.warn(`Invalid provider '${sanitizedPurchase.provider}' in purchase result`);
        return null;
      }

      return sanitizedPurchase as PurchaseResult;
    } catch (error) {
      console.error('Error validating purchase result:', error);
      return null;
    }
  }

  /**
   * Validate input data
   */
  static validateShipmentInput(input: unknown) {
    try {
      return ShipmentInput.parse(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid shipment input: ${error.issues.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  /**
   * Create error response with proper formatting
   */
  static createErrorResponse(
    error: string,
    message?: string,
    correlationId?: string,
    statusCode: number = 500
  ) {
    return {
      error,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      statusCode
    };
  }

  /**
   * Create rate limit error response
   */
  static createRateLimitErrorResponse(retryAfter: number, correlationId?: string) {
    return {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
      retryAfter,
      correlationId,
      timestamp: new Date().toISOString()
    };
  }

  // Private helper methods

  private static removeSensitiveFields(obj: any, fields: string[]): void {
    for (const field of fields) {
      if (field in obj) {
        delete obj[field];
      }
    }

    // Recursively clean nested objects
    for (const key in obj) {
      if (obj[key] && typeof obj[key] === 'object') {
        this.removeSensitiveFields(obj[key], fields);
      }
    }
  }

  private static sanitizeNumericFields(obj: any): void {
    for (const key in obj) {
      const value = obj[key];

      if (typeof value === 'string') {
        // Convert string numbers to numbers
        if (/^\d+\.?\d*$/.test(value)) {
          obj[key] = parseFloat(value);
        }
      } else if (typeof value === 'number' && !Number.isFinite(value)) {
        // Handle infinity and NaN
        obj[key] = 0;
      }
    }
  }
}

/**
 * Validation middleware factory
 */
export function createValidationMiddleware<T>(schema: z.ZodSchema<T>) {
  return async (req: any, res: any, next: () => void) => {
    try {
      const validatedData = schema.parse(req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.code(400).send(ResponseValidator.createErrorResponse(
          'Validation Error',
          error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          req.correlationId
        ));
        return;
      }

      res.code(400).send(ResponseValidator.createErrorResponse(
        'Invalid Request',
        'Request validation failed',
        req.correlationId
      ));
    }
  };
}

/**
 * Response sanitization middleware
 */
export function createResponseSanitizationMiddleware() {
  return async (req: any, res: any, next: () => void) => {
    // Store original send method
    const originalSend = res.send;

    // Override send method to sanitize response
    res.send = function(data: any) {
      try {
        // Sanitize based on request path
        const path = req.url || '';

        if (path.includes('/quote')) {
          if (data && data.rates && Array.isArray(data.rates)) {
            data.rates = data.rates.map((rate: any) =>
              ResponseValidator.validateAndSanitizeRateQuote(rate)
            ).filter(Boolean);
          }
        } else if (path.includes('/purchase')) {
          if (data && data.result) {
            data.result = ResponseValidator.validateAndSanitizePurchaseResult(data.result);
          }
        }

        // Call original send with sanitized data
        return originalSend.call(this, data);
      } catch (error) {
        console.error('Error sanitizing response:', error);
        return originalSend.call(this, data);
      }
    };

    next();
  };
}