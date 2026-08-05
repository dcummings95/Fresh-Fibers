// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import siteData from './src/content/site.json' with { type: 'json' };

import cloudflare from '@astrojs/cloudflare';

// content/site.json ships googleReviewUrl as "PLACEHOLDER" until there's a
// real Google review link — an invalid URL there breaks Cloudflare's
// generated _redirects file and fails every deploy, so skip the redirect
// until a real https:// URL is set.
const hasReviewUrl = /^https?:\/\//.test(siteData.googleReviewUrl);

// https://astro.build/config
export default defineConfig({
  site: siteData.url,
  integrations: [sitemap()],

  redirects: hasReviewUrl ? { '/review': siteData.googleReviewUrl } : {},

  adapter: cloudflare({
    imageService: 'compile',
  }),
});