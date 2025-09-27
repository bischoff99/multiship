const BASE = process.env.VEEQO_API_BASE ?? 'https://api.veeqo.com';
const API_KEY = process.env.VEEQO_API_KEY!;

type VqRate = {
  carrier: string;
  service_carrier: string;
  service_id: string;
  remote_shipment_id: string;
  name: string;
  base_rate: number;
  currency: string;
  sub_carrier_id?: string | null;
};

function headers(extra: Record<string,string> = {}) {
  return { 'x-api-key': API_KEY, 'Content-Type': 'application/json', ...extra };
}

function toUnits(parcel: { length:number;width:number;height:number;weight:number;distance_unit?:'in'|'cm';mass_unit?:'oz'|'lb'|'g'|'kg'}) {
  const inches = parcel.distance_unit !== 'cm';
  const oz = parcel.mass_unit !== 'g' && parcel.mass_unit !== 'kg';
  const conv = {
    width: inches ? parcel.width : parcel.width / 2.54,
    height: inches ? parcel.height : parcel.height / 2.54,
    depth: inches ? parcel.length : parcel.length / 2.54,
    weight: (() => {
      if (oz) {
        if (parcel.mass_unit === 'lb') return parcel.weight * 16;
        if (parcel.mass_unit === 'oz' || !parcel.mass_unit) return parcel.weight;
      }
      const grams = parcel.mass_unit === 'kg' ? parcel.weight * 1000 : parcel.weight;
      return grams / 28.349523125;
    })(),
    dimensions_unit: 'inches' as 'inches'|'cm',
    weight_unit: 'oz' as 'oz'|'g',
  };
  conv.dimensions_unit = inches ? 'inches' : 'cm';
  conv.weight_unit = 'oz';
  return conv;
}

// PUT /allocations/{allocation_id}/allocation_package
export async function vqSetAllocationPackage(allocationId: number, parcel: any) {
  const u = toUnits(parcel);
  const body = {
    allocation_package: {
      weight: Number(u.weight.toFixed(2)),
      weight_unit: u.weight_unit,
      width: Number(u.width.toFixed(2)),
      height: Number(u.height.toFixed(2)),
      depth: Number(u.depth.toFixed(2)),
      dimensions_unit: u.dimensions_unit,
      package_provider: 'CUSTOM',
      package_selection_source: 'ONE_OFF',
      save_for_similar_shipments: false
    }
  };
  const res = await fetch(`${BASE}/allocations/${allocationId}/allocation_package`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Veeqo allocation_package update failed: ${res.status}`);
}

// GET /shipping/quotes/amazon_shipping_v2?allocation_id=...&from_allocation_package=true
export async function vqQuote(allocationId: number) {
  const url = new URL(`${BASE}/shipping/quotes/amazon_shipping_v2`);
  url.searchParams.set('allocation_id', String(allocationId));
  url.searchParams.set('from_allocation_package', 'true');

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Veeqo quote failed: ${res.status}`);

  const json: any = await res.json();
  const rates: VqRate[] = (json?.available ?? []);
  return rates;
}

// POST /shipping/shipments
export async function vqBuy(params: { allocationId: number; remoteShipmentId: string; serviceType: string; subCarrierId?: string | null; }) {
  const body = {
    carrier: 'amazon_shipping_v2',
    shipment: {
      allocation_id: params.allocationId,
      remote_shipment_id: params.remoteShipmentId,
      service_type: params.serviceType,
      sub_carrier_id: params.subCarrierId ?? undefined,
      notify_customer: false
    }
  };
  const res = await fetch(`${BASE}/shipping/shipments`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Veeqo buy failed: ${res.status}`);
  const out: any = await res.json();
  const shipmentId = String(out?.id ?? '');
  const labelUrl = shipmentId ? `${BASE}/shipping/labels?shipment_ids[]=${encodeURIComponent(shipmentId)}` : null;
  return {
    shipmentId,
    trackingUrl: out?.tracking_url ?? null,
    labelUrl
  };
}
