import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import site from '../../content/site.json';

export const prerender = false;

const FROM_ADDRESS = 'notifications@getfreshfibers.com';
const TURNSTILE_ACTION = 'quote_request';
const ALLOWED_HOSTNAMES = new Set(['getfreshfibers.com', 'dev.getfreshfibers.com', 'localhost', '127.0.0.1']);

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.formData();

    // Honeypot: real visitors never fill this hidden field. Pretend success
    // so scripts filling every field don't learn the check exists.
    if (String(data.get('botcheck') ?? '').length > 0) {
      return jsonResponse({ success: true });
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';

    if (env.QUOTE_FORM_RATE_LIMITER) {
      const { success } = await env.QUOTE_FORM_RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return jsonResponse(
          { success: false, message: 'Too many requests — please wait a minute and try again, or call/text instead.' },
          429,
        );
      }
    }

    const turnstileToken = String(data.get('cf-turnstile-response') ?? '');
    const verified = await verifyTurnstile(turnstileToken, ip);
    if (!verified) {
      return jsonResponse({ success: false, message: 'Verification failed — please try again.' }, 403);
    }

    const name = String(data.get('name') ?? '').trim();
    const phone = String(data.get('phone') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const area = String(data.get('area') ?? '').trim();
    const bestTime = String(data.get('best_time') ?? '').trim();
    const message = String(data.get('message') ?? '').trim();
    const services = data.getAll('services').map(String);

    if (!name || !phone || !email || !area) {
      return jsonResponse({ success: false, message: 'Please fill in all required fields.' }, 400);
    }

    const lines = [
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Email: ${email}`,
      `Area: ${area}`,
      services.length ? `Services: ${services.join(', ')}` : null,
      bestTime ? `Best time to reach: ${bestTime}` : null,
      message ? `Details: ${message}` : null,
    ].filter((line): line is string => line !== null);

    if (!env.EMAIL) {
      return jsonResponse({ success: false, message: 'Email is not configured.' }, 500);
    }

    await env.EMAIL.send({
      to: site.email,
      from: { email: FROM_ADDRESS, name: `${site.name} website` },
      replyTo: email,
      subject: `New quote request — ${name}`,
      text: lines.join('\n'),
      html: `<p>${lines.map(escapeHtml).join('</p><p>')}</p>`,
    });

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('quote form submission failed', err);
    return jsonResponse({ success: false, message: 'Something went wrong. Please call or text instead.' }, 500);
  }
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!token) return false;

  let result: { success: boolean; action?: string; hostname?: string };
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    result = await res.json();
  } catch {
    return false;
  }

  if (!result.success) return false;
  if (result.action && result.action !== TURNSTILE_ACTION) return false;
  if (result.hostname && !ALLOWED_HOSTNAMES.has(result.hostname)) return false;
  return true;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
