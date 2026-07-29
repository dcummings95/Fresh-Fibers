import type { APIRoute } from 'astro';
import site from '../content/site.json';

export const GET: APIRoute = () => {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site.url).toString()}\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain' },
  });
};
