import type {Metadata} from 'next';

export const PRODUCTION_ORIGIN = 'https://dartspoint.nl';
export const MARKETING_TITLE = 'Online darten tegen andere spelers | DartsPoint';
export const MARKETING_DESCRIPTION = 'Speel online darts tegen andere spelers, zonder eigen dartbord. Ontdek 301, 501 en 701, ontmoet vrienden in de kamers en doe mee aan toernooien.';

/** Only an explicitly configured production apex may advertise indexable pages. */
export function searchContext(environment = process.env.APP_ENV, appUrl = process.env.NEXT_PUBLIC_APP_URL) {
  let origin = 'http://localhost:4300';
  try {
    const configured = new URL(appUrl ?? '');
    if (['http:', 'https:'].includes(configured.protocol) && !configured.username && !configured.password) origin = configured.origin;
  } catch { /* Missing or invalid configuration stays non-indexable. */ }
  return {origin, indexable: environment === 'production' && origin === PRODUCTION_ORIGIN};
}

export function searchRobots(indexable = false): NonNullable<Metadata['robots']> {
  return {
    index: indexable,
    follow: indexable,
    googleBot: {index: indexable, follow: indexable, ...(indexable ? {'max-image-preview': 'large' as const} : {})},
  };
}

/** Public pages opt in; private routes inherit the root layout's noindex. */
export function publicPageMetadata({path, title, description, available = true}: {path: string; title: string; description: string; available?: boolean}): Metadata {
  const {origin, indexable} = searchContext();
  const mayIndex = indexable && available;
  const url = new URL(path, origin).href;
  const image = new URL('/marketing/dartspoint-share.png', origin).href;
  const socialTitle = title.includes('DartsPoint') ? title : `${title} · DartsPoint`;
  return {
    title: {absolute: socialTitle},
    description,
    alternates: {canonical: mayIndex ? url : null},
    robots: searchRobots(mayIndex),
    openGraph: {
      type: 'website', locale: 'nl_NL', siteName: 'DartsPoint', url,
      title: socialTitle, description,
      images: [{url: image, width: 1200, height: 630, alt: 'DartsPoint — Online darten. Jouw kamer, jouw avond.'}],
    },
    twitter: {card: 'summary_large_image', title: socialTitle, description, images: [image]},
  };
}

export function marketingStructuredData() {
  const {origin, indexable} = searchContext();
  if (!indexable) return null;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {'@type': 'WebSite', '@id': `${origin}/#website`, name: 'DartsPoint', url: `${origin}/`, inLanguage: 'nl-NL', description: MARKETING_DESCRIPTION},
      {'@type': 'WebPage', '@id': `${origin}/#webpage`, url: `${origin}/`, name: MARKETING_TITLE, description: MARKETING_DESCRIPTION, inLanguage: 'nl-NL', isPartOf: {'@id': `${origin}/#website`}},
    ],
  };
}
