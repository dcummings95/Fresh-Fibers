// Turns the estimate form's answers into a dollar figure.
//
// Every number is read out of content/pricing/*.json by row label, so the
// published price list is the only place a price is ever written down. Rename
// or unprice a row there and this throws at build time rather than quoting a
// job wrong. Runs in the browser (live total on the form) and in the Worker
// (the figure emailed to Augie); the Worker's result is the authoritative one,
// since anything the browser posts can be edited.

import site from '../content/site.json';
import carpetPricing from '../content/pricing/carpet.json';
import upholsteryPricing from '../content/pricing/upholstery.json';
import rugsPricing from '../content/pricing/rugs.json';
import tilePricing from '../content/pricing/tile.json';
import petPricing from '../content/pricing/pet-odor.json';
import { estimateFieldName } from './estimate-fields';
import { promo, isPromoActive } from './promo';

interface PricingLike {
  service: string;
  rows: { label: string; price: number | null }[];
}

function rowPrice(pricing: PricingLike, label: string): number {
  const row = pricing.rows.find((r) => r.label === label);
  if (!row || row.price === null) {
    throw new Error(`content/pricing/${pricing.service}.json needs a priced row labelled "${label}"`);
  }
  return row.price;
}

const ROOM_TIERS = [1, 2, 3, 4, 5].map((n) => rowPrice(carpetPricing, `${n} room special`));
const EXTRA_ROOM = rowPrice(carpetPricing, 'Each additional room');
const HALLWAY = rowPrice(carpetPricing, 'Hallway or walk-in closet');
const STAIRS_HALF = rowPrice(carpetPricing, 'Stairs (half flight)');
const STAIRS_FULL = rowPrice(carpetPricing, 'Stairs (full flight)');

const SOFA = rowPrice(upholsteryPricing, 'Sofa');
const LOVESEAT = rowPrice(upholsteryPricing, 'Loveseat');
const SECTIONAL_SEAT = rowPrice(upholsteryPricing, 'Sectional');
const RECLINER = rowPrice(upholsteryPricing, 'Recliner or armchair');
const DINING_CHAIR = rowPrice(upholsteryPricing, 'Dining chair');

const RUG_SYNTHETIC = rowPrice(rugsPricing, 'Synthetic fiber');

const TILE = rowPrice(tilePricing, 'Floor tile & grout');
const GROUT_SEALING = rowPrice(tilePricing, 'Grout sealing');

const PET_SURFACE = rowPrice(petPricing, 'Surface treatment');

export const MINIMUM_VISIT = site.minimumVisit;

export interface EstimateLine {
  label: string;
  amount: number;
}

export interface EstimateResult {
  /** Priced work, in the order it's shown to the customer. */
  lines: EstimateLine[];
  /** Work Augie has to see before he can put a number on it. */
  quoteOnly: string[];
  /** Sum of the lines, before the visit minimum or any discount. */
  subtotal: number;
  /** True when the visit minimum lifted a small job up to the floor. */
  minimumApplied: boolean;
  discount: { code: string; percentOff: number; amount: number } | null;
  /** What the customer is quoted. Zero when nothing could be priced. */
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Steps in a half flight and a full flight, per the carpet price list's own detail text. */
const STEPS_PER_HALF_FLIGHT = 8;
const STEPS_PER_FULL_FLIGHT = 16;

/** Beyond two full flights Augie wants to look at it himself. */
const MAX_PRICEABLE_STEPS = STEPS_PER_FULL_FLIGHT * 2;

/**
 * The price list bills stairs by the flight, not the step: $35 for a half
 * flight (up to 8 steps) and $60 for a full one (up to 16). So a step count
 * becomes whole full flights plus whatever is left over, and the leftover
 * rounds up to the cheaper unit that still covers it. 20 steps is therefore one
 * full flight and one half, not one-and-a-quarter full flights.
 */
function stairsPrice(steps: number): number {
  let fullFlights = Math.floor(steps / STEPS_PER_FULL_FLIGHT);
  const leftover = steps % STEPS_PER_FULL_FLIGHT;
  let halfFlights = 0;
  if (leftover > STEPS_PER_HALF_FLIGHT) fullFlights += 1;
  else if (leftover > 0) halfFlights = 1;
  return fullFlights * STAIRS_FULL + halfFlights * STAIRS_HALF;
}

/**
 * A room added to a visit that other work has already lifted past the minimum
 * bills at the additional-room rate. The tier prices have the visit minimum
 * baked into them: the 1-room special is $99 because that is the floor for
 * turning up, not because one room is worth $99, so charging a tier price on
 * top of other services would collect that floor twice.
 *
 * Only non-carpet work counts toward `otherWork`: a carpet-only job with a lot
 * of stairs is still a carpet job, and should read straight off the tiers.
 */
function carpetRoomsPrice(rooms: number, otherWork: number): number {
  if (rooms <= 0) return 0;
  if (otherWork >= MINIMUM_VISIT) return rooms * EXTRA_ROOM;
  if (rooms <= ROOM_TIERS.length) return ROOM_TIERS[rooms - 1];
  return ROOM_TIERS[ROOM_TIERS.length - 1] + (rooms - ROOM_TIERS.length) * EXTRA_ROOM;
}

export function calculateEstimate(
  slugs: string[],
  values: Record<string, string>,
  now: Date = new Date(),
): EstimateResult {
  const raw = (slug: string, key: string) => (values[estimateFieldName(slug, key)] ?? '').trim();
  const count = (slug: string, key: string) => {
    const n = Number.parseInt(raw(slug, key), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const measure = (slug: string, key: string) => {
    const n = Number.parseFloat(raw(slug, key));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const ticked = (slug: string, key: string) => raw(slug, key) === 'yes';
  const picked = (slug: string) => slugs.includes(slug);

  const quoteOnly: string[] = [];
  // Carpet rooms price last (they depend on everything else), so carpet's own
  // extras and the other services accumulate separately until then.
  const carpetExtras: EstimateLine[] = [];
  const otherLines: EstimateLine[] = [];

  if (picked('carpet')) {
    // Hallways and walk-in closets are counted separately on the form but share
    // the one 'Hallway or walk-in closet' row in the price list.
    const hallways = count('carpet', 'hallways');
    if (hallways) {
      carpetExtras.push({
        label: plural(hallways, 'hallway', 'hallways'),
        amount: hallways * HALLWAY,
      });
    }

    const closets = count('carpet', 'closets');
    if (closets) {
      carpetExtras.push({
        label: plural(closets, 'walk-in closet', 'walk-in closets'),
        amount: closets * HALLWAY,
      });
    }

    const steps = count('carpet', 'steps');
    if (steps > MAX_PRICEABLE_STEPS) {
      quoteOnly.push(`Stairs (${plural(steps, 'step', 'steps')})`);
    } else if (steps) {
      carpetExtras.push({
        label: `Stairs (${plural(steps, 'step', 'steps')})`,
        amount: stairsPrice(steps),
      });
    }
  }

  if (picked('upholstery')) {
    const sofas = count('upholstery', 'sofas');
    const loveseats = count('upholstery', 'loveseats');
    const recliners = count('upholstery', 'recliners');
    const diningChairs = count('upholstery', 'dining_chairs');
    const sectionalSeats = count('upholstery', 'sectional_seats');
    const mattresses = count('upholstery', 'mattresses');

    if (sofas) otherLines.push({ label: plural(sofas, 'sofa', 'sofas'), amount: sofas * SOFA });
    if (loveseats) otherLines.push({ label: plural(loveseats, 'loveseat', 'loveseats'), amount: loveseats * LOVESEAT });
    if (recliners) {
      otherLines.push({
        label: plural(recliners, 'recliner or armchair', 'recliners / armchairs'),
        amount: recliners * RECLINER,
      });
    }
    if (diningChairs) {
      otherLines.push({
        label: plural(diningChairs, 'dining chair', 'dining chairs'),
        amount: diningChairs * DINING_CHAIR,
      });
    }
    if (sectionalSeats) {
      otherLines.push({
        label: `Sectional (${plural(sectionalSeats, 'seat', 'seats')})`,
        amount: sectionalSeats * SECTIONAL_SEAT,
      });
    }
    if (mattresses) quoteOnly.push(plural(mattresses, 'mattress', 'mattresses'));
  }

  if (picked('rugs')) {
    const fiber = raw('rugs', 'fiber');
    const sqft = measure('rugs', 'sqft');
    const rugs = count('rugs', 'count');
    const rugCountText = rugs ? plural(rugs, 'rug', 'rugs') : 'Area rugs';

    if (fiber === 'synthetic' && sqft) {
      otherLines.push({ label: `${rugCountText} (${sqft} sq ft synthetic)`, amount: sqft * RUG_SYNTHETIC });
    } else if (fiber === 'natural') {
      quoteOnly.push(`${rugCountText} (wool, cotton or jute), assessed before cleaning`);
    } else if (fiber === 'specialty') {
      quoteOnly.push(`${rugCountText} (Persian, hand-knotted, antique or silk), assessed before cleaning`);
    } else if (rugs || sqft) {
      quoteOnly.push(`${rugCountText}, fiber to confirm`);
    }
  }

  if (picked('tile')) {
    const sqft = measure('tile', 'sqft');
    if (sqft) {
      otherLines.push({ label: `Tile & grout (${sqft} sq ft)`, amount: sqft * TILE });
      if (ticked('tile', 'sealing')) {
        otherLines.push({ label: `Grout sealing (${sqft} sq ft)`, amount: sqft * GROUT_SEALING });
      }
    }
  }

  if (picked('pet-odor')) {
    const areas = count('pet-odor', 'areas');
    const severity = raw('pet-odor', 'severity');
    if (areas && severity === 'surface') {
      otherLines.push({
        label: `Pet treatment (${plural(areas, 'area', 'areas')})`,
        amount: areas * PET_SURFACE,
      });
    } else if (areas && severity === 'pad') {
      quoteOnly.push(`Pet damage soaked into the pad (${plural(areas, 'area', 'areas')})`);
    } else if (areas) {
      quoteOnly.push(`Pet treatment (${plural(areas, 'area', 'areas')}), severity to confirm`);
    }
  }

  // Commercial is quoted at a walkthrough, never off a table: the published
  // rate is a "from" figure and larger spaces earn volume discounts, so a
  // computed number here would read as a promise and land high.
  if (picked('commercial')) {
    const details = [
      measure('commercial', 'sqft') ? `${measure('commercial', 'sqft')} sq ft carpet` : null,
      measure('commercial', 'tile_sqft') ? `${measure('commercial', 'tile_sqft')} sq ft tile` : null,
      count('commercial', 'chairs') ? plural(count('commercial', 'chairs'), 'task chair', 'task chairs') : null,
    ].filter((part): part is string => part !== null);
    quoteOnly.push(
      details.length
        ? `Commercial (${details.join(', ')}), firm quote after a free walkthrough`
        : 'Commercial, firm quote after a free walkthrough',
    );
  }

  const otherWork = otherLines.reduce((sum, line) => sum + line.amount, 0);
  const rooms = picked('carpet') ? count('carpet', 'rooms') : 0;
  const lines: EstimateLine[] = [];

  if (rooms) {
    lines.push({ label: plural(rooms, 'room of carpet', 'rooms of carpet'), amount: carpetRoomsPrice(rooms, otherWork) });
  }
  lines.push(...carpetExtras);
  lines.push(...otherLines);

  for (const line of lines) line.amount = round2(line.amount);

  const subtotal = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  const minimumApplied = lines.length > 0 && subtotal < MINIMUM_VISIT;
  const beforeDiscount = minimumApplied ? MINIMUM_VISIT : subtotal;

  let discount: EstimateResult['discount'] = null;
  if (promo && beforeDiscount > 0 && isPromoActive(now)) {
    discount = {
      code: promo.code,
      percentOff: promo.percentOff,
      amount: round2((beforeDiscount * promo.percentOff) / 100),
    };
  }

  return {
    lines,
    quoteOnly,
    subtotal,
    minimumApplied,
    discount,
    total: round2(beforeDiscount - (discount?.amount ?? 0)),
  };
}
