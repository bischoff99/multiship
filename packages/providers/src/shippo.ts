import ShippoSDK from 'shippo';
import type { ShipmentInput, RateQuote, PurchaseResult } from './types.js';

const shippo = new (ShippoSDK as any)(process.env.SHIPPO_API_KEY!);

export async function spQuote(input: ShipmentInput): Promise<RateQuote[]> {
  const shipment = await shippo.shipment.create({
    address_from: input.from,
    address_to: input.to,
    parcels: [ {
      length: String(input.parcel.length),
      width: String(input.parcel.width),
      height: String(input.parcel.height),
      distance_unit: input.parcel.distance_unit ?? 'in',
      weight: String(input.parcel.weight),
      mass_unit: input.parcel.mass_unit ?? 'oz'
    } ],
    async: false
  });
  const rates = shipment.rates ?? shipment.rates_list ?? [];
  return rates.map((r: any) => ({
    provider: 'shippo',
    rateId: r.object_id,
    shipmentId: shipment.object_id,
    service: r.servicelevel?.name ?? r.servicelevel?.token ?? r.servicelevel,
    carrier: r.provider ?? r.carrier,
    amount: Math.round(Number(r.amount) * 100),
    currency: r.currency,
    estDeliveryDays: r.estimated_days ?? null
  }));
}

export async function spBuy(rateId: string): Promise<PurchaseResult> {
  const tx = await shippo.transaction.create({
    rate: rateId,
    async: false
  });
  if (tx.status !== 'SUCCESS') throw new Error(`Shippo purchase failed: ${tx.status}`);
  return {
    provider: 'shippo',
    shipmentId: tx.shipment,
    labelUrl: tx.label_url,
    trackingCode: tx.tracking_number
  };
}
