import type { ImageMetadata } from 'astro';

const images = import.meta.glob<{ default: ImageMetadata }>('../assets/images/Various/*.jpg', { eager: true });

function img(name: string): ImageMetadata | undefined {
  return images[`../assets/images/Various/${name}`]?.default;
}

export interface ServicePhoto {
  hero?: ImageMetadata;
  before?: ImageMetadata;
  after?: ImageMetadata;
  /** CSS object-position for the before photo, when its framing needs a nudge to line up with the after photo. */
  beforePosition?: string;
  /** CSS object-position for the after photo, when its framing needs a nudge to line up with the before photo. */
  afterPosition?: string;
}

export const servicePhotos: Record<string, ServicePhoto> = {
  carpet: {
    hero: img('carpet_after_1.jpg'),
    before: img('carpet_before_1.jpg'),
    after: img('carpet_after_1.jpg'),
    beforePosition: 'center 20%',
  },
  upholstery: {
    hero: img('upholsterty_after_1.jpg'),
    before: img('upholstery_before_1.jpg'),
    after: img('upholsterty_after_1.jpg'),
  },
  'pet-odor': {
    hero: img('pet_stain_after_1.jpg'),
    before: img('pet_stain_before_1.jpg'),
    after: img('pet_stain_after_1.jpg'),
  },
  rugs: {
    hero: img('area_rug_clean.jpg'),
  },
  tile: {
    hero: img('tile_midway_clean_1.jpg'),
  },
};
