import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {isPublicPath, localisedHref} from '../../packages/i18n/src/locale';
import {publicPageMetadata} from '../../apps/web/lib/seo';
import nextConfig from '../../apps/web/next.config';
import robots from '../../apps/web/app/robots';
const require = createRequire(import.meta.url);
const {pathToRegexp} = require('next/dist/compiled/path-to-regexp');

test('production crawlers may fetch share images while other API paths remain excluded',()=>{
  const previousEnvironment=process.env.APP_ENV,previousUrl=process.env.NEXT_PUBLIC_APP_URL;
  try{
    process.env.APP_ENV='production';process.env.NEXT_PUBLIC_APP_URL='https://dartspoint.nl';
    const policy=robots(),rules=Array.isArray(policy.rules)?policy.rules:[policy.rules];
    assert.ok(rules.some(rule=>Array.isArray(rule.allow)&&rule.allow.includes('/api/blog-media/')));
    assert.ok(rules.some(rule=>Array.isArray(rule.disallow)&&rule.disallow.includes('/api/')));
  }finally{
    if(previousEnvironment===undefined)delete process.env.APP_ENV;else process.env.APP_ENV=previousEnvironment;
    if(previousUrl===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=previousUrl;
  }
});

test('blog index and article language aliases share public route recognition', () => {
  for (const path of ['/blog', '/nl/blog', '/en/blog', '/blog/501-checkouts', '/en/blog/how-to-practise']) assert.equal(isPublicPath(path), true, path);
  for (const path of ['/beheer/blog', '/beheer/blog/preview/private', '/blog-preview/private', '/api/blog-admin', '/blog/a/b']) assert.equal(isPublicPath(path), false, path);
  assert.equal(localisedHref('/blog?q=checkout#artikelen', 'en'), '/en/blog?q=checkout#artikelen');
});

test('public metadata advertises another language only when explicitly available', () => {
  const previousEnvironment = process.env.APP_ENV, previousUrl = process.env.NEXT_PUBLIC_APP_URL;
  try {
    process.env.APP_ENV = 'production'; process.env.NEXT_PUBLIC_APP_URL = 'https://dartspoint.nl';
    const unpaired = publicPageMetadata({path:'/blog/a-real-slug',title:'Article',description:'Description'});
    assert.equal(unpaired.alternates?.languages, undefined);
    assert.equal((unpaired.openGraph as {alternateLocale?:unknown}).alternateLocale, undefined);
    const paired = publicPageMetadata({path:'/blog',title:'Blog',description:'Description',translatedAvailable:true});
    assert.deepEqual(paired.alternates?.languages, {nl:'https://dartspoint.nl/blog',en:'https://dartspoint.app/blog','x-default':'https://dartspoint.app/blog'});
  } finally {
    if (previousEnvironment===undefined) delete process.env.APP_ENV; else process.env.APP_ENV=previousEnvironment;
    if (previousUrl===undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL=previousUrl;
  }
});

test('production blog crawl allowlist keeps previews, administration and integration endpoints excluded', async () => {
  const previousEnvironment = process.env.APP_ENV, previousUrl = process.env.NEXT_PUBLIC_APP_URL;
  try {
    process.env.APP_ENV = 'production'; process.env.NEXT_PUBLIC_APP_URL = 'https://dartspoint.nl';
    const rules = await nextConfig.headers!();
    const matcher = pathToRegexp(rules.find(rule=>rule.source.includes('(?!'))!.source);
    for (const path of ['/blog','/blog/501-checkouts','/en/blog/how-to-practise','/blog/checkout-hero.webp','/api/blog-media/12345678-1234-1234-1234-123456789012']) assert.equal(matcher.test(path),false,path);
    for (const path of ['/beheer/blog','/beheer/blog/preview/123','/blog-preview/123','/api/blog-admin','/api/socialhero/v1/capabilities','/api/blog-media/private/key']) assert.equal(matcher.test(path),true,path);
    process.env.APP_ENV='staging';
    const staging = await nextConfig.headers!();
    assert.deepEqual(staging,[{source:'/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'}]}]);
  } finally {
    if (previousEnvironment===undefined) delete process.env.APP_ENV; else process.env.APP_ENV=previousEnvironment;
    if (previousUrl===undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL=previousUrl;
  }
});
