// This INSERT must stay in sync with the `leads` table schema owned by
// crm-fresh-fibers/migrations/0001_init_schema.sql — if that schema
// changes, update this too. Kept intentionally minimal: the marketing
// site only ever needs to create a lead, never read or manage one.

export interface AdAttribution {
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export interface CreateLeadInput {
  name: string;
  phone: string;
  email: string;
  area: string;
  servicesRequested: string[];
  serviceDetails: Record<string, string>;
  bestTime: string;
  message: string;
  adAttribution: AdAttribution;
  ipAddress: string;
}

export async function createLead(db: D1Database, input: CreateLeadInput): Promise<number> {
  const hasAttribution = Object.values(input.adAttribution).some((v) => v);
  const result = await db
    .prepare(
      `INSERT INTO leads (name, phone, email, area, services_requested, service_details, best_time, message, ad_attribution, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.name,
      input.phone,
      input.email,
      input.area,
      JSON.stringify(input.servicesRequested),
      JSON.stringify(input.serviceDetails),
      input.bestTime || null,
      input.message || null,
      hasAttribution ? JSON.stringify(input.adAttribution) : null,
      input.ipAddress,
    )
    .run();
  return Number(result.meta.last_row_id);
}
