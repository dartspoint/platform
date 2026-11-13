/** Real local Next/Supabase HTTP acceptance; run scripts/test-blog-fixture.ts first. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {blogFixturePath} from '../helpers/blog-fixture';

assert.equal(process.env.APP_ENV,'development');
const fixture=JSON.parse(await readFile(blogFixturePath,'utf8'));
const origin=fixture.origin as string;assert.equal(new URL(origin).hostname,'127.0.0.1');
const token=fixture.credential.token as string,authorization='Bearer '+token,prefix=fixture.prefix+'-http-'+randomUUID().slice(0,8),checks:Record<string,boolean>={};
async function api(path:string,init:RequestInit={}){return fetch(origin+'/api/socialhero/v1'+path,{...init,headers:{Authorization:authorization,...init.headers}});}
async function json(response:Response,status:number){assert.equal(response.status,status,`Expected ${status} from ${new URL(response.url).pathname}`);assert.match(response.headers.get('cache-control')??'',/no-store/);assert.match(response.headers.get('x-request-id')??'',/^[0-9a-f-]{36}$/);return response.json();}
const key=(operation:string)=>prefix+':'+operation;
let publishedUrl='';
const caps=await json(await api('/capabilities'),200);assert.equal(caps.contractVersion,'1');assert.equal(caps.environment,'development');assert.ok(caps.canonicalOrigins['nl-NL'].includes(origin));assert.ok(caps.publicOrigins['nl-NL'].includes(origin));checks.realAuthenticatedCapabilities=true;
assert.equal((await fetch(origin+'/api/blog-admin')).status,401);
assert.equal((await fetch(origin+'/api/socialhero/v1/capabilities')).status,401);checks.anonymousAdminAndIntegrationDenied=true;
const image=await sharp({create:{width:800,height:1000,channels:3,background:'#38624c'}}).png().toBuffer();
function upload(name='hero.png'){const body=new FormData();body.set('file',new File([new Uint8Array(image)],name,{type:'image/png'}));return api('/media',{method:'POST',headers:{'Idempotency-Key':key('media')},body});}
const uploads=await Promise.all([upload(),upload()]);const media=await json(uploads[0],201);assert.deepEqual(await json(uploads[1],201),media);assert.equal(media.type,'image/webp');assert.equal(media.width,800);assert.equal(media.height,1000);
await json(await upload('different-name.png'),409);checks.decodedMediaConcurrentIdempotencyAndChangedPayloadConflict=true;
assert.ok([401,404].includes((await fetch(origin+media.url)).status));checks.unpublishedMediaPrivate=true;
const externalId=prefix,slug=prefix.toLowerCase(),title='Lokale HTTP-acceptatie voor DartsPoint';
const payload={type:'blog',locale:'nl-NL',title,slug,excerpt:'Deze eigen test controleert echte publicatie, revisies en metadata.',content:{format:'markdown',body:'## Een veilige test\n\nEen **werkelijk gepubliceerd** artikel met [interne link](/blog).\n\n- Eén resultaat\n- Dezelfde revisie'},seo:{title:title+' | DartsPoint',description:'Echte lokale HTTP-acceptatie van DartsPoint en SocialHero.'},authorId:'redactie',categoryId:'speltips',tags:['acceptatie'],hero:{assetId:media.assetId,alt:'Groene testillustratie in portretformaat.',focalPoint:{x:.4,y:.3}}};
const draftRequest=(value=payload,headers:Record<string,string>={})=>api('/posts/'+externalId,{method:'PUT',headers:{'Content-Type':'application/json','Idempotency-Key':key('draft'),...headers},body:JSON.stringify(value)});
await json(await draftRequest(),428);
const created=await draftRequest(payload,{'If-None-Match':'*'}),etag=created.headers.get('etag');const post=await json(created,201);assert.equal(etag,'"1"');
assert.deepEqual(await json(await draftRequest(payload,{'If-None-Match':'*'}),201),post);
await json(await draftRequest({...payload,title:'Gewijzigd'}, {'If-None-Match':'*'}),409);
assert.equal((await fetch(origin+'/blog/'+slug)).status,404);checks.createOnlyCASDraftIsolationAndReplay=true;
const publish=(revision:number,operation:string)=>api('/posts/'+externalId+'/publish',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key(operation)},body:JSON.stringify({revision})});
await json(await publish(2,'bad-revision'),412);
const live=await json(await publish(1,'publish'),200);publishedUrl=live.publicUrl;assert.equal(live.publishedRevision,1);assert.equal(publishedUrl,origin+'/blog/'+slug);
assert.deepEqual(await json(await publish(1,'publish'),200),live);checks.onlyExpectedRevisionPublishesAndReplay=true;
for(const agent of ['Mozilla/5.0','facebookexternalhit/1.1']){
 const response=await fetch(publishedUrl,{headers:{'User-Agent':agent}});assert.equal(response.status,200);const html=await response.text();
 assert.equal((html.match(/<h1(?:\s[^>]*)?>/g)??[]).length,1);
 assert.match(html,/<meta[^>]+name="socialhero:revision"[^>]+content="1"/);
 assert.ok(html.includes(`content="${externalId}"`));assert.ok(html.includes(`href="${publishedUrl}"`));
 for(const term of ['og:url','og:type','og:image:width','og:image:height','twitter:card','application/ld+json','BlogPosting'])assert.ok(html.includes(term),term);
 assert.match(html,/<meta[^>]+name="robots"[^>]+content="noindex/);
}
checks.directHTMLAndCrawlerMetadataAndPublicRevisionProof=true;
const publicImage=await fetch(origin+media.url);assert.equal(publicImage.status,200);assert.equal(publicImage.headers.get('content-type'),'image/webp');const decoded=await sharp(Buffer.from(await publicImage.arrayBuffer())).metadata();assert.equal(decoded.width,800);assert.equal(decoded.height,1000);
const share=await fetch(origin+media.url+'?variant=share&x=.4&y=.3');assert.equal(share.status,200);const shareMetadata=await sharp(Buffer.from(await share.arrayBuffer())).metadata();assert.equal(shareMetadata.width,1200);assert.equal(shareMetadata.height,630);checks.publicImageMimeDimensionsAndShareFallback=true;
const updatePayload={...payload,title:title+' — nieuwe werkversie'};
const updated=await json(await api('/posts/'+externalId,{method:'PUT',headers:{'Content-Type':'application/json','Idempotency-Key':key('update'),'If-Match':etag!},body:JSON.stringify(updatePayload)}),200);assert.equal(updated.revision,2);
assert.equal((await json(await api('/posts/'+externalId),200)).publishedRevision,1);
const oldHTML=await (await fetch(publishedUrl)).text();assert.equal(oldHTML.includes('nieuwe werkversie'),false);await json(await publish(1,'stale-publish'),412);checks.newDraftPreservesLiveAndStalePublicationRejected=true;
const alias=slug+'-nieuw';
await json(await api('/posts/'+externalId,{method:'PUT',headers:{'Content-Type':'application/json','Idempotency-Key':key('slug'),'If-Match':'"2"'},body:JSON.stringify({...updatePayload,slug:alias})}),200);
const next=await json(await publish(3,'slug-publish'),200);const redirect=await fetch(publishedUrl,{redirect:'manual'});assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),next.publicUrl);checks.permanentAliasFollowsLatestLive=true;
const unknown=await fetch(origin+'/blog/unknown-'+randomUUID());assert.equal(unknown.status,404);assert.match(await unknown.text(),/noindex/);checks.missingRouteNoindex=true;
await mkdir('artifacts/blog',{recursive:true});await writeFile('artifacts/blog/http-results.json',JSON.stringify({environment:'local-real-next-supabase',adapter:false,publicUrl:next.publicUrl,publishedRevision:3,checks},null,2));
console.log(JSON.stringify({event:'blog_real_http_acceptance_passed',checks:Object.keys(checks).length,publicUrl:next.publicUrl,publishedRevision:3}));
