import assert from 'node:assert/strict';
import test from 'node:test';
import {buildCustomRoute} from 'next/dist/lib/build-custom-route.js';
import {checkCustomRoutes} from 'next/dist/lib/load-custom-routes.js';
import {matchHas} from 'next/dist/shared/lib/router/utils/prepare-destination.js';
import config from '../../apps/web/next.config';
import {MARKETING_DESCRIPTION, MARKETING_TITLE, marketingStructuredData, publicPageMetadata, searchContext} from '../../apps/web/lib/seo';

test('Only the configured production apex can opt into search',()=>{
  assert.equal(searchContext('production','https://dartspoint.nl').indexable,true);
  for(const [environment,url] of [
    ['staging','https://staging.dartspoint.nl'],['staging','https://dartspoint.nl'],
    ['production','https://staging.dartspoint.nl'],['production','https://www.dartspoint.nl'],
    ['production','http://dartspoint.nl'],['production','https://dartspoint.nl.evil.invalid'],
    ['production','https://user:secret@dartspoint.nl'],['production',undefined],
    ['development','http://127.0.0.1:4300'],
  ] as const)assert.equal(searchContext(environment,url).indexable,false,`${environment}: ${url}`);
});

test('Search metadata keeps staging and unpublished documents out of production canonicals',async()=>{
  const previous={APP_ENV:process.env.APP_ENV,NEXT_PUBLIC_APP_URL:process.env.NEXT_PUBLIC_APP_URL};
  try {
    process.env.APP_ENV='production';process.env.NEXT_PUBLIC_APP_URL='https://dartspoint.nl';
    const input={path:'/',title:MARKETING_TITLE,description:MARKETING_DESCRIPTION};
    assert.equal(publicPageMetadata(input).alternates?.canonical,'https://dartspoint.nl/');
    assert.equal((publicPageMetadata(input).robots as {index:boolean}).index,true);
    assert.equal(marketingStructuredData()?.['@graph'][0].url,'https://dartspoint.nl/');
    assert.equal(publicPageMetadata({...input,path:'/handleiding',available:false}).alternates?.canonical,null);
    assert.equal((publicPageMetadata({...input,available:false}).robots as {index:boolean}).index,false);
    process.env.APP_ENV='staging';process.env.NEXT_PUBLIC_APP_URL='https://staging.dartspoint.nl';
    const staging=publicPageMetadata(input);
    assert.equal(staging.alternates?.canonical,null);
    assert.equal((staging.robots as {index:boolean}).index,false);
    assert.equal(staging.openGraph?.url,'https://staging.dartspoint.nl/');
    assert.equal(JSON.stringify(staging).includes('https://dartspoint.nl'),false);
    assert.equal(marketingStructuredData(),null);
  } finally {
    for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});

test('Next route compiler applies noindex to private/API paths and every non-production hostname',async()=>{
  const previous={APP_ENV:process.env.APP_ENV,NEXT_PUBLIC_APP_URL:process.env.NEXT_PUBLIC_APP_URL};
  try {
    process.env.APP_ENV='production';process.env.NEXT_PUBLIC_APP_URL='https://dartspoint.nl';
    const routes=await config.headers!();checkCustomRoutes(routes,'header');
    const compiled=routes.map(route=>buildCustomRoute('header',route));
    const noindex=(path:string,host='dartspoint.nl')=>compiled.some(route=>new RegExp(route.regex).test(path)&&!!matchHas({headers:{host},cookies:{}} as never,{},route.has,route.missing));
    for(const path of ['/','/contact','/contact/','/handleiding','/privacy','/algemene-voorwaarden','/marketing/afterhours-hero.webp','/brand/wordmark.svg','/_next/static/chunk.js','/_next/image','/robots.txt','/sitemap.xml'])assert.equal(noindex(path),false,path);
    for(const path of ['/support','/mijn-tickets','/team/support','/account/privacy','/inloggen','/registreren','/beheer','/lobby','/spelen','/oefenen','/clubhuis','/divisies','/toernooi/42','/api/support/inbound','/api/documents','/internal','/healthz','/readyz','/opening','/landing/index.html','/contact-forged','/unknown'])assert.equal(noindex(path),true,path);
    for(const host of ['staging.dartspoint.nl','www.dartspoint.nl','preview.invalid','dartspoint.nl.evil.invalid'])assert.equal(noindex('/',host),true,host);
    process.env.APP_ENV='staging';process.env.NEXT_PUBLIC_APP_URL='https://staging.dartspoint.nl';
    const staging=await config.headers!();checkCustomRoutes(staging,'header');
    assert.equal(staging.length,1);
    for(const path of ['/','/contact','/mijn-tickets','/api/support/inbound'])assert.equal(new RegExp(buildCustomRoute('header',staging[0]).regex).test(path),true,path);
  } finally {
    for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
