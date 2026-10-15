import type { MetadataRoute } from "next";
import {getLegalPublicBundle} from '../../../packages/data/src/legal';
import {searchContext} from '@/lib/seo';

export const dynamic = 'force-dynamic';

/** Public marketing and current published information only; never player data. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const {origin,indexable}=searchContext();
  if(!indexable)return [];
  const bundle=await getLegalPublicBundle();
  const documents=[['guide','/handleiding'],['privacy','/privacy'],['terms','/algemene-voorwaarden']] as const;
  return [
    {url: `${origin}/`},
    {url: `${origin}/contact`},
    ...documents.flatMap(([key,path])=>{
      const current=bundle.current[key];
      if(!current)return [];
      return [{url: `${origin}${path}`,lastModified:new Date(Math.max(new Date(current.publishedAt!).getTime(),new Date(current.effectiveAt!).getTime()))}];
    }),
  ];
}
