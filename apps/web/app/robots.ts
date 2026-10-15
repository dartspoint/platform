import type { MetadataRoute } from "next";
import {searchContext} from '@/lib/seo';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  // Crawlers must be able to read noindex headers/meta, including on staging.
  // robots.txt controls crawling; it is not an access or indexing barrier.
  if(!searchContext().indexable)return {rules:{userAgent:"*",allow:"/"}};
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/internal", "/internal/", "/healthz", "/readyz", "/_next/data/", "/landing/"],
    }],
    sitemap: "https://dartspoint.nl/sitemap.xml",
  };
}
