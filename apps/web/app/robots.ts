import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  if(process.env.APP_ENV!=="production")return {rules:{userAgent:"*",disallow:"/"}};
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/beheer", "/lobby", "/spelen", "/clubhuis", "/divisies", "/toernooi/", "/oefenen", "/inloggen", "/registreren", "/mailvoorbeelden", "/focus", "/club", "/arena", "/broadcast", "/league"],
    }],
    sitemap: "https://dartspoint.nl/sitemap.xml",
  };
}
