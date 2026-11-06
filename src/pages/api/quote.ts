import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import site from '../../content/site.json';
import { services } from '../../lib/services';
import { estimateFields, estimateFieldName } from '../../lib/estimate-fields';
import { calculateEstimate, MINIMUM_VISIT, type EstimateResult } from '../../lib/estimate-pricing';
import { formatPrice } from '../../lib/format';
import { createLead, type AdAttribution, type LeadEstimate } from '../../lib/leads';

const AD_ATTRIBUTION_FIELDS: (keyof AdAttribution)[] = [
  'gclid',
  'fbclid',
  'msclkid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
];

export const prerender = false;

const FROM_ADDRESS = 'notifications@getfreshfibers.com';
// Quote notifications go to the owner's inbox and the dev inbox both, so
// nothing is missed while the CRM hand-off finishes. Drop the dev address
// once the owner is reliably receiving and acting on these.
const NOTIFICATION_TO_ADDRESSES = ['freshfibersllc@gmail.com', 'freshfibersdev@gmail.com'];
const TURNSTILE_ACTION = 'quote_request';
const ALLOWED_HOSTNAMES = new Set(['getfreshfibers.com', 'dev.getfreshfibers.com', 'localhost', '127.0.0.1']);

export const POST: APIRoute = async ({ request, locals }) => {
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
          { success: false, message: 'Too many requests. Please wait a minute and try again, or call/text instead.' },
          429,
        );
      }
    }

    const turnstileToken = String(data.get('cf-turnstile-response') ?? '');
    const verified = await verifyTurnstile(turnstileToken, ip);
    if (!verified) {
      return jsonResponse({ success: false, message: 'Verification failed. Please try again.' }, 403);
    }

    const name = String(data.get('name') ?? '').trim();
    const phone = String(data.get('phone') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const area = String(data.get('area') ?? '').trim();
    const bestTime = String(data.get('best_time') ?? '').trim();
    const message = String(data.get('message') ?? '').trim();
    const selectedServiceLabels = data.getAll('services').map(String);

    if (!name || !phone || !email || !area) {
      return jsonResponse({ success: false, message: 'Please fill in all required fields.' }, 400);
    }

    const selectedServices = services.filter((service) => selectedServiceLabels.includes(service.navLabel));
    const serviceDetails: Record<string, string> = {};
    const serviceLines = selectedServices.map((service) => {
      // Collapse a service's follow-up answers into one readable phrase, e.g.
      // "Carpet Cleaning (3 rooms, 1 hallway/closet, full flight of stairs)".
      const detail = (estimateFields[service.slug] ?? [])
        .map((field) => {
          const value = String(data.get(estimateFieldName(service.slug, field.key)) ?? '').trim();
          return value ? field.summary(value) : null;
        })
        .filter((part): part is string => part !== null)
        .join(', ');
      if (detail) serviceDetails[service.slug] = detail;
      return detail ? `${service.navLabel} (${detail})` : service.navLabel;
    });

    const adAttribution: AdAttribution = {};
    for (const field of AD_ATTRIBUTION_FIELDS) {
      const value = String(data.get(field) ?? '').trim();
      if (value) adAttribution[field] = value;
    }

    // Priced here rather than trusting the figure the form showed: the browser's
    // copy is display-only and anything it posts can be edited before it lands.
    const answers: Record<string, string> = {};
    for (const [key, value] of data.entries()) {
      if (typeof value === 'string') answers[key] = value;
    }
    const estimate = calculateEstimate(selectedServices.map((service) => service.slug), answers);

    const estimateLines: string[] = [];
    if (estimate.lines.length || estimate.quoteOnly.length) {
      estimateLines.push('--- Estimate ---');
      for (const line of estimate.lines) {
        estimateLines.push(`${line.label}: ${formatPrice(line.amount)}`);
      }
      if (estimate.minimumApplied) {
        estimateLines.push(`Lifted to the ${formatPrice(MINIMUM_VISIT)} visit minimum`);
      }
      if (estimate.discount) {
        estimateLines.push(
          `${estimate.discount.percentOff}% off (${estimate.discount.code}): -${formatPrice(estimate.discount.amount)}`,
        );
      }
      if (estimate.lines.length) {
        const prefix = estimate.quoteOnly.length ? 'from ' : '';
        estimateLines.push(`ESTIMATED TOTAL: ${prefix}${formatPrice(estimate.total)}`);
      }
      for (const item of estimate.quoteOnly) {
        estimateLines.push(`Needs on-site pricing: ${item}`);
      }
    }

    const lines = [
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Email: ${email}`,
      `Area: ${area}`,
      serviceLines.length ? `Services: ${serviceLines.join(', ')}` : null,
      bestTime ? `Best time to reach: ${bestTime}` : null,
      message ? `Details: ${message}` : null,
      ...estimateLines,
    ].filter((line): line is string => line !== null);

    if (!env.EMAIL) {
      return jsonResponse({ success: false, message: 'Email is not configured.' }, 500);
    }

    const notification = {
      from: { email: FROM_ADDRESS, name: `${site.name} website` },
      replyTo: email,
      subject: estimate.lines.length
        ? `New quote request: ${name}, est. ${estimate.quoteOnly.length ? 'from ' : ''}${formatPrice(estimate.total)}`
        : `New quote request: ${name}`,
      text: lines.join('\n'),
      html: `<p>${lines.map(escapeHtml).join('</p><p>')}</p>`,
    };

    // The two sends are the slowest part of this request and nothing in the
    // response depends on them, so they run to completion after the response
    // goes out instead of making the visitor watch the spinner for them. Each
    // recipient is sent to independently so a delivery failure to one inbox
    // (e.g. an address that isn't a verified destination yet) doesn't stop the
    // notification reaching the others; failures land in the Worker logs.
    const sends = Promise.allSettled(
      NOTIFICATION_TO_ADDRESSES.map((to) => env.EMAIL.send({ to, ...notification })),
    ).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') {
          console.error('quote notification send failed', result.reason);
        }
      }
    });
    await runAfterResponse(locals.cfContext, sends);

    // Still awaited: the lead row is this submission's durable record, so
    // "success" shouldn't be reported before it has been written. It's one
    // same-platform query and it overlaps the notifications above. A failure
    // is logged rather than returned, since the email still gets through.
    if (env.DB) {
      try {
        await createLead(env.DB, {
          name,
          phone,
          email,
          area,
          servicesRequested: selectedServices.map((service) => service.navLabel),
          serviceDetails,
          bestTime,
          message,
          adAttribution,
          ipAddress: ip,
          estimate: toLeadEstimate(estimate),
        });
      } catch (err) {
        console.error('failed to persist lead', err);
      }
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('quote form submission failed', err);
    return jsonResponse({ success: false, message: 'Something went wrong. Please call or text instead.' }, 500);
  }
};

/**
 * Lets slow side work finish after the response instead of inside the
 * visitor's wait. Falls back to awaiting the task when there's no execution
 * context to hand it to, since a dropped promise would lose the email
 * silently, and a slow form beats a quote request nobody is told about.
 */
async function runAfterResponse(ctx: ExecutionContext | undefined, task: Promise<unknown>): Promise<void> {
  if (typeof ctx?.waitUntil === 'function') {
    ctx.waitUntil(task);
    return;
  }
  await task;
}

/** Pricing works in dollars; the CRM stores integer cents. Convert once, here. */
function toLeadEstimate(estimate: EstimateResult): LeadEstimate | null {
  if (!estimate.lines.length && !estimate.quoteOnly.length) return null;
  const cents = (dollars: number) => Math.round(dollars * 100);
  return {
    lines: estimate.lines.map((line) => ({ label: line.label, amount_cents: cents(line.amount) })),
    quote_only: estimate.quoteOnly,
    subtotal_cents: cents(estimate.subtotal),
    minimum_applied: estimate.minimumApplied,
    discount: estimate.discount
      ? {
          code: estimate.discount.code,
          percent_off: estimate.discount.percentOff,
          amount_cents: cents(estimate.discount.amount),
        }
      : null,
    total_cents: cents(estimate.total),
  };
}

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
