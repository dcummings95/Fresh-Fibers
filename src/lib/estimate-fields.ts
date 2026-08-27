// Follow-up questions shown on the estimate form once a service is picked.
// Shared by QuoteForm.astro (renders them) and pages/api/quote.ts (reads them
// back), so a new question only ever needs adding in one place. Keep the
// questions in step with the matching file in content/pricing — they exist to
// capture the things that are billed separately.

export interface EstimateFieldOption {
  value: string;
  label: string;
}

export interface EstimateField {
  /** Field name is `detail_<slug>_<key>`. */
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  placeholder?: string;
  /** Required for type 'select'. First option is the empty "no answer" choice. */
  options?: EstimateFieldOption[];
  /** Spans the full width instead of sharing a row. */
  wide?: boolean;
  /** Turns an answer into its phrase in the emailed/stored summary line. */
  summary: (value: string) => string;
}

const plural = (value: string, one: string, many: string) => `${value} ${value === '1' ? one : many}`;

export const estimateFields: Record<string, EstimateField[]> = {
  carpet: [
    {
      key: 'rooms',
      label: 'How many rooms?',
      type: 'number',
      placeholder: 'e.g. 3',
      summary: (v) => plural(v, 'room', 'rooms'),
    },
    {
      key: 'hallways',
      label: 'Hallways or walk-in closets?',
      type: 'number',
      placeholder: 'e.g. 1',
      summary: (v) => plural(v, 'hallway/closet', 'hallways/closets'),
    },
    {
      key: 'stairs',
      label: 'Any stairs?',
      type: 'select',
      wide: true,
      options: [
        { value: '', label: 'No stairs' },
        { value: 'half flight of stairs', label: 'Half flight — up to 8 steps' },
        { value: 'full flight of stairs', label: 'Full flight — up to 16 steps' },
        { value: 'more than one flight of stairs', label: 'More than one flight' },
        { value: 'stairs, not sure how many steps', label: "Stairs, but I'm not sure how many steps" },
      ],
      summary: (v) => v,
    },
  ],
  upholstery: [
    {
      key: 'pieces',
      label: 'What pieces?',
      type: 'text',
      placeholder: 'e.g. sofa + 2 chairs',
      wide: true,
      summary: (v) => v,
    },
  ],
  rugs: [
    {
      key: 'rugs',
      label: 'How many rugs, and about what size?',
      type: 'text',
      placeholder: 'e.g. 2 rugs, about 5x8 ft',
      wide: true,
      summary: (v) => v,
    },
  ],
  tile: [
    {
      key: 'sqft',
      label: 'Approx. how many sq ft?',
      type: 'number',
      placeholder: 'e.g. 150',
      wide: true,
      summary: (v) => `${v} sq ft`,
    },
  ],
  'pet-odor': [
    {
      key: 'areas',
      label: 'How many areas need treatment?',
      type: 'number',
      placeholder: 'e.g. 2',
      wide: true,
      summary: (v) => plural(v, 'area', 'areas'),
    },
  ],
};

/** Form field name for a service's question. */
export function estimateFieldName(slug: string, key: string): string {
  return `detail_${slug}_${key}`;
}
