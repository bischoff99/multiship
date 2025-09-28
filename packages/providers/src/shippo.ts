import { Shippo } from 'shippo';
import type { PurchaseResult, RateQuote, ShipmentInput } from './types.js';

const shippo = new Shippo({
  apiKeyHeader: process.env.SHIPPO_API_KEY!
});

export async function spQuote(input: ShipmentInput): Promise<RateQuote[]> {
  const shipment = await shippo.shipments.create({
    addressFrom: input.from,
    addressTo: input.to,
    parcels: [
      {
        length: String(input.parcel.length),
        width: String(input.parcel.width),
        height: String(input.parcel.height),
        distanceUnit: input.parcel.distance_unit ?? 'in',
        weight: String(input.parcel.weight),
        massUnit: input.parcel.mass_unit ?? 'oz',
      },
    ],
    async: false,
  });
  const rates = shipment.rates ?? [];
  return rates.map((r: any) => ({
    provider: 'shippo',
    rateId: r.objectId,
    shipmentId: shipment.objectId,
    service: r.servicelevel?.name ?? r.servicelevel?.token ?? r.servicelevel,
    carrier: r.provider ?? r.carrier,
    amount: Math.round(Number(r.amount) * 100),
    currency: r.currency,
    estDeliveryDays: r.estimatedDays ?? null,
  }));
}

export async function spBuy(rateId: string): Promise<PurchaseResult> {
  const tx = await shippo.transactions.create({
    rate: rateId,
    async: false,
  });
  if (tx.status !== 'SUCCESS') throw new Error(`Shippo purchase failed: ${tx.status}`);
  return {
    provider: 'shippo',
    shipmentId: tx.parcel ?? tx.objectId ?? 'unknown',
    labelUrl: tx.labelUrl ?? null,
    trackingCode: tx.trackingNumber ?? null,
  };
}
