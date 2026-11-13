import assert from 'node:assert/strict';
import {readFile, writeFile, stat} from 'node:fs/promises';
import {chromium} from '@playwright/test';
assert.equal(process.env.APP_ENV, 'development', 'This mutation test uses a development fixture only');
const fixturePath = process.env.BLOG_UI_FIXTURE ?? 'artifacts/blog/local-fixture.private.json';
assert.equal((await stat(fixturePath)).mode & 0o077,0);
const fixture = JSON.parse(await readFile(fixturePath,'utf8')) as {origin:string;prefix:string;session:Record<string,unknown>;posts:{live?:{id:string;slug:string;locale:string;revision:number}}[]};
const origin = fixture.origin;
assert.ok(['http://127.0.0.1:4300','http://localhost:4300'].includes(origin), 'Unexpected fixture origin');
const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
const results: {checks:string[];screenshots:string[];errors:string[];manualPost?:{id:string;url:string};failure?:string;alerts?:string[];screenshotsRequested?:boolean;ok?:boolean} = {checks:[],screenshots:[],errors:[]};
const context = await browser.newContext({viewport:{width:1440,height:1100},permissions:['clipboard-read','clipboard-write']});
await context.addInitScript('globalThis.__name = (fn) => fn; Object.defineProperty(navigator, "share", {configurable:true, value:async(data) => {window.__blogNativeShare = data;}});');
results.screenshotsRequested=process.env.BLOG_CAPTURE_SCREENSHOTS==='1';
const page = await context.newPage();
page.on('pageerror',error=>results.errors.push(error.message));
async function capture(name:string) {
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+' no overflow');
  if (!results.screenshotsRequested) return;
  for (const img of await page.locator('img').all()) {
    await img.scrollIntoViewIfNeeded();
    await img.evaluate(element => {const image=element as HTMLImageElement;return image.complete ? undefined : new Promise<void>(resolve => {image.addEventListener('load',()=>resolve(),{once:true});image.addEventListener('error',()=>resolve(),{once:true});});});
  }
  await page.evaluate(async()=>{(document.activeElement as HTMLElement | null)?.blur();scrollTo({top:0,behavior:"instant"});await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
  const path=`artifacts/blog/${name}.png`;await page.screenshot({path,fullPage:true});results.screenshots.push(path);
}
try {

 await page.goto(origin+'/blog',{waitUntil:'networkidle'});
 assert.equal(await page.locator('.dp-blog-featured').count(),1);
 await capture('index-desktop');await page.setViewportSize({width:768,height:1024});await capture('index-tablet');await page.setViewportSize({width:390,height:844});await capture('index-mobile');
 results.checks.push('Public desktop, tablet and mobile index has no horizontal overflow');
 await page.locator('.dp-blog-filters a').filter({hasText:'Speltips'}).click();
 assert.equal(await page.locator('.dp-blog-featured').count(),0);
 for (const category of await page.locator('.dp-blog-category').allTextContents()) assert.equal(category,'Speltips');
 await page.locator('input[type=search]').fill('501');await page.locator('input[type=search]').press('Enter');
 await page.waitForURL('**/blog?**q=501**');assert.ok(await page.locator('.dp-blog-card').count()>0);
 await page.locator('input[type=search]').fill('no-such-blog-article-xyz');await page.locator('input[type=search]').press('Enter');await page.locator('.dp-blog-empty').waitFor();assert.match(await page.locator('.dp-blog-empty').innerText(),/Geen artikelen/);
 results.checks.push('Category filter, search results and empty search state');
 const first=fixture.posts.find(entry=>entry.live?.locale==='nl-NL')?.live;assert.ok(first);
 await page.goto(origin+'/blog/'+first.slug,{waitUntil:'networkidle'});assert.equal(await page.locator('h1').count(),1);await capture('article-mobile');await page.setViewportSize({width:1440,height:1100});await capture('article-desktop');
 const canonical=await page.locator('link[rel=canonical]').getAttribute('href');assert.equal(canonical,origin+'/blog/'+first.slug);
 assert.equal(await page.locator('meta[property="og:type"]').getAttribute('content'),'article');assert.equal(await page.locator('meta[name="socialhero:revision"]').getAttribute('content'),String(first.revision));
 const english=await page.locator('link[rel=alternate][hreflang=en]').getAttribute('href');assert.ok(english);
 await page.getByRole('button',{name:'Delen',exact:true}).click();await page.waitForFunction(() => !!(window as any).__blogNativeShare);assert.equal(await page.evaluate(()=>(window as any).__blogNativeShare.url),canonical);
 await page.getByRole('button',{name:'Kopieer link',exact:true}).click();await page.getByText('Link gekopieerd',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),canonical);
 results.checks.push('Native share handler (browser stub) and real clipboard copy use the canonical URL');
 await page.getByLabel('Nederlands / English').first().selectOption('en');await page.waitForURL(english);
 assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),english);assert.equal(await page.locator('link[rel=alternate][hreflang=nl]').getAttribute('href'),canonical);await capture('article-english');
 results.checks.push('NL/EN switch follows actual translated slug with reciprocal canonical/hreflang');
 await page.goto(origin+'/beheer/blog',{waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,'/inloggen');
 await page.goto(origin+'/beheer/blog/preview/'+first.id,{waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,'/inloggen');
 results.checks.push('Anonymous administration and saved-revision preview redirect to sign in');

 await context.addCookies([{name:'dp-locale',value:'nl',url:origin}]);
 const cookieName='sb-'+new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]+'-auth-token';
 const encoded='base64-'+Buffer.from(JSON.stringify(fixture.session)).toString('base64url'), pieces=encoded.match(/.{1,3180}/g)!;
 await context.addCookies(pieces.map((value,index)=>({name:cookieName+(pieces.length>1?'.'+index:''),value,url:origin,secure:false,sameSite:'Lax',httpOnly:false})));
 await page.goto(origin+'/beheer/blog',{waitUntil:'networkidle'});await page.locator('.dp-blog-admin').waitFor();await page.getByRole('button',{name:'Nieuw artikel',exact:true}).waitFor();await capture('admin-desktop');
 await page.setViewportSize({width:390,height:844});await capture('admin-mobile');await page.setViewportSize({width:1440,height:1100});
 await page.getByRole('button',{name:'Nieuw artikel',exact:true}).click();await page.locator('.dp-blog-editor [contenteditable=true]').waitFor();
 const title=fixture.prefix+' UI redactie '+Date.now().toString().slice(-6);await page.getByRole('textbox',{name:/^Titel/}).fill(title);await page.getByRole('textbox',{name:/^Samenvatting/}).fill('Een echte browserproef voor redactie, afbeeldingen en opmaak.');
 const editor=page.locator('.dp-blog-editor [contenteditable=true]');await editor.fill('Dit is de introductie uit de browserproef.');await editor.press('End');await editor.press('Enter');await page.getByLabel('Tekststijl',{exact:true}).selectOption('2');await page.keyboard.type('Een kop voor de redactie');await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'Vet',exact:true}).click();await page.keyboard.type('Een duidelijke conclusie.');await page.getByRole('button',{name:'Vet',exact:true}).click();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Opsomming',exact:true}).click();await page.keyboard.type('Eerste oefening');await page.keyboard.press('Enter');await page.keyboard.type('Tweede oefening');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
 await page.getByRole('button',{name:'Tabel invoegen',exact:true}).click();await editor.locator('th p').first().click();await page.keyboard.type('Onderdeel');await editor.locator('td p').first().click();await page.keyboard.type('Controle');
 await editor.press('Control+End');await page.getByRole('button',{name:'Afbeelding invoegen of wijzigen',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.locator('input[type=file]').setInputFiles('apps/web/public/blog/checkout-hero.webp');await dialog.getByLabel('Alt-tekst',{exact:true}).fill('Een dartpijl in het dartbord.');await dialog.getByLabel('Bijschrift (optioneel)').fill('Eigen afbeelding met onderschrift.');await dialog.getByRole('button',{name:'Invoegen',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const hero=page.locator('.dpba-image-field').first();await hero.locator('input[type=file]').setInputFiles('apps/web/public/blog/checkout-hero.webp');await hero.locator('img').waitFor();await hero.getByRole('textbox').fill('Een dartpijl bij de rode binnenring van het dartbord.');
 await page.getByRole('button',{name:'Concept opslaan',exact:true}).click();await page.getByText('Concept opgeslagen.',{exact:true}).waitFor();await capture('editor-desktop');await page.setViewportSize({width:390,height:844});await capture('editor-mobile');await page.setViewportSize({width:1440,height:1100});
 const previewHref=await page.getByRole('link',{name:'Opgeslagen revisie'}).getAttribute('href');assert.ok(previewHref); const entryId=previewHref.split('/').at(-1)!.split('?')[0];
 await page.reload({waitUntil:'networkidle'});await page.locator('.dpba-entry').filter({hasText:title}).click();await editor.waitFor();assert.equal(await editor.locator('h2').innerText(),'Een kop voor de redactie');assert.equal(await editor.locator('strong').innerText(),'Een duidelijke conclusie.');assert.equal(await editor.locator('ul li').count(),2);assert.equal(await editor.locator('table').count(),1);assert.equal(await editor.locator('img').count(),1);results.checks.push('TipTap H2, bold, list, table and owned inline image persisted after reload');
 await page.getByRole('button',{name:'Publiceren',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Publiceren',exact:true}).click();await page.getByText('De nieuwe versie staat op de blog.',{exact:true}).waitFor();const liveHref=await page.getByRole('link',{name:'Bekijk live',exact:true}).getAttribute('href');
 assert.ok(liveHref); await page.goto(liveHref,{waitUntil:'networkidle'});assert.equal(await page.locator('h1').innerText(),title);assert.equal(await page.locator('.dp-blog-prose table').count(),1);assert.equal(await page.locator('figcaption').innerText(),'Eigen afbeelding met onderschrift.');results.checks.push('Manual draft published through UI; public rich-text renderer preserves table and image caption');results.manualPost={id:entryId,url:liveHref};
 const previewPage=await context.newPage();await previewPage.goto(origin+previewHref,{waitUntil:'networkidle'});assert.match(await previewPage.locator('h1').innerText(),/Afgeschermd artikelvoorbeeld/);assert.equal(await previewPage.locator('meta[name=robots]').getAttribute('content'),'noindex, nofollow');await previewPage.close();results.checks.push('Authorized persisted revision preview stays noindex');
 assert.deepEqual(results.errors,[]); results.ok=true; await writeFile('artifacts/blog/browser-result.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
} catch(error) {results.failure=error instanceof Error ? error.message : String(error); console.error(results.failure); results.alerts=await page.locator("[role=alert]").allTextContents().catch(()=>[]); await page.screenshot({path:"artifacts/blog/browser-failure.png",fullPage:true}).catch(()=>{});  await writeFile("artifacts/blog/browser-result.json",JSON.stringify(results,null,2)); throw error;} finally {await browser.close();}
