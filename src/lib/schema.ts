import site from '../content/site.json';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function buildLocalBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: site.name,
    legalName: site.legalName,
    telephone: site.phone,
    url: site.url,
    logo: new URL('/web-app-manifest-512x512.png', site.url).toString(),
    image: new URL('/web-app-manifest-512x512.png', site.url).toString(),
    priceRange: '$$',
    areaServed: site.serviceAreas.map((name) => ({ '@type': 'City', name })),
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
      name: site.name,
      telephone: site.phone,
      url: site.url,
    },
    areaServed: site.serviceAreas.map((areaName) => ({ '@type': 'City', name: areaName })),
  };
}
