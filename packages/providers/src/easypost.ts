import EasyPost from '@easypost/api';
import type { ShipmentInput, RateQuote, PurchaseResult } from './types.js';

const client = new EasyPost(process.env.EASYPOST_API_KEY!);

export async function epQuote(input: ShipmentInput): Promise<RateQuote[]> {
  const shipment = await client.Shipment.create({
    to_address: input.to,
    from_address: input.from,
    parcel: {
      length: input.parcel.length,
      width: input.parcel.width,
      height: input.parcel.height,
      weight: input.parcel.weight
    },
    reference: input.reference
  });
  return (shipment.rates ?? []).map((r: any) => ({
    provider: 'easypost',
    rateId: r.id,
    shipmentId: shipment.id,
    service: r.service,
    carrier: r.carrier,
    amount: Math.round(Number(r.rate) * 100),
    currency: r.currency,
    estDeliveryDays: r.est_delivery_days ?? null
  }));
}

export async function epBuy(shipmentId: string, rateId: string): Promise<PurchaseResult> {
  const bought = await client.Shipment.buy(shipmentId, rateId);
  return {
    provider: 'easypost',
    shipmentId: bought.id,
    labelUrl: bought.postage_label?.label_url,
    trackingCode: bought.tracking_code
  };
}
