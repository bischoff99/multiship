import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { quoteAll, purchase } from '../../../packages/providers/src/index.js';

const Auth = (token: string) => async (req: any, res: any) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    res.code(401).send({ error: 'unauthorized' }); return;
  }
};

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
  distance_unit: z.enum(['in','cm']).default('in').optional(),
  mass_unit: z.enum(['oz','lb','g','kg']).default('oz').optional()
});

const QuoteRequestSchema = z.object({
  to: AddressSchema,
  from: AddressSchema,
  parcel: ParcelSchema,
  reference: z.string().optional(),
  veeqo: z.object({ allocationId: z.number() }).optional()
});

const PurchaseRequestSchema = z.object({
  provider: z.enum(['easypost','shippo','veeqo']),
  rateId: z.string(),
  shipmentId: z.string().optional(),
  allocationId: z.number().optional(),
  serviceType: z.string().optional(),
  subCarrierId: z.string().optional()
});

const RateQuoteSchema = z.object({
  provider: z.enum(['easypost','shippo','veeqo']),
  rateId: z.string(),
  shipmentId: z.string(),
  service: z.string(),
  carrier: z.string(),
  amount: z.number(),
  currency: z.string(),
  estDeliveryDays: z.number().nullable().optional(),
  serviceType: z.string().optional(),
  subCarrierId: z.string().nullable().optional()
});

const PurchaseResultSchema = z.object({
  provider: z.enum(['easypost','shippo','veeqo']),
  shipmentId: z.string(),
  labelUrl: z.string().nullable(),
  trackingCode: z.string().nullable().optional(),
  trackingUrl: z.string().nullable().optional()
});

export default async function shipments(app: FastifyInstance, opts: any) {
  app.addHook('onRequest', Auth(opts.token));

  // Quote endpoint with OpenAPI documentation
  app.post('/shipments/quote', {
    schema: {
      description: 'Get shipping rate quotes from all enabled providers',
      tags: ['Shipments'],
      summary: 'Get shipping quotes',
      security: [{ bearerAuth: [] }],
      body: QuoteRequestSchema,
      response: {
        200: z.object({
          rates: z.array(RateQuoteSchema)
        }),
        400: z.object({
          error: z.string()
        }),
        401: z.object({
          error: z.string()
        }),
        500: z.object({
          error: z.string()
        })
      }
    }
  }, async (req, res) => {
    const rates = await quoteAll(req.body);
    return { rates };
  });

  // Purchase endpoint with OpenAPI documentation
  app.post('/shipments/purchase', {
    schema: {
      description: 'Purchase shipping label from a specific provider',
      tags: ['Shipments'],
      summary: 'Purchase shipping label',
      security: [{ bearerAuth: [] }],
      body: PurchaseRequestSchema,
      response: {
        200: z.object({
          result: PurchaseResultSchema
        }),
        400: z.object({
          error: z.string()
        }),
        401: z.object({
          error: z.string()
        }),
        500: z.object({
          error: z.string()
        })
      }
    }
  }, async (req, res) => {
    const body = PurchaseRequestSchema.parse(req.body);
    const result = await purchase(body as any);
    return { result };
  });
}
