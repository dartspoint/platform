import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/beheer", "/lobby", "/spelen", "/clubhuis", "/divisies", "/toernooi/", "/oefenen", "/inloggen", "/registreren", "/mailvoorbeelden", "/focus", "/club", "/arena", "/broadcast", "/league"],
    }],
    sitemap: "https://dartspoint-afterhours-studio.dgwebserv.chatgpt.site/sitemap.xml",
  };
}
