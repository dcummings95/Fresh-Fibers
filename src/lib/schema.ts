import site from '../content/site.json';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function buildLocalBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    // Stable identifier so every page's copy of this block resolves to one
    // business rather than reading as a separate entity per URL.
    '@id': `${site.url}/#business`,
    name: site.name,
    legalName: site.legalName,
    telephone: site.phone,
    email: site.email,
    url: site.url,
    logo: new URL('/web-app-manifest-512x512.png', site.url).toString(),
    image: new URL('/og-image.jpg', site.url).toString(),
    priceRange: '$$',
    // No street address: this is a mobile, service-area business, so the
    // base city plus the service radius below is what's actually true.
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Winona',
      addressRegion: 'MN',
      addressCountry: 'US',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: site.mapCenter.lat,
      longitude: site.mapCenter.lng,
    },
    areaServed: site.serviceAreas.map((name) => ({ '@type': 'City', name })),
    serviceArea: {
      '@type': 'GeoCircle',
      geoMidpoint: {
        '@type': 'GeoCoordinates',
        latitude: site.mapCenter.lat,
        longitude: site.mapCenter.lng,
      },
      geoRadius: Math.round(site.serviceRadiusMiles * 1609.34),
    },
    sameAs: [site.instagramUrl, site.googleBusinessProfileUrl],
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: DAYS,
        opens: '08:00',
        closes: '19:00',
      },
    ],
  };
}

export function buildFaqSchema(faq: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
}

export function buildServiceSchema(name: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    description,
    provider: {
      '@type': 'LocalBusiness',
      '@id': `${site.url}/#business`,
      name: site.name,
      telephone: site.phone,
      url: site.url,
    },
    areaServed: site.serviceAreas.map((areaName) => ({ '@type': 'City', name: areaName })),
  };
}
