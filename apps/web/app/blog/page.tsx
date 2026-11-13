import {Suspense} from 'react';
import BlogLoading from '@/components/blog/blog-loading';
import {BlogIndex} from '@/components/blog/public-blog';
import {getRequestLocale} from '@/lib/i18n/server';
import {publicPageMetadata} from '@/lib/seo';
import {listPublishedBlogArticles} from '../../../../packages/data/src/blog';
export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const locale = await getRequestLocale(), en = locale === 'en';
  return publicPageMetadata({path: '/blog', locale, translatedAvailable: true, title: 'DartsPoint blog', description: en ? 'Read playing tips, checkout routes and stories about online darts and the DartsPoint community.' : 'Lees speltips, checkoutroutes en verhalen over online darten en de DartsPoint-community.'});
}
async function BlogArticles({searchParams}: {searchParams: Promise<{categorie?: string; q?: string}>}) {
  const [params, locale] = await Promise.all([searchParams, getRequestLocale()]);
  const articles = await listPublishedBlogArticles(locale === 'en' ? 'en-GB' : 'nl-NL');
  return <BlogIndex articles={articles} locale={locale} category={typeof params.categorie === 'string' ? params.categorie : undefined} query={typeof params.q === 'string' ? params.q.slice(0, 120) : ''}/>;
}

export default function BlogPage(props: {searchParams: Promise<{categorie?: string; q?: string}>}) {
  return <Suspense fallback={<BlogLoading/>}><BlogArticles {...props}/></Suspense>;
}
