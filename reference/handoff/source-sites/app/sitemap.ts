import type { MetadataRoute } from "next";

/** Only the public marketing document belongs in search results. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://dartspoint-afterhours-studio.dgwebserv.chatgpt.site", changeFrequency: "weekly", priority: 1 }];
}
