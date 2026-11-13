import {BlogShell} from '@/components/blog/public-blog';
import {getRequestLocale} from '@/lib/i18n/server';
export default async function BlogNotFound() {
  const locale = await getRequestLocale(), en = locale === 'en';
  return <BlogShell locale={locale}><section className="mk-wrap dp-blog-masthead"><span className="mk-kicker">404</span><h1>{en ? 'Article' : 'Artikel'} <em>{en ? 'not found.' : 'niet gevonden.'}</em></h1><p>{en ? 'This article is no longer available or has not been published.' : 'Dit artikel is niet meer beschikbaar of is nog niet gepubliceerd.'}</p><a className="mk-cta" href={`/${locale}/blog`}>{en ? 'Back to the blog' : 'Terug naar het blog'}</a></section></BlogShell>;
}
