import 'server-only';
import {headers, cookies} from 'next/headers';
import {catalogLoaders} from './catalog-loaders';
import routeModules from './route-modules.json';
import {domainLocale, isLocale, publicPaths, stripLocale, type Locale} from '../../../../packages/i18n/src/locale';
import {message, type Values} from '../../../../packages/i18n/src/messages';
import * as common from '../../../../packages/i18n/src/catalogs/common';

export async function getRequestLocale(): Promise<Locale> {
  const h = await headers(), path = h.get('x-dp-path') ?? '/', requested = h.get('x-dp-locale');
  if (publicPaths.includes(stripLocale(path)) && isLocale(requested)) return requested;
  const guest = (await cookies()).get('dp-locale')?.value;
  return isLocale(guest) ? guest : /^\/(en|nl)(\/|$)/.test(path)&&isLocale(requested)?requested:domainLocale(h.get('host') ?? '');
}
export async function getServerI18n(module = 'common', locale?: Locale) {
  locale ??= await getRequestLocale();
  const catalog = module === 'common' ? common[locale] : (await catalogLoaders[module + '.' + locale]()).default;
  return {locale, t: (key: string, values?: Values) => message(catalog, locale!, key, values)};
}
export async function loadRouteCatalogs(path: string) {
  const clean = stripLocale(path), routes = routeModules as Record<string, string[]>;
  const route = routes[clean] ? clean : Object.keys(routes).sort((a,b)=>b.length-a.length).find(route => new RegExp('^' + route.replace(/\[[^\]]+\]/g, '[^/]+') + '/?$').test(clean));
  const modules = routes[route ?? '/'] ?? [];
  return Object.fromEntries(await Promise.all((['nl', 'en'] as const).map(async locale => [locale, Object.fromEntries(await Promise.all(modules.map(async module => [module, (await catalogLoaders[module + '.' + locale]()).default])))])));
}
