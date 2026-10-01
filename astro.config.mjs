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

// Rendered on demand rather than prerendered, so the host serves them at the
// bare path instead of the directory form every static page gets. The sitemap
// has to list the URL that actually answers, or Google indexes a second copy.
const ON_DEMAND_ROUTES = ['/reviews'];

// https://astro.build/config
export default defineConfig({
  site: siteData.url,
  integrations: [
    sitemap({
      // noindex pages don't belong in a sitemap: it asks Google to crawl a
      // page the page itself then tells it to drop.
      filter: (page) => !page.includes('/estimate/thank-you'),
      serialize: (item) => {
        const path = new URL(item.url).pathname.replace(/\/$/, '');
        if (ON_DEMAND_ROUTES.includes(path)) {
          item.url = new URL(path, siteData.url).toString();
        }
        return item;
      },
    }),
  ],

  redirects: {
    '/book': '/estimate/',
    ...(hasReviewUrl ? { '/review': siteData.googleReviewUrl } : {}),
  },

  adapter: cloudflare({
    imageService: 'compile',
  }),
});