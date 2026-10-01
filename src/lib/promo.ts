import site from '../content/site.json';

export interface Promo {
  code: string;
  percentOff: number;
  /** Last day the sale runs, inclusive, as YYYY-MM-DD. */
  endDate: string;
  endDateLabel: string;
}

// Read through a cast so deleting the `promo` block from site.json ends the
// sale everywhere instead of failing the build on missing-property errors.
export const promo: Promo | null = (site as { promo?: Promo }).promo ?? null;

/**
 * Whether the sale is still running. Pages are prerendered, so the browser and
 * the Worker each check their own clock at request time rather than trusting a
 * date baked in at build.
 */
export function isPromoActive(now: Date = new Date()): boolean {
  if (!promo) return false;
  return now <= new Date(`${promo.endDate}T23:59:59`);
}
