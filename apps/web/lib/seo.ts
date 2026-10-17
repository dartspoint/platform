import {canonicalOrigin} from '../../../packages/i18n/src/domains';
import type {Locale} from '../../../packages/i18n/src/locale';
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
  return {origin, indexable: environment === 'production' && [PRODUCTION_ORIGIN,'https://dartspoint.app'].includes(origin)};
}

export function searchRobots(indexable = false): NonNullable<Metadata['robots']> {
  return {
    index: indexable,
    follow: indexable,
    googleBot: {index: indexable, follow: indexable, ...(indexable ? {'max-image-preview': 'large' as const} : {})},
  };
}

/** Public pages opt in; private routes inherit the root layout's noindex. */
export function publicPageMetadata({path, title, description, available = true, locale='nl', translatedAvailable=true}: {path: string; title: string; description: string; available?: boolean; locale?:Locale; translatedAvailable?:boolean}): Metadata {
  const {origin, indexable} = searchContext();
  const mayIndex = indexable && available;
  const url = new URL(path, indexable?canonicalOrigin(locale):origin).href;
  const image = new URL('/marketing/dartspoint-share.png', origin).href;
  const socialTitle = title.includes('DartsPoint') ? title : `${title} · DartsPoint`;
  return {
    title: {absolute: socialTitle},
    description,
    alternates: {canonical: mayIndex ? url : null,...(mayIndex&&translatedAvailable?{languages:{nl:new URL(path,canonicalOrigin('nl')).href,en:new URL(path,canonicalOrigin('en')).href,'x-default':new URL(path,canonicalOrigin('en')).href}}:{})},
    robots: searchRobots(mayIndex),
    openGraph: {
      type: 'website', locale: locale==='en'?'en_GB':'nl_NL',alternateLocale:locale==='en'?['nl_NL']:['en_GB'], siteName: 'DartsPoint', url,
      title: socialTitle, description,
      images: [{url: image, width: 1200, height: 630, alt: locale==='en'?'DartsPoint — Online darts. Your room. Your evening.':'DartsPoint — Online darten. Jouw kamer, jouw avond.'}],
    },
    twitter: {card: 'summary_large_image', title: socialTitle, description, images: [image]},
  };
}

export function marketingStructuredData(locale:Locale='nl') {
  const {origin, indexable} = searchContext();
  if (!indexable) return null;
  const canonical=canonicalOrigin(locale),description=locale==='en'?EN_MARKETING_DESCRIPTION:MARKETING_DESCRIPTION,title=locale==='en'?EN_MARKETING_TITLE:MARKETING_TITLE;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {'@type': 'WebSite', '@id': `${canonical}/#website`, name: 'DartsPoint', url: `${canonical}/`, inLanguage:locale==='en'?'en-GB':'nl-NL',description},
      {'@type': 'WebPage', '@id': `${canonical}/#webpage`, url: `${canonical}/`, name:title,description,inLanguage:locale==='en'?'en-GB':'nl-NL', isPartOf: {'@id': `${canonical}/#website`}},
    ],
  };
}

export const EN_MARKETING_TITLE='Online darts against other players | DartsPoint';
export const EN_MARKETING_DESCRIPTION='Play online darts against other players, without a physical dartboard. Explore 301, 501 and 701, meet friends in the rooms and join tournaments.';
