import type { NextConfig } from "next";

// Keep config self-contained: Next's CommonJS config loader does not use the
// application's TypeScript module resolver for relative helper imports.
function productionSearchBuild() {
  try {
    const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? '');
    return process.env.APP_ENV === 'production' && ['https://dartspoint.nl','https://dartspoint.app'].includes(appUrl.origin) && !appUrl.username && !appUrl.password;
  } catch { return false; }
}

const noindex = [{key: 'X-Robots-Tag', value: 'noindex, nofollow'}];
const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
  experimental: { cpus: 2 },
  async headers() {
    // These rules are captured in the environment-specific build. Runtime page
    // metadata and robots/sitemap additionally check the current configuration.
    if (!productionSearchBuild()) return [{source: '/:path*', headers: noindex}];
    return [
      // A production image exposed on another hostname must stay out of search.
      {source: '/:path*', missing: [{type: 'host', value: '(?:dartspoint\\.nl|dartspoint\\.app)'}], headers: noindex},
      // Public information and rendering assets may be crawled. Every other
      // path, including new account/team/ticket routes and APIs, is noindex.
      {source: '/:path((?!$|(?:(?:nl|en)/?)?$|(?:(?:nl|en)/)?(?:contact|handleiding|privacy|algemene-voorwaarden)/?$|(?:_next/static|_next/image|marketing|brand|icons)(?:/|$)|(?:favicon\\.svg|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest)$).*)', headers: noindex},
    ];
  },
};
export default config;
