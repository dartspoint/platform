export const locales = ['nl', 'en'] as const;
export type Locale = typeof locales[number];
export const formatLocales: Record<Locale, string> = {nl: 'nl-NL', en: 'en-GB'};
export function isLocale(value: unknown): value is Locale {return value === 'nl' || value === 'en';}
export function resolveLocale(input: {explicit?: unknown; account?: unknown; guest?: unknown; domain: Locale}): Locale {
  return [input.explicit, input.account, input.guest].find(isLocale) ?? input.domain;
}
export const publicPaths = ['/', '/contact', '/handleiding', '/privacy', '/algemene-voorwaarden'];
export function stripLocale(path: string) {return path.replace(/^\/(nl|en)(?=\/|$)/, '') || '/';}
export function publicLocalePath(path: string, locale: Locale) {
  const clean = stripLocale(path);
  return `/${locale}${clean === '/' ? '' : clean}`;
}
export function domainLocale(host: string): Locale {return host.split(':')[0].endsWith('dartspoint.app') ? 'en' : 'nl';}
export function localisedHref(value:string,locale:Locale) {
 if(!value.startsWith('/')||value.startsWith('//'))return value;
 const path=value.split(/[?#]/)[0],suffix=value.slice(path.length),clean=stripLocale(path);
 return publicPaths.includes(clean)||['/inloggen','/registreren','/support'].includes(clean)?publicLocalePath(clean,locale)+suffix:value;
}
