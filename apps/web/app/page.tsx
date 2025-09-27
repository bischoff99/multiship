'use client';
import { useState } from 'react';

export default function Page() {
  const [rates, setRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function quote(e: any) {
    e.preventDefault(); setLoading(true);
    const body = {
      to: { name: "Ada", street1: "179 N Harbor Dr", city: "Redondo Beach", state: "CA", zip: "90277", country: "US" },
      from: { company: "ACME", street1: "417 MONTGOMERY ST", city: "San Francisco", state: "CA", zip: "94104", country: "US" },
      parcel: { length: 8, width: 5, height: 5, weight: 5, distance_unit: "in", mass_unit: "oz" }
    };
    const res = await fetch("http://localhost:4000/shipments/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer dev-token" },
      body: JSON.stringify(body)
    });
    const json = await res.json(); setRates(json.rates ?? []); setLoading(false);
  }

  async function buy(r: any) {
    const res = await fetch("http://localhost:4000/shipments/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer dev-token" },
      body: JSON.stringify({ provider: r.provider, rateId: r.rateId, shipmentId: r.shipmentId, allocationId: Number(r.shipmentId), serviceType: r.serviceType })
    });
    const json = await res.json(); alert(JSON.stringify(json.result, null, 2));
  }

  return (
    <main className="p-6">
      <button onClick={quote} disabled={loading}>{loading ? 'Loading...' : 'Get Quotes'}</button>
      <ul>
        {rates.map((r, i) => (
          <li key={i}>
            {r.provider} {r.carrier} {r.service} £{(r.amount/100).toFixed(2)} {r.currency}
            <button onClick={() => buy(r)}>Buy</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
