import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProviderFactory, quoteAll, purchase } from '@pkg/providers';

const Auth = (token: string) => async (req: any, res: any) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    res.code(401).send({ 
      error: 'unauthorized',
      message: 'Invalid or missing authorization token',
      code: 'UNAUTHORIZED'
    });
    return;
  }
};

// Enhanced error response schema
const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  code: z.string(),
  correlationId: z.string().optional(),
  details: z.record(z.string(), z.any()).optional(),
  timestamp: z.string(),
});

// Success response wrapper
const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
  success: z.boolean(),
  data: dataSchema,
  timestamp: z.string(),
  correlationId: z.string().optional(),
});

// Request/Response schemas
const AddressSchema = z.object({
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

const ParcelSchema = z.object({
  length: z.number(),
  width: z.number(),
  height: z.number(),
  weight: z.number(),
  distance_unit: z.enum(['in', 'cm']).default('in').optional(),
  mass_unit: z.enum(['oz', 'lb', 'g', 'kg']).default('oz').optional(),
});

const QuoteRequestSchema = z.object({
  to: AddressSchema,
  from: AddressSchema,
  parcel: ParcelSchema,
  reference: z.string().optional(),
  veeqo: z.object({ allocationId: z.number() }).optional(),
});

const PurchaseRequestSchema = z.object({
  provider: z.enum(['easypost', 'shippo', 'veeqo']),
  rateId: z.string(),
  shipmentId: z.string().optional(),
  allocationId: z.number().optional(),
  serviceType: z.string().optional(),
  subCarrierId: z.string().optional(),
});

const RateQuoteSchema = z.object({
  provider: z.enum(['easypost', 'shippo', 'veeqo']),
  rateId: z.string(),
  shipmentId: z.string(),
  service: z.string(),
  carrier: z.string(),
  amount: z.number(),
  currency: z.string(),
  estDeliveryDays: z.number().nullable().optional(),
  serviceType: z.string().optional(),
  subCarrierId: z.string().nullable().optional(),
});

const PurchaseResultSchema = z.object({
  provider: z.enum(['easypost', 'shippo', 'veeqo']),
  shipmentId: z.string(),
  labelUrl: z.string().nullable(),
  trackingCode: z.string().nullable().optional(),
  trackingUrl: z.string().nullable().optional(),
});

export default async function shipments(app: FastifyInstance, opts: any) {
  // Apply authentication to all routes
  app.addHook('onRequest', Auth(opts.token));

  // Error handling hook
  app.setErrorHandler(async (error, request, reply) => {
    const correlationId = request.headers['x-correlation-id'] as string || 
                         `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const statusCode = error.statusCode || 500;
    
    reply.code(statusCode).send({
      error: error.name || 'InternalServerError',
      message: error.message || 'An internal server error occurred',
      code: (error.name || 'INTERNAL_SERVER_ERROR').toUpperCase(),
      correlationId,
      details: {
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      timestamp: new Date().toISOString()
    });
  });

  // Quote endpoint
  app.post(
    '/shipments/quote',
    {
      schema: {
        description: 'Get shipping rate quotes from all enabled providers',
        tags: ['Shipments'],
        summary: 'Get shipping quotes',
        body: QuoteRequestSchema,
        response: {
          200: SuccessResponseSchema(z.object({
            rates: z.array(RateQuoteSchema),
            providers: z.array(z.string()),
            totalQuotes: z.number(),
            cacheHit: z.boolean().optional(),
          })),
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (req, res) => {
      const correlationId = req.headers['x-correlation-id'] as string || 
                           `quote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        const rates = await quoteAll(req.body);
        const providers = [...new Set(rates.map(r => r.provider))];
        
        return {
          success: true,
          data: {
            rates,
            providers,
            totalQuotes: rates.length,
            cacheHit: false
          },
          timestamp: new Date().toISOString(),
          correlationId
        };
      } catch (error) {
        throw error;
      }
    }
  );

  // Purchase endpoint
  app.post(
    '/shipments/purchase',
    {
      schema: {
        description: 'Purchase shipping label from a specific provider',
        tags: ['Shipments'],
        summary: 'Purchase shipping label',
        body: PurchaseRequestSchema,
        response: {
          200: SuccessResponseSchema(PurchaseResultSchema),
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (req, res) => {
      const correlationId = req.headers['x-correlation-id'] as string || 
                           `purchase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        const body = PurchaseRequestSchema.parse(req.body);
        const result = await purchase(body as any);
        
        return {
          success: true,
          data: result,
          timestamp: new Date().toISOString(),
          correlationId
        };
      } catch (error) {
        throw error;
      }
    }
  );

  // Health check endpoint
  app.get(
    '/shipments/health',
    {
      schema: {
        description: 'Check health status of all shipping providers',
        tags: ['Health'],
        summary: 'Provider health check',
        response: {
          200: SuccessResponseSchema(z.object({
            providers: z.record(z.string(), z.boolean()),
            overall: z.boolean(),
            timestamp: z.string(),
          })),
          401: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (req, res) => {
      const correlationId = req.headers['x-correlation-id'] as string || 
                           `health-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        const providerFactory = ProviderFactory.getInstance();
        const healthStatus = await providerFactory.healthCheckAll();
        const overall = Object.values(healthStatus).every(status => status);
        
        return {
          success: true,
          data: {
            providers: healthStatus,
            overall,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString(),
          correlationId
        };
      } catch (error) {
        throw error;
      }
    }
  );

  // Provider status endpoint
  app.get(
    '/shipments/providers',
    {
      schema: {
        description: 'Get information about available shipping providers',
        tags: ['Providers'],
        summary: 'List providers',
        response: {
          200: SuccessResponseSchema(z.object({
            providers: z.array(z.object({
              name: z.string(),
              enabled: z.boolean(),
              status: z.enum(['healthy', 'unhealthy', 'unknown']),
            })),
          })),
          401: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (req, res) => {
      const correlationId = req.headers['x-correlation-id'] as string || 
                           `providers-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        const providerFactory = ProviderFactory.getInstance();
        const providers = providerFactory.getAllAdapters();
        const healthStatus = await providerFactory.healthCheckAll();
        
        const providerInfo = providers.map((provider: any) => ({
          name: provider.name,
          enabled: provider.enabled,
          status: healthStatus[provider.name] ? 'healthy' : 'unhealthy'
        }));
        
        return {
          success: true,
          data: {
            providers: providerInfo
          },
          timestamp: new Date().toISOString(),
          correlationId
        };
      } catch (error) {
        throw error;
      }
    }
  );
}