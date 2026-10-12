import type { MetadataRoute } from "next";

/** Only the public marketing document belongs in search results. */
export default function sitemap(): MetadataRoute.Sitemap {
  if(process.env.APP_ENV!=="production")return [];
  return [{ url: "https://dartspoint.nl", changeFrequency: "weekly", priority: 1 }];
}
