import order from '../content/services-order.json';

export interface WhatsIncludedItem {
  label: string;
  description: string;
}

export interface FaqItem {
  q: string;
  a: string;
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
  startingAtLabel: string;
  startingAtUnit: string;
  photoLabel: string;
  cardPriceLabel: string;
  cardUnit: string;
  cardDescription: string;
  homeDescription: string;
  whatsIncluded: WhatsIncludedItem[];
  faq: FaqItem[];
  ctaHeadline: string;
  beforeAfterCopy: string;
  /** Suppresses the residential "$99 minimum / room definition" note, for services priced on a different model. */
  hidePricingNote?: boolean;
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
