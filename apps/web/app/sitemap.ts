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
  return (['nl','en'] as const).flatMap(locale=>{
    const primary=canonicalOrigin(locale),bundle=locale==='nl'?nl:en;
    const alternatives=(path:string)=>({languages:{nl:canonicalOrigin('nl')+path,en:canonicalOrigin('en')+path}});
    return [{url:primary+'/',alternates:alternatives('/')},{url:primary+'/contact',alternates:alternatives('/contact')},...documents.flatMap(([key,path])=>{
      const current=bundle.current[key];if(!current)return [];
      return [{url:primary+path,lastModified:new Date(Math.max(new Date(current.publishedAt!).getTime(),new Date(current.effectiveAt!).getTime())),...(nl.current[key]&&en.current[key]?{alternates:alternatives(path)}:{})}];
    })];
  });
}
