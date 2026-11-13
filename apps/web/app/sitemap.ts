import {listPublishedBlogArticles,blogPublicUrl,getPublishedBlogTranslations} from '../../../packages/data/src/blog';
import {canonicalOrigin} from '../../../packages/i18n/src/domains';
import type { MetadataRoute } from "next";
import {getLegalPublicBundle} from '../../../packages/data/src/legal';
import {searchContext} from '@/lib/seo';

export const dynamic = 'force-dynamic';

/** Public marketing and current published information only; never player data. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const {origin,indexable}=searchContext();
  if(!indexable)return [];
  const documents=[['guide','/handleiding'],['privacy','/privacy'],['terms','/algemene-voorwaarden']] as const;
  const [nl,en]=await Promise.all([getLegalPublicBundle('nl'),getLegalPublicBundle('en')]);
  const articles = await listPublishedBlogArticles();
  const marketing = (['nl','en'] as const).flatMap(locale=>{
    const primary=canonicalOrigin(locale),bundle=locale==='nl'?nl:en;
    const alternatives=(path:string)=>({languages:{nl:canonicalOrigin('nl')+path,en:canonicalOrigin('en')+path}});
    return [{url:primary+'/',alternates:alternatives('/')},{url:primary+'/contact',alternates:alternatives('/contact')},{url:primary+'/blog',alternates:alternatives('/blog')},...documents.flatMap(([key,path])=>{
      const current=bundle.current[key];if(!current)return [];
      return [{url:primary+path,lastModified:new Date(Math.max(new Date(current.publishedAt!).getTime(),new Date(current.effectiveAt!).getTime())),...(nl.current[key]&&en.current[key]?{alternates:alternatives(path)}:{})}];
    })];
  });
  const blog = await Promise.all(articles.map(async article => {
    const translations = await getPublishedBlogTranslations(article);
    return {url:blogPublicUrl(article), lastModified:new Date(article.updatedAt), ...(translations.length > 1 ? {alternates:{languages:Object.fromEntries(translations.map(other => [other.locale === "en-GB" ? "en" : "nl", blogPublicUrl(other)]))}} : {})};
  }));
  return [...marketing, ...blog];
}
