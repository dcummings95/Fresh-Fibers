// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import siteData from './src/content/site.json' with { type: 'json' };

// https://astro.build/config
export default defineConfig({
  site: siteData.url,
  integrations: [sitemap()],
  redirects: {
    '/review': siteData.googleReviewUrl,
  },
});
