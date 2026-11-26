/** Browser behavior with the real components and an explicit, local-only admin API mock. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {chromium, expect} from '@playwright/test';
import type {BlogAdminEntry, BlogArticle, BlogDraft} from '../../packages/contracts/src/blog';

const temporary = await mkdtemp(join(tmpdir(), 'dartspoint-blog-ui-'));
const bundle = join(temporary, 'ui.js');
await build({
  stdin: {resolveDir: process.cwd(), loader: 'tsx', contents: `
    import {createRoot} from 'react-dom/client';
    import {BlogAdmin} from './apps/web/components/blog/blog-admin';
    import {BlogCredentials} from './apps/web/components/blog/blog-credentials';
    import {BlogIndex} from './apps/web/components/blog/public-blog';
    const view=new URLSearchParams(location.search).get('view');
    createRoot(document.getElementById('root')).render(view==='connection'?<BlogCredentials/>:view==='public'?<BlogIndex {...window.__publicProps}/>:<BlogAdmin onRegisterNavigationGuard={()=>{}}/>);
  `},
  bundle: true, outfile: bundle, platform: 'browser', jsx: 'automatic', alias: {'@': resolve('apps/web')},
  define: {'process.env.APP_ENV': '"development"', 'process.env.NEXT_PUBLIC_APP_URL': '"http://127.0.0.1:4300"', 'process.env.BLOG_CANONICAL_NL_ORIGIN': 'undefined', 'process.env.BLOG_CANONICAL_EN_ORIGIN': 'undefined'},
  plugins: [{name: 'isolate-auth-and-navigation-only', setup(builder) {
    builder.onResolve({filter: /^@\/lib\/i18n\/provider$/}, () => ({path: 'locale', namespace: 'test'}));
    builder.onResolve({filter: /^@\/lib\/platform-client$/}, () => ({path: 'platform', namespace: 'test'}));
    builder.onResolve({filter: /^@\/components\/darts-marketing$/}, () => ({path: 'navigation', namespace: 'test'}));
    builder.onLoad({filter: /.*/, namespace: 'test'}, ({path}) => ({loader: 'tsx', contents: path === 'locale' ? 'export const useI18n=()=>({locale:document.documentElement.lang,t:(key)=>key});' : path === 'platform' ? 'export const getPlatform=()=>({actor:{role:"owner"}});' : 'export const MarketingNav=()=>null;'}));
  }}],
});

const taxonomy = {authors: [{id: 'redactie', name: 'DartsPoint Redactie', active: true}], categories: [{id: 'speltips', name: 'Speltips', active: true}, {id: 'community', name: 'Community', active: true}]};
const stamp = '2026-11-26T10:00:00.000Z';
function makeEntry(index: number, published = false): BlogAdminEntry {
  const id = randomUUID(), assetId = randomUUID();
  const draft: BlogDraft = {title: published ? 'Gepubliceerd artikel' : 'Concept ' + index, slug: published ? 'vaste-gepubliceerde-url' : 'concept-' + index, slugMode: 'auto', excerpt: 'Een samenvatting voor de browsercontrole.', type: 'blog', locale: 'nl-NL', authorId: 'redactie', author: 'DartsPoint Redactie', categoryId: index % 2 ? 'speltips' : 'community', category: index % 2 ? 'Speltips' : 'Community', tags: ['501'], content: {type: 'doc', schemaVersion: 1, content: [{type: 'paragraph', content: [{type: 'text', text: 'Bestaande inhoud.'}]}]}, hero: {assetId, url: '/api/blog-media/' + assetId, width: 800, height: 1000, alt: 'Een dartbord.', focalPoint: {x: .5, y: .5}}, seo: {title: '', description: ''}};
  return {id, revision: 1, liveRevision: published ? 1 : null, draft, live: published ? {...draft, id, revision: 1, publishedAt: stamp, updatedAt: stamp} : null, updatedAt: stamp, source: 'redactie', publicationState: published ? 'published' : null};
}
let entries = [makeEntry(0, true), ...Array.from({length: 31}, (_, index) => makeEntry(index + 1))];
const publishedId = entries[0].id;
type Policy = {draftEnabled: boolean; publishEnabled: boolean};
type Connection = Policy & {connectionId: string; destinationId: string; status: string; environment: string; siteId: string; origin: string; scopes: string[]; lastCheckedAt: string | null};
let connection: Connection | null = null, defaults: Policy = {draftEnabled: true, publishEnabled: true};
let interruptPair = true, confirmPublication = false;
const commands: any[] = [], queries: URLSearchParams[] = [];
const checks: string[] = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url!, 'http://127.0.0.1');
  const send = (value: unknown, status = 200) => {response.writeHead(status, {'Content-Type': 'application/json'}); response.end(JSON.stringify(value));};
  let body: any;
  if (request.method === 'POST') {let text = ''; for await (const chunk of request) text += chunk; body = JSON.parse(text);}
  if (url.pathname === '/api/blog-admin/socialhero') {
    if (body) {
      commands.push(body);
      if (body.action === 'pair') {
        connection ??= {connectionId: 'mock-connection', destinationId: 'mock-destination', status: 'pending', environment: 'staging', siteId: 'dartspoint', origin: 'https://staging.dartspoint.nl', scopes: ['read'], lastCheckedAt: null, draftEnabled: body.draftEnabled, publishEnabled: body.publishEnabled};
        if (interruptPair) {interruptPair = false; send({code: 'SOCIALHERO_UNAVAILABLE', message: 'Controlled unavailable response', requestId: 'mock-request'}, 503); return;}
        connection.status = 'active';
      }
      if (body.action === 'check' && connection) {connection.status = 'active'; connection.lastCheckedAt = stamp;}
      if (body.action === 'policy' && connection) {assert.equal(body.destinationId, connection.destinationId); assert.equal(typeof body.draftEnabled, 'boolean'); assert.equal(typeof body.publishEnabled, 'boolean'); defaults = {draftEnabled: body.draftEnabled, publishEnabled: body.publishEnabled}; Object.assign(connection, defaults);}
      if (body.action === 'disconnect' && connection) connection.status = 'revoked';
      if (connection) connection.scopes = ['read', ...(connection.draftEnabled ? ['draft'] : []), ...(connection.publishEnabled ? ['publish'] : [])];
    }
    send({configured: true, connection, pairingDefaults: defaults}); return;
  }
  if (url.pathname === '/api/blog-admin/taxonomy') {
    if (body) {
      const list = body.kind === 'author' ? taxonomy.authors : taxonomy.categories;
      if (body.action === 'create') list.push({id: randomUUID(), name: body.name, active: true});
      else {const record = list.find(item => item.id === body.id)!; if (body.name !== undefined) record.name = body.name; if (body.active !== undefined) record.active = body.active; if (body.action === 'archive') record.active = false;}
    }
    send(taxonomy); return;
  }
  if (url.pathname === '/api/blog-admin/publish') {
    const entry = entries.find(item => item.id === body.id)!;
    entry.liveRevision = entry.revision; entry.publicationState = 'publishing'; entry.publicationId = randomUUID();
    entry.live = {...entry.draft, id: entry.id, revision: entry.revision, publishedAt: stamp, updatedAt: stamp};
    send({entry}, 202); return;
  }
  if (url.pathname === '/api/blog-admin') {
    if (body) {
      let entry = entries.find(item => item.id === body.id);
      if (entry) {entry.draft = body.draft; entry.revision++;}
      else {entry = {id: randomUUID(), revision: 1, liveRevision: null, draft: body.draft, live: null, source: 'redactie', updatedAt: stamp}; entries.unshift(entry);}
      send({entry}); return;
    }
    if (url.searchParams.has('id')) {const entry = entries.find(item => item.id === url.searchParams.get('id'))!; if (confirmPublication && entry.publicationState === 'publishing') entry.publicationState = 'published'; send({entry}); return;}
    queries.push(url.searchParams);
    const page = Number(url.searchParams.get('page') || 1), pageSize = Number(url.searchParams.get('pageSize') || 20), query = url.searchParams.get('q') || '', category = url.searchParams.get('categoryId'), locale = url.searchParams.get('locale');
    const matching = entries.filter(entry => (!locale || entry.draft.locale === locale) && (!category || entry.draft.categoryId === category) && entry.draft.title.toLowerCase().includes(query.toLowerCase()));
    send({entries: matching.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: matching.length, hasMore: matching.length > page * pageSize}); return;
  }
  if (url.pathname === '/ui.js' || url.pathname === '/ui.css') {response.writeHead(200, {'Content-Type': url.pathname.endsWith('css') ? 'text/css' : 'text/javascript'}); response.end(await readFile(url.pathname.endsWith('css') ? bundle.replace(/\.js$/, '.css') : bundle)); return;}
  if (url.pathname.startsWith('/api/blog-media/')) {response.writeHead(200, {'Content-Type': 'image/svg+xml'}); response.end('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#183c29"/></svg>'); return;}
  const publicArticles = entries.filter(entry => entry.live).map(entry => entry.live) as BlogArticle[];
  const publicProps = {articles: publicArticles, categories: taxonomy.categories, category: 'speltips', query: '501', locale: 'nl', pagination: {page: 2, pageSize: 12, total: 36, hasMore: true}};
  response.writeHead(200, {'Content-Type': 'text/html'}); response.end(`<html lang="${url.searchParams.get('lang') === 'en' ? 'en' : 'nl'}"><head><link rel="stylesheet" href="/ui.css"/></head><body><div id="root"></div><script>window.__publicProps=${JSON.stringify(publicProps).replace(/</g, '\\u003c')};globalThis.__name=(fn)=>fn;</script><script src="/ui.js"></script></body></html>`);
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); assert.ok(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1100}}), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/?view=connection', {waitUntil: 'domcontentloaded'});
  const consent = page.getByRole('group', {name: 'Rechten bij koppelen'}), draftChoice = consent.getByRole('checkbox', {name: 'SocialHero mag concepten aanleveren'}), publishChoice = consent.getByRole('checkbox', {name: 'SocialHero mag automatisch publiceren'});
  await expect(draftChoice).toBeChecked(); await expect(publishChoice).toBeChecked();
  await draftChoice.click(); await expect(publishChoice).not.toBeChecked(); await expect(publishChoice).toBeDisabled();
  await draftChoice.click(); await expect(publishChoice).not.toBeChecked(); await publishChoice.click();
  const code = page.getByRole('textbox', {name: 'Eenmalige koppelcode'}); await code.fill('LOCAL-MOCK-PAIRING'); await page.getByRole('button', {name: 'Koppelen', exact: true}).click();
  await page.getByRole('alert').waitFor(); await expect(code).toHaveValue('LOCAL-MOCK-PAIRING'); await page.getByText('Wacht op bevestiging', {exact: true}).waitFor();
  await page.getByRole('button', {name: 'Verbinding controleren', exact: true}).click(); await expect(code).toHaveValue('');
  await expect(page.locator('time')).toHaveAttribute('datetime', stamp);
  const active = page.getByRole('group', {name: 'Rechten van deze verbinding'}), activeDraft = active.getByRole('checkbox', {name: 'SocialHero mag concepten aanleveren'}), activePublish = active.getByRole('checkbox', {name: 'SocialHero mag automatisch publiceren'});
  await activePublish.click(); await expect(activePublish).not.toBeChecked();
  await page.reload(); await expect(publishChoice).not.toBeChecked();
  await code.fill('LOCAL-MOCK-REPAIR'); await page.getByRole('button', {name: 'Opnieuw koppelen', exact: true}).click(); await expect(activePublish).not.toBeChecked();
  await activeDraft.click(); await expect(activeDraft).not.toBeChecked(); await activeDraft.click(); await expect(activeDraft).toBeChecked(); await expect(activePublish).not.toBeChecked();
  checks.push('Explicit new-destination consent, draft/publish dependency, retry preserves input, pending recovery, last checked and retained opt-out on re-pair');

  await page.goto(origin + '/?view=admin', {waitUntil: 'domcontentloaded'});
  await expect(page.locator('.dpba-entry')).toHaveCount(20); await page.getByRole('button', {name: 'Volgende', exact: true}).click(); await expect(page.locator('.dpba-entry')).toHaveCount(12); await page.getByRole('button', {name: 'Vorige', exact: true}).click();
  await page.getByLabel('Filter op categorie', {exact: true}).selectOption('speltips'); await expect(page.locator('.dpba-entry')).toHaveCount(16); assert.ok(queries.some(query => query.get('categoryId') === 'speltips'));
  await page.getByLabel('Filter op categorie', {exact: true}).selectOption('');
  await page.getByText('Auteurs en categorieën beheren', {exact: true}).click();
  const authorSection = page.locator('.dpba-taxonomy-grid > section').first();
  await authorSection.getByRole('textbox', {name: 'Nieuwe auteur', exact: true}).fill('Nieuwe Schrijver'); await authorSection.getByRole('button', {name: 'Toevoegen', exact: true}).click();
  const authorName = page.getByRole('textbox', {name: 'Naam auteur: Nieuwe Schrijver'}); await authorName.fill('Nieuwe Coach'); await authorName.locator('..').locator('..').getByRole('button', {name: 'Nieuwe Schrijver opslaan'}).click();
  const authorRow = page.getByRole('textbox', {name: 'Naam auteur: Nieuwe Coach'}).locator('..').locator('..');
  await authorRow.getByRole('button', {name: 'Archiveren'}).click(); await authorRow.getByRole('button', {name: 'Herstellen'}).click();
  const categorySection = page.locator('.dpba-taxonomy-grid > section').nth(1); await categorySection.getByRole('textbox', {name: 'Nieuwe categorie', exact: true}).fill('Training'); await categorySection.getByRole('button', {name: 'Toevoegen', exact: true}).click();
  await page.getByRole('textbox', {name: 'Naam categorie: Training'}).waitFor();
  checks.push('Server pagination and category filter; runtime author/category create, edit, archive and restore');

  await page.getByRole('button', {name: 'Nieuw artikel', exact: true}).click();
  await page.getByLabel('Auteur', {exact: true}).selectOption({label: 'Nieuwe Coach'}); await page.getByLabel('Categorie', {exact: true}).selectOption({label: 'Training'});
  const title = page.getByRole('textbox', {name: /^Titel/}), slug = page.getByRole('textbox', {name: /^URL-slug/});
  await title.fill('Eerste automatische titel'); await expect(slug).toHaveValue('eerste-automatische-titel');
  await page.getByRole('button', {name: 'Concept opslaan', exact: true}).click(); await page.getByText('Concept opgeslagen.', {exact: true}).waitFor();
  await title.fill('Tweede automatische titel'); await expect(slug).toHaveValue('tweede-automatische-titel'); await page.getByRole('button', {name: 'Concept opslaan', exact: true}).click();
  await page.getByText('Concept opgeslagen.', {exact: true}).waitFor(); await page.getByRole('button', {name: 'Alle artikelen', exact: true}).click(); await page.locator('.dpba-entry').filter({hasText: 'Tweede automatische titel'}).click();
  await title.fill('Derde automatische titel'); await expect(slug).toHaveValue('derde-automatische-titel'); await slug.fill('bewust-eigen-adres'); await title.fill('Vierde automatische titel'); await expect(slug).toHaveValue('bewust-eigen-adres');
  await page.getByRole('button', {name: 'Concept opslaan', exact: true}).click(); await page.getByText('Concept opgeslagen.', {exact: true}).waitFor();
  const saved = entries.find(entry => entry.draft.title === 'Vierde automatische titel')!; assert.equal(saved.draft.slugMode, 'manual'); assert.equal(saved.draft.author, 'Nieuwe Coach'); assert.equal(saved.draft.category, 'Training');
  await page.getByRole('button', {name: 'Alle artikelen', exact: true}).click(); await page.locator('.dpba-entry').filter({hasText: 'Gepubliceerd artikel'}).click();
  await title.fill('Nieuwe titel bij gepubliceerd artikel'); await expect(slug).toHaveValue('vaste-gepubliceerde-url');
  const picker = page.getByRole('button', {name: 'Focuspunt kiezen; gebruik ook de pijltjestoetsen'}), bounds = await picker.boundingBox(); assert.ok(bounds); await picker.click({position: {x: bounds.width * .2, y: bounds.height * .7}});
  const x = page.getByRole('slider', {name: 'Horizontaal'}), y = page.getByRole('slider', {name: 'Verticaal'}); assert.ok(Math.abs(Number(await x.inputValue()) - 20) <= 1); assert.ok(Math.abs(Number(await y.inputValue()) - 70) <= 1);
  checks.push('Draft slug follows titles across save/reopen until explicit edit; published URL stays stable; visual focal point updates crop coordinates');
  await page.getByRole('button', {name: 'Concept opslaan', exact: true}).click(); await page.getByText('Revisie opgeslagen. De huidige versie blijft zichtbaar tot je publiceert.', {exact: true}).waitFor();
  await page.getByRole('button', {name: 'Publiceren', exact: true}).click(); await page.getByRole('dialog').getByRole('button', {name: 'Publiceren', exact: true}).click();
  await page.getByText('De publicatie wordt gecontroleerd. De bevestiging verschijnt automatisch zodra de juiste revisie openbaar is aangetroffen.', {exact: true}).waitFor(); await expect(page.getByText('De nieuwe versie staat op de blog.', {exact: true})).toHaveCount(0);
  confirmPublication = true; await page.getByText('De nieuwe versie staat op de blog.', {exact: true}).waitFor(); assert.equal(entries.find(entry => entry.id === publishedId)!.publicationState, 'published');
  checks.push('Pending publication does not claim success; selected revision polling confirms completion');
  await page.goto(origin + '/?view=public', {waitUntil: 'domcontentloaded'}); await expect(page.locator('.dp-blog-card time')).toHaveCount(1); await expect(page.locator('.dp-blog-featured')).toHaveCount(0);
  const next = page.getByRole('link', {name: 'Volgende', exact: true}); const nextUrl = new URL((await next.getAttribute('href'))!, origin); assert.equal(nextUrl.searchParams.get('page'), '3'); assert.equal(nextUrl.searchParams.get('q'), '501'); assert.equal(nextUrl.searchParams.get('categorie'), 'speltips');
  await page.goto(origin + '/?view=connection&lang=en', {waitUntil: 'domcontentloaded'}); await page.getByRole('group', {name: 'Permissions when connecting'}).waitFor(); await page.getByText('Last checked', {exact: true}).waitFor();
  assert.deepEqual(errors, []); checks.push('Public cards show dates; pagination preserves filters; English consent and local-check labels; no browser errors');
  console.log(JSON.stringify({event: 'blog_ui_enhancements_passed',scope: 'real React/TipTap components; local mocked admin/provider responses; no external mutations',checks}, null, 2));
} catch (error) {console.error(JSON.stringify({event: 'blog_ui_enhancements_failed',completedChecks: checks,message: error instanceof Error ? error.message : String(error)}, null, 2)); throw error;} finally {await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(temporary, {recursive: true, force: true});}
