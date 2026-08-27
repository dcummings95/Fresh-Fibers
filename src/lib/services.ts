import order from '../content/services-order.json';

export interface WhatsIncludedItem {
  label: string;
  description: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

/** Optional price shown in the service hero. */
export interface HeroPrice {
  /** Label of the row in this service's pricing file to pull the number from. */
  row: string;
  /** Small text before the price, e.g. "Starting at" or "3 rooms". */
  prefix?: string;
  /** Small text after the price, e.g. "per sq ft". */
  suffix?: string;
}

export interface ServiceContent {
  slug: string;
  route: string;
  pricingFile: string;
  navLabel: string;
  eyebrow: string;
  h1Plain: string;
  h1Accent: string;
  lead: string;
  /** Omit to show no price in the hero — used where the lowest row would anchor high. */
  heroPrice?: HeroPrice;
  photoLabel: string;
  cardDescription: string;
  /** Purpose-built <meta name="description"> for the service page — geo-anchored, benefit-led. Falls back to cardDescription. */
  metaDescription?: string;
  homeDescription: string;
  whatsIncluded: WhatsIncludedItem[];
  faq: FaqItem[];
  ctaHeadline: string;
  beforeAfterCopy: string;
  /** Suppresses the residential "$99 minimum / room definition" note, for services priced on a different model. */
  hidePricingNote?: boolean;
  /** Hides the before/after slider section until real photos exist for this service. */
  hideBeforeAfter?: boolean;
}

export interface PricingRow {
  label: string;
  detail: string | null;
  price: number | null;
  unit: string | null;
  quoteLabel?: string;
  approx?: boolean;
  addOn?: boolean;
}

export interface Pricing {
  service: string;
  label: string;
  rows: PricingRow[];
  footnote: string | null;
  safetyNote?: string;
}

const serviceModules = import.meta.glob<{ default: ServiceContent }>('../content/services/*.json', { eager: true });
const pricingModules = import.meta.glob<{ default: Pricing }>('../content/pricing/*.json', { eager: true });

export const services: ServiceContent[] = (order as string[]).map((slug) => {
  const mod = serviceModules[`../content/services/${slug}.json`];
  return mod.default;
});

export function getService(slug: string): ServiceContent {
  const found = services.find((s) => s.slug === slug);
  if (!found) throw new Error(`Unknown service slug: ${slug}`);
  return found;
}

export function getPricing(pricingFile: string): Pricing {
  const mod = pricingModules[`../content/pricing/${pricingFile}.json`];
  if (!mod) throw new Error(`Unknown pricing file: ${pricingFile}`);
  return mod.default;
}

export interface ResolvedHeroPrice {
  prefix?: string;
  price: number;
  suffix?: string;
}

/**
 * Resolves a service's hero price against its pricing table, so the number lives
 * in exactly one place. Returns null when the service shows no hero price.
 */
export function resolveHeroPrice(service: ServiceContent, pricing: Pricing): ResolvedHeroPrice | null {
  const { heroPrice } = service;
  if (!heroPrice) return null;

  const row = pricing.rows.find((r) => r.label === heroPrice.row);
  if (!row) {
    throw new Error(`Service "${service.slug}" heroPrice references unknown row "${heroPrice.row}" in pricing/${service.pricingFile}.json`);
  }
  if (row.price === null) {
    throw new Error(`Service "${service.slug}" heroPrice references row "${heroPrice.row}", which has no price`);
  }

  return { prefix: heroPrice.prefix, price: row.price, suffix: heroPrice.suffix };
}
