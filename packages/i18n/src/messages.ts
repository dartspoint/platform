import {IntlMessageFormat} from 'intl-messageformat';
import {formatLocales, type Locale} from './locale';
export type Catalog = Record<string, string>;
export type Values = Record<string, string | number | boolean | Date | undefined | null>;
const compiled = new Map<string, IntlMessageFormat>();
export function message(catalog: Catalog, locale: Locale, key: string, values?: Values): string {
  const source = catalog[key];
  if (source === undefined) {
    if (process.env.NODE_ENV !== 'production') throw new Error(`Missing translation: ${locale}:${key}`);
    return locale === 'en' ? 'This information is temporarily unavailable.' : 'Deze informatie is tijdelijk niet beschikbaar.';
  }
  const cacheKey = locale + ':' + source;
  let formatter = compiled.get(cacheKey);
  if (!formatter) {formatter = new IntlMessageFormat(source, formatLocales[locale], undefined, {ignoreTag: true}); if (compiled.size > 4000) compiled.clear(); compiled.set(cacheKey, formatter);}
  return String(formatter.format(values ? Object.fromEntries(Object.entries(values).map(([key,value])=>[key,value??''])) : undefined));
}
