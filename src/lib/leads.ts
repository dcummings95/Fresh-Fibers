// This INSERT must stay in sync with the `leads` table schema owned by
// crm-fresh-fibers/migrations/ (0001 for the table, 0004 for the estimate
// columns) — if that schema
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

/**
 * The quote-form estimate as the CRM stores it in `leads.estimate`. All
 * amounts are integer cents, the CRM's money convention. Shape owned by
 * crm-fresh-fibers/migrations/0004_lead_estimate.sql.
 */
export interface LeadEstimate {
  lines: { label: string; amount_cents: number }[];
  quote_only: string[];
  subtotal_cents: number;
  minimum_applied: boolean;
  discount: { code: string; percent_off: number; amount_cents: number } | null;
  total_cents: number;
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
  /** Null when the form had nothing to price. */
  estimate: LeadEstimate | null;
}

export async function createLead(db: D1Database, input: CreateLeadInput): Promise<number> {
  const hasAttribution = Object.values(input.adAttribution).some((v) => v);
  const result = await db
    .prepare(
      `INSERT INTO leads (name, phone, email, area, services_requested, service_details, best_time, message, ad_attribution, ip_address, estimate_cents, estimate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      // A total only when something was actually priced: quote-only work has
      // a zero total, and $0 in the CRM would read as a free job.
      input.estimate && input.estimate.lines.length ? input.estimate.total_cents : null,
      input.estimate ? JSON.stringify(input.estimate) : null,
    )
    .run();
  return Number(result.meta.last_row_id);
}
