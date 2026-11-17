import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';

// Public-page checks only: safe to run against a deployed release without an
// account, OTP request, database connection, or production test fixture.
const origin=new URL(process.env.APP_ORIGIN??process.env.E2E_ORIGIN??'http://127.0.0.1:4300').origin;
const directory='artifacts/login-navigation';
const copy={
 nl:{login:'Inloggen',heading:'Schuif aan.',scene:/Nog één\s*potje\./,email:'E-mailadres',placeholder:'jij@voorbeeld.nl',submit:'Ontvang je inlogcode',google:'Doorgaan met Google',register:'Maak het jouw avond',registration:/Jouw plek aan\s*het bord\./,returning:'Welkom terug'},
 en:{login:'Sign in',heading:'Join us.',scene:/One more\s*game\./,email:'Email address',placeholder:'you@example.com',submit:'Get your sign-in code',google:'Continue with Google',register:'Make it your evening',registration:/Your place at\s*the board\./,returning:'Welcome back'},
};
type Locale=keyof typeof copy;
const scenarios:[string,Locale][]=[['/','nl'],['/nl','nl'],['/en','en']];
const results:{home:string;locale:Locale;clientNavigation:true;backForward:true;languageDraftPreserved:true;registration:true}[]=[];
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
await mkdir(directory,{recursive:true});
try{
 for(const [home,locale] of scenarios){
  const context=await browser.newContext({viewport:{width:1366,height:900},locale:locale==='nl'?'nl-NL':'en-GB',reducedMotion:'reduce'});
  const fallbacks:{path:string;text:string}[]=[],errors:string[]=[],writeRequests:string[]=[],documents:string[]=[];
  await context.exposeBinding('__loginFallbackDetected',(_source,value:{path:string;text:string})=>fallbacks.push(value));
  await context.addInitScript('globalThis.__name = (fn) => fn;');
  await context.addInitScript(()=>{
   let reported=false;
   const check=()=>{
    if(reported||!document.body)return;
    const text=document.body.innerText;
    const fallback=text.match(/Deze informatie is tijdelijk niet beschikbaar\.|This information is temporarily unavailable\./)?.[0];
    if(fallback){reported=true;void (window as any).__loginFallbackDetected({path:location.pathname,text:fallback});}
   };
   new MutationObserver(check).observe(document,{childList:true,subtree:true,characterData:true});
   document.addEventListener('DOMContentLoaded',check,{once:true});
  });
  // The browser may load the real CAPTCHA, but this test never starts an auth
  // flow. Reject any accidental write to the app as an additional live guard.
  await context.route('**/*',route=>{
   const request=route.request();
   if(new URL(request.url()).origin===origin&&!['GET','HEAD','OPTIONS'].includes(request.method())){
    writeRequests.push(request.method()+' '+new URL(request.url()).pathname);
    return route.abort('blockedbyclient');
   }
   return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.isNavigationRequest()&&request.resourceType()==='document'&&request.frame()===page.mainFrame())documents.push(request.url());});
  const assertHealthy=async()=>{
   assert.doesNotMatch(await page.locator('body').innerText(),/Deze informatie is tijdelijk niet beschikbaar\.|This information is temporarily unavailable\./,'No missing-translation fallback is rendered');
   assert.deepEqual(fallbacks,[],'No missing-translation fallback flashed during navigation');
   assert.deepEqual(errors,[],'Public navigation hydrates without browser errors');
   assert.deepEqual(writeRequests,[],'Public navigation must not send auth or other application writes');
  };
  const assertLogin=async(language:Locale)=>{
   await expect(page.locator('.dp-login-entry')).toBeVisible();
   await assertHealthy();
   await expect(page.locator('html')).toHaveAttribute('lang',language);
   await expect(page.getByRole('heading',{level:1})).toHaveText(copy[language].heading);
   await expect(page.locator('.dp-login-scene h2')).toHaveText(copy[language].scene);
   await expect(page.getByLabel(copy[language].email,{exact:true})).toHaveAttribute('placeholder',copy[language].placeholder);
   await expect(page.getByRole('button',{name:copy[language].submit,exact:true})).toBeVisible();
   await expect(page.getByRole('link',{name:copy[language].google,exact:true})).toHaveAttribute('href',new RegExp('[?&]locale='+language+'(?:&|$)'));
   await expect(page.getByLabel('Nederlands / English')).toHaveValue(language);
  };
  const sentinel=randomUUID();
  let documentCount=0;
  const assertSameDocument=async()=>{
   assert.equal(await page.evaluate(()=>(window as any).__loginNavigationSentinel),sentinel,'Login navigation must preserve the actual browser document');
   assert.equal(documents.length,documentCount,'Login navigation must not request another HTML document');
  };
  try{
   if(home==='/'){
    const redirect=await context.request.get(origin+'/oefenen',{maxRedirects:0});
    assert.equal(redirect.status(),307,'Guest access must redirect before streaming an authenticated page');
    assert.equal(new URL(redirect.headers().location,origin).pathname,'/inloggen');
   }
   await page.goto(origin+home,{waitUntil:'networkidle'});
   await expect(page.locator('html')).toHaveAttribute('lang',locale);
   const login=page.locator('.mk-login-link');
   await expect(login).toHaveText(copy[locale].login);
   await page.evaluate(value=>{(window as any).__loginNavigationSentinel=value;},sentinel);
   documentCount=documents.length;
   // Click the real homepage Next link. Direct page.goto('/inloggen') misses
   // the stale root-provider catalog bug reported by returning visitors.
   await login.click();
   await page.waitForURL(url=>url.pathname==='/'+locale+'/inloggen');
   await assertLogin(locale);await assertSameDocument();
   await page.screenshot({path:directory+'/'+(home==='/'?'root':locale)+'-login.png',fullPage:true});

   await page.goBack();
   await page.waitForURL(url=>url.pathname===home);
   await expect(page.locator('.mk-login-link')).toHaveText(copy[locale].login);
   await assertSameDocument();await assertHealthy();
   await page.goForward();
   await page.waitForURL(url=>url.pathname==='/'+locale+'/inloggen');
   await assertLogin(locale);await assertSameDocument();

   const other:Locale=locale==='nl'?'en':'nl',draft='navigation-regression@example.invalid';
   await page.getByLabel(copy[locale].email,{exact:true}).fill(draft);
   await page.getByLabel('Nederlands / English').selectOption(other);
   await assertLogin(other);await assertSameDocument();
   await expect(page.getByLabel(copy[other].email,{exact:true})).toHaveValue(draft);
   await page.getByLabel('Nederlands / English').selectOption(locale);
   await assertLogin(locale);await assertSameDocument();
   await expect(page.getByLabel(copy[locale].email,{exact:true})).toHaveValue(draft);

   // This existing plain anchor may perform a normal document navigation.
   // Its registration page must still receive the chosen language and copy.
   await page.getByRole('link',{name:copy[locale].register,exact:true}).click();
   await page.waitForURL(url=>/^\/(?:nl\/|en\/)?registreren$/.test(url.pathname));
   await expect(page.getByRole('heading',{level:1})).toHaveText(copy[locale].registration);
   await expect(page.locator('html')).toHaveAttribute('lang',locale);
   await expect(page.getByLabel(copy[locale].email,{exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:copy[locale].submit,exact:true})).toBeVisible();
   await expect(page.getByRole('link',{name:copy[locale].returning,exact:true})).toBeVisible();
   await assertHealthy();
   results.push({home,locale,clientNavigation:true,backForward:true,languageDraftPreserved:true,registration:true});
  }catch(error){
   await page.screenshot({path:directory+'/'+(home==='/'?'root':locale)+'-failure.png',fullPage:true}).catch(()=>{});
   console.error(JSON.stringify({event:'login_navigation_failure',origin,home,path:new URL(page.url()).pathname,locale,documentCount,documents:documents.length,fallbacks,errors,writeRequests}));
   throw error;
  }finally{await context.close();}
 }
 await writeFile(directory+'/results.json',JSON.stringify({ok:true,origin,readOnly:true,serverAuthRedirect:true,scenarios:results},null,2));
 console.log('Homepage client navigation to login, back/forward, bilingual labels, language draft preservation and registration passed');
}finally{await browser.close();}
