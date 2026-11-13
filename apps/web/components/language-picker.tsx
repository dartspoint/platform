"use client";
import {useState} from 'react';
import {useI18n} from '@/lib/i18n/provider';
import {getPlatform, api} from '@/lib/platform-client';
import {publicLocalePath, stripLocale, type Locale} from '../../../packages/i18n/src/locale';
export function LanguagePicker() {
  const {locale, setLocale, publicPage, t} = useI18n();
  const [error, setError] = useState(false), [busy, setBusy] = useState(false);
  async function change(next: Locale) {
    if (next === locale) return;
    setError(false);
    if (publicPage) {setLocale(next); const article = /^\/blog\//.test(stripLocale(location.pathname)); const alternate = article ? document.querySelector<HTMLLinkElement>(`link[rel="alternate"][hreflang="${next}"]`)?.href : undefined; const path = article ? "/blog" : location.pathname; location.assign(alternate ?? (publicLocalePath(path, next) + (article ? "" : location.search + location.hash))); return;}
    const previous = locale;
    setLocale(next);
    if (!getPlatform().actor) return;
    setBusy(true);
    try {await api('preferences', {locale: next});} catch {setLocale(previous); setError(true);} finally {setBusy(false);}
  }
  return <span className="dp-language-picker"><label><span className="sr-only">{t('language.label')}</span><select aria-label="Nederlands / English" value={locale} disabled={busy} onChange={e => void change(e.target.value as Locale)}><option value="nl" lang="nl">Nederlands</option><option value="en" lang="en">English</option></select></label>{error && <span role="alert">{t('language.saveFailed')}</span>}</span>;
}
