"use client";
import {createContext, Suspense, use, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {message, type Catalog, type Values} from '../../../../packages/i18n/src/messages';
import {isLocale, formatLocales, publicLocalePath, publicPaths, stripLocale, type Locale} from '../../../../packages/i18n/src/locale';
import {catalogLoaders} from './catalog-loaders';
import feedbackNl from "../../../../packages/i18n/src/catalogs/feedback.nl.json";
import feedbackEn from "../../../../packages/i18n/src/catalogs/feedback.en.json";
import * as common from '../../../../packages/i18n/src/catalogs/common';

type Context = {locale: Locale; publicPage: boolean; setLocale: (locale: Locale) => void; syncAccount: (locale: unknown) => void; catalogs: Record<string, Record<string, Catalog>>};
const I18nContext = createContext<Context | null>(null);
// The root layout persists during navigation. Its server catalogs only cover
// the initial route, so suspend on a shared import for newly visited modules.
// Load both languages together to keep subsequent language changes synchronous.
const clientCatalogs = new Map<string, Promise<Record<Locale, Catalog>>>();
function loadClientCatalogs(module: string) {
  let pending = clientCatalogs.get(module);
  if (!pending) {
    pending = Promise.all([catalogLoaders[module + '.nl'](), catalogLoaders[module + '.en']()])
      .then(([nl, en]) => ({nl: nl.default, en: en.default}));
    clientCatalogs.set(module, pending);
  }
  return pending;
}
export function LocaleProvider({initialLocale, publicPage: initialPublicPage, catalogs = {}, children}: {initialLocale: Locale; publicPage: boolean; catalogs?: Record<string, Record<string, Catalog>>; children: ReactNode}) {
  const pathname = usePathname();
  const publicPage = pathname ? publicPaths.includes(stripLocale(pathname)) : initialPublicPage;
  const [locale, updateLocale] = useState(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    document.cookie = `dp-locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    document.documentElement.lang=next;
    updateLocale(next);
  }, []);
  const syncAccount = useCallback((next: unknown) => {if (!publicPage && isLocale(next)) {document.documentElement.lang=next;updateLocale(next);}}, [publicPage]);
  useEffect(() => {document.documentElement.lang = locale;document.cookie=`dp-ui-locale=${locale}; Path=/; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;}, [locale]);
  const value = useMemo(() => ({locale, setLocale, syncAccount, publicPage, catalogs}), [locale, setLocale, syncAccount, publicPage, catalogs]);
  return <I18nContext.Provider value={value}><Suspense fallback={<p role="status">{message(common[locale], locale, 'common.loading')}</p>}>{children}</Suspense></I18nContext.Provider>;
}
export function useI18n(module = 'common') {
  const context = useContext(I18nContext);
  if (!context) throw new Error('LocaleProvider is required');
  const {locale} = context;
  const serverCatalog = module === 'common' ? common[locale] : module==='feedback' ? (locale==='en'?feedbackEn:feedbackNl) : context.catalogs[locale]?.[module];
  const catalog = serverCatalog ?? use(loadClientCatalogs(module))[locale];
  return {...context, formatLocale: formatLocales[locale], t: (key: string, values?: Values) => message(catalog, locale, key, values), href: (path: string) => publicLocalePath(path, locale)};
}
