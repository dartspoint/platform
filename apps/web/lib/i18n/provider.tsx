"use client";
import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';
import {message, type Catalog, type Values} from '../../../../packages/i18n/src/messages';
import {isLocale, formatLocales, publicLocalePath, type Locale} from '../../../../packages/i18n/src/locale';
import feedbackNl from "../../../../packages/i18n/src/catalogs/feedback.nl.json";
import feedbackEn from "../../../../packages/i18n/src/catalogs/feedback.en.json";
import * as common from '../../../../packages/i18n/src/catalogs/common';

type Context = {locale: Locale; publicPage: boolean; setLocale: (locale: Locale) => void; syncAccount: (locale: unknown) => void; catalogs: Record<string, Record<string, Catalog>>};
const I18nContext = createContext<Context | null>(null);
export function LocaleProvider({initialLocale, publicPage, catalogs = {}, children}: {initialLocale: Locale; publicPage: boolean; catalogs?: Record<string, Record<string, Catalog>>; children: ReactNode}) {
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
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n(module = 'common') {
  const context = useContext(I18nContext);
  if (!context) throw new Error('LocaleProvider is required');
  const {locale} = context;
  const catalog = module === 'common' ? common[locale] : module==='feedback' ? (locale==='en'?feedbackEn:feedbackNl) : context.catalogs[locale]?.[module];
  return {...context, formatLocale: formatLocales[locale], t: (key: string, values?: Values) => message(catalog ?? {}, locale, key, values), href: (path: string) => publicLocalePath(path, locale)};
}
