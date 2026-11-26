import {Suspense} from 'react';
import BlogLoading from '@/components/blog/blog-loading';
import {BlogIndex} from '@/components/blog/public-blog';
import {getRequestLocale} from '@/lib/i18n/server';
import {publicPageMetadata} from '@/lib/seo';
import {listPublicBlogPage} from '../../../../packages/data/src/blog-query';
import {publicBlogTaxonomy} from '../../../../packages/data/src/blog-taxonomy';
export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const locale = await getRequestLocale(), en = locale === 'en';
  return publicPageMetadata({path: '/blog', locale, translatedAvailable: true, title: 'DartsPoint blog', description: en ? 'Read playing tips, checkout routes and stories about online darts and the DartsPoint community.' : 'Lees speltips, checkoutroutes en verhalen over online darten en de DartsPoint-community.'});
}
async function BlogArticles({searchParams}: {searchParams: Promise<{categorie?: string; q?: string; page?: string}>}) {
  const [params, locale] = await Promise.all([searchParams, getRequestLocale()]);
  const taxonomy=await publicBlogTaxonomy(),rawCategory=typeof params.categorie==='string'?params.categorie:undefined;
  const category=taxonomy.categories.find(item=>item.id===rawCategory||item.name===rawCategory)?.id;
  const query=typeof params.q==='string'?params.q.slice(0,120):'';
  const page=typeof params.page==='string'&&/^[1-9][0-9]{0,3}$/.test(params.page)?Number(params.page):1;
  const result=await listPublicBlogPage(locale==='en'?'en-GB':'nl-NL',{page,pageSize:12,q:query,...(category?{categoryId:category}:{})});
  return <BlogIndex articles={result.items} locale={locale} category={category} query={query} categories={taxonomy.categories} pagination={result}/>;
}

export default function BlogPage(props: {searchParams: Promise<{categorie?: string; q?: string; page?: string}>}) {
  return <Suspense fallback={<BlogLoading/>}><BlogArticles {...props}/></Suspense>;
}
