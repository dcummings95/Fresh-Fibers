// Follow-up questions shown on the estimate form once a service is picked.
// Shared by QuoteForm.astro (renders them), lib/estimate-pricing.ts (prices
// them) and pages/api/quote.ts (reads them back), so a question only ever
// needs adding in one place. Every billable thing in the matching
// content/pricing file needs a question here, since the calculator can only price
// what the form asks about, and a missing question silently under-quotes.

export interface EstimateFieldOption {
  value: string;
  label: string;
}

export interface EstimateField {
  /** Field name is `detail_<slug>_<key>`. */
  key: string;
  label: string;
  type: 'number' | 'select' | 'checkbox';
  placeholder?: string;
  /** Small muted helper line under the label. */
  hint?: string;
  /** Required for type 'select'. */
  options?: EstimateFieldOption[];
  /** Spans the full width instead of sharing a row. */
  wide?: boolean;
  /** Allows fractional input, for square footage rather than counts. */
  decimal?: boolean;
  /** Turns an answer into its phrase in the emailed summary. Null omits it. */
  summary: (value: string) => string | null;
}

const plural = (value: string, one: string, many: string) => `${value} ${value === '1' ? one : many}`;

/** Summary for a select/checkbox: the phrase each stored value stands for. */
const phrases = (map: Record<string, string>) => (value: string) => map[value] ?? null;

export const RUG_FIBER_PHRASES: Record<string, string> = {
  synthetic: 'synthetic fiber',
  natural: 'wool/cotton/jute or other natural fiber',
  specialty: 'Persian, hand-knotted, antique or silk',
  unsure: 'fiber unknown',
};

export const PET_SEVERITY_PHRASES: Record<string, string> = {
  surface: 'surface treatment',
  pad: 'soaked into the pad or subfloor',
  unsure: 'severity unknown',
};

export const estimateFields: Record<string, EstimateField[]> = {
  carpet: [
    {
      key: 'rooms',
      label: 'How many rooms?',
      type: 'number',
      placeholder: 'e.g. 3',
      hint: 'A room is up to 200 sq ft. A large open area counts as two.',
      summary: (v) => plural(v, 'room', 'rooms'),
    },
    {
      key: 'steps',
      label: 'Stair steps?',
      type: 'number',
      placeholder: 'e.g. 13',
      hint: 'Total steps, all flights. Leave blank if none.',
      summary: (v) => plural(v, 'stair step', 'stair steps'),
    },
    {
      key: 'hallways',
      label: 'Hallways?',
      type: 'number',
      placeholder: 'e.g. 1',
      summary: (v) => plural(v, 'hallway', 'hallways'),
    },
    {
      key: 'closets',
      label: 'Walk-in closets?',
      type: 'number',
      placeholder: 'e.g. 1',
      summary: (v) => plural(v, 'walk-in closet', 'walk-in closets'),
    },
  ],
  upholstery: [
    {
      key: 'sofas',
      label: 'Sofas',
      type: 'number',
      placeholder: 'e.g. 1',
      hint: 'Up to 3 seats each.',
      summary: (v) => plural(v, 'sofa', 'sofas'),
    },
    {
      key: 'loveseats',
      label: 'Loveseats',
      type: 'number',
      placeholder: 'e.g. 1',
      summary: (v) => plural(v, 'loveseat', 'loveseats'),
    },
    {
      key: 'recliners',
      label: 'Recliners or armchairs',
      type: 'number',
      placeholder: 'e.g. 2',
      summary: (v) => plural(v, 'recliner/armchair', 'recliners/armchairs'),
    },
    {
      key: 'dining_chairs',
      label: 'Dining chairs',
      type: 'number',
      placeholder: 'e.g. 6',
      summary: (v) => plural(v, 'dining chair', 'dining chairs'),
    },
    {
      key: 'sectional_seats',
      label: 'Sectional: how many seats?',
      type: 'number',
      placeholder: 'e.g. 6',
      hint: 'Count each cushion you sit on. Most run 5–7.',
      summary: (v) => `sectional, ${plural(v, 'seat', 'seats')}`,
    },
    {
      key: 'mattresses',
      label: 'Mattresses',
      type: 'number',
      placeholder: 'e.g. 1',
      hint: 'Priced on site, since size and condition vary.',
      summary: (v) => plural(v, 'mattress', 'mattresses'),
    },
  ],
  rugs: [
    {
      key: 'count',
      label: 'How many rugs?',
      type: 'number',
      placeholder: 'e.g. 2',
      summary: (v) => plural(v, 'rug', 'rugs'),
    },
    {
      key: 'sqft',
      label: 'Total square footage',
      type: 'number',
      decimal: true,
      placeholder: 'e.g. 80',
      summary: (v) => `${v} sq ft`,
    },
    {
      key: 'fiber',
      label: 'What are they made of?',
      type: 'select',
      wide: true,
      options: [
        { value: 'unsure', label: "I'm not sure" },
        { value: 'synthetic', label: 'Synthetic (nylon, polyester, olefin)' },
        { value: 'natural', label: 'Wool, cotton, jute or another natural fiber' },
        { value: 'specialty', label: 'Persian, hand-knotted, antique or silk' },
      ],
      summary: phrases(RUG_FIBER_PHRASES),
    },
  ],
  tile: [
    {
      key: 'sqft',
      label: 'Approx. how many sq ft?',
      type: 'number',
      decimal: true,
      wide: true,
      placeholder: 'e.g. 150',
      summary: (v) => `${v} sq ft`,
    },
    {
      key: 'sealing',
      label: 'Add grout sealing',
      type: 'checkbox',
      wide: true,
      hint: 'Optional. Recommended after cleaning.',
      summary: phrases({ yes: 'with grout sealing' }),
    },
  ],
  'pet-odor': [
    {
      key: 'areas',
      label: 'How many areas need treatment?',
      type: 'number',
      placeholder: 'e.g. 2',
      summary: (v) => plural(v, 'area', 'areas'),
    },
    {
      key: 'severity',
      label: 'How far has it gone?',
      type: 'select',
      options: [
        { value: 'surface', label: "Surface: stain and smell, hasn't soaked through" },
        { value: 'pad', label: 'Soaked into the pad or subfloor' },
        { value: 'unsure', label: "I'm not sure" },
      ],
      summary: phrases(PET_SEVERITY_PHRASES),
    },
  ],
  commercial: [
    {
      key: 'sqft',
      label: 'Approx. carpeted sq ft',
      type: 'number',
      decimal: true,
      placeholder: 'e.g. 2000',
      summary: (v) => `${v} sq ft carpet`,
    },
    {
      key: 'tile_sqft',
      label: 'Tile & grout sq ft',
      type: 'number',
      decimal: true,
      placeholder: 'e.g. 400',
      summary: (v) => `${v} sq ft tile`,
    },
    {
      key: 'chairs',
      label: 'Office or task chairs',
      type: 'number',
      wide: true,
      placeholder: 'e.g. 12',
      summary: (v) => plural(v, 'task chair', 'task chairs'),
    },
  ],
};

/** Form field name for a service's question. */
export function estimateFieldName(slug: string, key: string): string {
  return `detail_${slug}_${key}`;
}
