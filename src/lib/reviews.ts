// Live Google reviews via Featurable (https://featurable.com).
//
// Featurable fetches and caches this business's public Google reviews on their
// side — no Google API key or Business Profile access needed. We hit their
// widget API, normalise the payload to what <ReviewCard> wants, and cache the
// result on Cloudflare's edge with stale-while-revalidate so page loads stay
// fast and reviews survive a Featurable outage.
//
// Setup: create a free widget at featurable.com, then set `featurableWidgetId`
// in src/content/site.json. Until then this returns the bundled fallback (or
// null -> "coming soon").

import site from '../content/site.json';
import fallback from '../content/reviews.json';

export interface Review {
  name: string;
  when: string;
  rating: number;
  text: string;
  photoUrl?: string;
  href?: string;
}

export interface ReviewsData {
  reviews: Review[];
  aggregateRating: number;
  totalCount: number;
  profileUrl: string | null;
  source: 'featurable' | 'fallback';
}

type CtxLike = { waitUntil?: (p: Promise<unknown>) => void } | undefined;

const FEATURABLE_ENDPOINT = 'https://api.featurable.com/v1/widgets/';
const FRESH_MS = 6 * 60 * 60 * 1000; // serve cached without refetching for 6h
const CACHE_RETAIN_SECONDS = 60 * 60 * 24 * 30; // keep a stale copy 30d for outages
const CACHE_KEY = 'https://reviews.internal/featurable-v1';

const STAR_WORDS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

function widgetId(): string | null {
  const id = (site as Record<string, unknown>).featurableWidgetId;
  return typeof id === 'string' && id && id !== 'PLACEHOLDER' ? id : null;
}

// The public Business Profile — where visitors go to read all reviews.
function googleProfileUrl(): string | null {
  const url = (site as Record<string, unknown>).googleBusinessProfileUrl;
  if (typeof url === 'string' && /^https?:\/\//.test(url)) return url;
  return /^https?:\/\//.test(site.googleReviewUrl) ? site.googleReviewUrl : null;
}

function fallbackData(): ReviewsData | null {
  if ((fallback as { placeholder?: boolean }).placeholder) return null;
  const f = fallback as unknown as {
    aggregateRating: number;
    totalCount?: number;
    reviews: (Review & { date?: string })[];
  };
  return {
    // Derive "when" from an ISO `date` when present so the relative label stays
    // accurate as time passes; fall back to a literal `when` string otherwise.
    reviews: f.reviews.map(({ date, ...r }) => ({
      ...r,
      when: (date && relativeTime(date)) || r.when,
    })),
    aggregateRating: f.aggregateRating,
    totalCount: f.totalCount ?? f.reviews.length,
    profileUrl: googleProfileUrl(),
    source: 'fallback',
  };
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months <= 1 ? 'a month ago' : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? 'a year ago' : `${years} years ago`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalize(json: any): ReviewsData | null {
  // Featurable v2 nests everything under `widget`; v1 is flat.
  const widget = json?.widget ?? {};
  const summary = widget?.gbpLocationSummary ?? {};
  const rawReviews: any[] = Array.isArray(json?.reviews)
    ? json.reviews
    : Array.isArray(widget?.reviews)
      ? widget.reviews
      : [];

  const reviews: Review[] = rawReviews
    .map((r): Review | null => {
      const person = r.reviewer ?? r.author ?? {};
      const ratingRaw = r.starRating ?? r.rating?.value ?? r.rating;
      const rating =
        typeof ratingRaw === 'string' ? (STAR_WORDS[ratingRaw] ?? Number(ratingRaw)) : Number(ratingRaw);
      const text: string = String(r.comment ?? r.text ?? '').trim();
      const name: string = String(person.displayName ?? person.name ?? '').trim();
      if (!text || !name || !Number.isFinite(rating)) return null;
      return {
        name,
        rating: Math.max(1, Math.min(5, Math.round(rating))),
        text,
        when: relativeTime(r.createTime ?? r.createdAt ?? r.updateTime ?? ''),
        photoUrl: person.profilePhotoUrl ?? person.photoUrl ?? undefined,
        href: r.reviewUrl ?? r.url ?? undefined,
      };
    })
    .filter((r): r is Review => r !== null);

  if (!reviews.length) return null;

  const aggregate =
    Number(json?.averageRating ?? summary.rating) ||
    reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const total = Number(json?.totalReviewCount ?? summary.reviewsCount) || reviews.length;

  return {
    reviews,
    aggregateRating: Math.round(aggregate * 10) / 10,
    totalCount: total,
    profileUrl: json?.profileUrl ?? summary.writeAReviewUri ?? googleProfileUrl(),
    source: 'featurable',
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function fetchFromFeaturable(id: string): Promise<ReviewsData | null> {
  try {
    const res = await fetch(FEATURABLE_ENDPOINT + encodeURIComponent(id), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Featurable responded ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any;
    if (json && json.success === false) throw new Error('Featurable returned success:false');
    return normalize(json);
  } catch (err) {
    console.error('[reviews] Featurable fetch failed:', err);
    return null;
  }
}

export async function getReviews(ctx?: CtxLike): Promise<ReviewsData | null> {
  const id = widgetId();
  if (!id) return fallbackData();

  // `caches.default` is a Cloudflare Workers extension not in the DOM lib types.
  const cache =
    typeof caches !== 'undefined'
      ? (caches as unknown as { default?: Cache }).default
      : undefined;

  // Build time (static pages, no Cache API): fetch directly, fall back to JSON.
  if (!cache) return (await fetchFromFeaturable(id)) ?? fallbackData();

  const cacheReq = new Request(CACHE_KEY);
  const hit = await cache.match(cacheReq);
  let cached: { at: number; data: ReviewsData } | null = null;
  if (hit) {
    cached = await hit
      .json()
      .then((v: unknown) => v as { at: number; data: ReviewsData })
      .catch(() => null);
  }

  if (cached && Date.now() - cached.at < FRESH_MS) return cached.data;

  const refresh = (async () => {
    const data = await fetchFromFeaturable(id);
    if (data) {
      await cache.put(
        cacheReq,
        new Response(JSON.stringify({ at: Date.now(), data }), {
          headers: {
            'content-type': 'application/json',
            'cache-control': `max-age=${CACHE_RETAIN_SECONDS}`,
          },
        }),
      );
    }
    return data;
  })();

  // Stale copy on hand: serve it now, refresh in the background.
  if (cached) {
    if (ctx?.waitUntil) ctx.waitUntil(refresh);
    else void refresh;
    return cached.data;
  }

  // Cold cache: wait for the first fetch, fall back to bundled JSON.
  return (await refresh) ?? fallbackData();
}
