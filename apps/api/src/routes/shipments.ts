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
  app.post('/shipments/quote', {
    schema: {
      description: 'Get shipping quotes from all providers',
      tags: ['Shipments'],
      summary: 'Get shipping quotes',
      body: {
        type: 'object',
        required: ['to', 'from', 'parcel'],
        properties: {
          to: {
            type: 'object',
            required: ['street1', 'city', 'zip', 'country'],
            properties: {
              name: { type: 'string' },
              company: { type: 'string' },
              street1: { type: 'string' },
              street2: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              zip: { type: 'string' },
              country: { type: 'string', minLength: 2, maxLength: 2 },
              phone: { type: 'string' },
              email: { type: 'string' }
            }
          },
          from: {
            type: 'object',
            required: ['street1', 'city', 'zip', 'country'],
            properties: {
              name: { type: 'string' },
              company: { type: 'string' },
              street1: { type: 'string' },
              street2: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              zip: { type: 'string' },
              country: { type: 'string', minLength: 2, maxLength: 2 },
              phone: { type: 'string' },
              email: { type: 'string' }
            }
          },
          parcel: {
            type: 'object',
            required: ['length', 'width', 'height', 'weight'],
            properties: {
              length: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
              weight: { type: 'number' },
              distance_unit: { type: 'string', enum: ['in', 'cm'] },
              mass_unit: { type: 'string', enum: ['oz', 'lb', 'g', 'kg'] }
            }
          },
          reference: { type: 'string' },
          veeqo: {
            type: 'object',
            properties: {
              allocationId: { type: 'number' }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                rates: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      provider: { type: 'string', enum: ['easypost', 'shippo', 'veeqo'] },
                      rateId: { type: 'string' },
                      shipmentId: { type: 'string' },
                      service: { type: 'string' },
                      carrier: { type: 'string' },
                      amount: { type: 'number' },
                      currency: { type: 'string' },
                      estDeliveryDays: { type: 'number', nullable: true }
                    }
                  }
                },
                providers: { type: 'array', items: { type: 'string' } },
                totalQuotes: { type: 'number' },
                cacheHit: { type: 'boolean' }
              }
            },
            timestamp: { type: 'string' },
            correlationId: { type: 'string' }
          }
        }
      }
    }
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
  app.post('/shipments/purchase', {
    schema: {
      description: 'Purchase a shipping label',
      tags: ['Shipments'],
      summary: 'Purchase shipping label',
      body: {
        type: 'object',
        required: ['provider', 'rateId'],
        properties: {
          provider: { type: 'string', enum: ['easypost', 'shippo', 'veeqo'] },
          rateId: { type: 'string' },
          shipmentId: { type: 'string' },
          allocationId: { type: 'number' },
          serviceType: { type: 'string' },
          subCarrierId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                provider: { type: 'string', enum: ['easypost', 'shippo', 'veeqo'] },
                shipmentId: { type: 'string' },
                labelUrl: { type: 'string', nullable: true },
                trackingCode: { type: 'string', nullable: true },
                trackingUrl: { type: 'string', nullable: true }
              }
            },
            timestamp: { type: 'string' },
            correlationId: { type: 'string' }
          }
        }
      }
    }
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
  app.get('/shipments/health',
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
  app.get('/shipments/providers',
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