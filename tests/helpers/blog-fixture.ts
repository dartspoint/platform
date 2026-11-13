import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,unlink} from 'node:fs/promises';
import sharp from 'sharp';
import {Pool} from 'pg';
import {authAdmin,verifyToken} from '../../packages/data/src/auth';
import {createBlogToken,saveBlogDraft,publishBlog,storeBlogMedia} from '../../packages/data/src/blog';
import {BLOG_SCOPES,type BlogDraft} from '../../packages/contracts/src/blog';
import {db} from '../../packages/data/src/db';

export const blogFixturePath=process.env.BLOG_TEST_FIXTURE??'artifacts/blog/local-fixture.private.json';
export async function createLocalBlogFixture(){
  assert.equal(process.env.APP_ENV,'development');
  for(const key of ['DATABASE_URL','MIGRATION_DATABASE_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_APP_URL'])assert.equal(new URL(process.env[key]!).hostname,'127.0.0.1');
  const control=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL,max:1});
  const prefix='qa-blog-'+randomUUID().slice(0,8),email=prefix+'@dartspoint.local',password=randomUUID()+randomUUID();
  try{
    const created=await authAdmin().auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);
    const id=created.data.user!.id;
    await control.query('update public.profiles set username=$2,onboarded_at=now() where id=$1',[id,'Blog'+prefix.slice(-8)]);
    await control.query("insert into public.user_roles(user_id,role,granted_by) values($1,'owner',$1)",[id]);
    const login=await authAdmin().auth.signInWithPassword({email,password});assert.equal(login.error,null);
    const session=login.data.session!,actor=await verifyToken(session.access_token);
    const credential=await createBlogToken(actor,{label:prefix,scopes:BLOG_SCOPES,expiresAt:new Date(Date.now()+86400000).toISOString()});
    const posts=[];
    const examples=[
      {slug:'501-checkouts-oefenen',title:'501-checkouts oefenen: van denken naar durven',key:'checkout',categoryId:'speltips',category:'Speltips',excerpt:'Je staat op een finish. De kamer kijkt mee. Met een vaste route in je hoofd gooi je met meer rust — ook als het spannend wordt.'},
      {slug:'online-darten-zonder-dartbord',title:'Online darten. Gewoon vanuit je luie stoel.',key:'online-darts',categoryId:'online-darten',category:'Online darten',excerpt:'Een dartbord aan de muur is niet nodig. Ontdek je digitale worp, vind je ritme en speel samen een potje 501.'},
      {slug:'samen-een-clubavond',title:'Een clubavond begint met één potje.',key:'clubavond',categoryId:'community',category:'Community',excerpt:'Een vertrouwde kamer, een nieuwe tegenstander en nog één laatste leg. Zo voelt een avond bij DartsPoint.'},
    ] as const;
    for(const example of examples){
      const original=await readFile(`apps/web/public/blog/${example.key}-hero.webp`),decoded=await sharp(original).webp().toBuffer({resolveWithObject:true});
      const media=await storeBlogMedia(actor,{bytes:decoded.data,width:decoded.info.width,height:decoded.info.height,mime:'image/webp'});
      const draft:BlogDraft={slug:example.slug+'-'+prefix.slice(-8),title:example.title,excerpt:example.excerpt,locale:'nl-NL',type:'blog',authorId:'redactie',author:'DartsPoint Redactie',categoryId:example.categoryId,category:example.category,tags:['501','oefenen'],hero:{...media,alt:'Dartpijlen bij een verlicht dartbord tijdens een gezellige speelavond.',focalPoint:{x:.55,y:.4}},seo:{title:example.title+' | DartsPoint',description:example.excerpt},content:{type:'doc',schemaVersion:1,content:[{type:'paragraph',content:[{type:'text',text:example.excerpt}]},{type:'heading',attrs:{level:2},content:[{type:'text',text:'Vind je eigen ritme'}]},{type:'paragraph',content:[{type:'text',text:'Begin met een rustige oefenronde. Kies een route, bekijk je score en neem de tijd voor je volgende worp.'}]},{type:'heading',attrs:{level:2},content:[{type:'text',text:'Maak er een vaste gewoonte van'}]},{type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'Oefen elke dag een paar minuten.'}]}]},{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'Speel samen en bespreek je favoriete finish.'}]}]}]},{type:'blockquote',content:[{type:'paragraph',content:[{type:'text',text:'Een goede avond begint met plezier in het spel.'}]}]},{type:'heading',attrs:{level:2},content:[{type:'text',text:'Tijd voor je volgende potje'}]},{type:'paragraph',content:[{type:'text',text:'Open de lobby',marks:[{type:'link',attrs:{href:'/lobby'}}]},{type:'text',text:' en zoek een tegenstander. Tot aan de oche!'}]}]}};
      // Only canonical presentation fields enter the saved draft.
      draft.hero={assetId:media.assetId,url:media.url,width:media.width,height:media.height,alt:draft.hero.alt,focalPoint:draft.hero.focalPoint};
      const saved=await saveBlogDraft(actor,{draft,requestId:randomUUID()});
      const published=await publishBlog(actor,{id:saved.id,revision:saved.revision,requestId:randomUUID()});posts.push(published);
    }
    const translated:BlogDraft={...posts[0].draft,locale:'en-GB',slug:'practise-501-checkouts-'+prefix.slice(-8),title:'Practise 501 checkouts with confidence',excerpt:'Choose your finish, find your rhythm and enjoy an evening of darts.',translationOfId:posts[0].id,seo:{title:'Practise 501 checkouts | DartsPoint',description:'Choose your finish, find your rhythm and enjoy an evening of darts.'}};
    const saved=await saveBlogDraft(actor,{draft:translated,requestId:randomUUID()});posts.push(await publishBlog(actor,{id:saved.id,revision:saved.revision,requestId:randomUUID()}));
    const fixture={prefix,id,email,session,credential,posts,origin:process.env.NEXT_PUBLIC_APP_URL!,createdAt:new Date().toISOString()};
    await mkdir('artifacts/blog',{recursive:true});await writeFile(blogFixturePath,JSON.stringify(fixture,null,2),{mode:0o600});
    console.log(JSON.stringify({event:'owned_local_blog_fixture_created',articles:posts.length,secretsPrinted:false}));
    return fixture;
  }finally{await control.end();}
}
export async function closeBlogFixtureConnections(){await db().end();}

/** Delete only identities/media/articles owned by this explicit local test fixture. */
export async function cleanupLocalBlogFixture(){
  assert.equal(process.env.APP_ENV,'development');
  for(const key of ['MIGRATION_DATABASE_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_APP_URL'])assert.equal(new URL(process.env[key]!).hostname,'127.0.0.1');
  const fixture=JSON.parse(await readFile(blogFixturePath,'utf8'));assert.match(fixture.prefix,/^qa-blog-[a-f0-9]{8}$/);assert.equal(fixture.email,fixture.prefix+'@dartspoint.local');
  const control=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL,max:1});
  try{
    await control.query('begin');
    const user=(await control.query('select email from auth.users where id=$1',[fixture.id])).rows[0];assert.equal(user?.email,fixture.email);
    const posts=(await control.query('select distinct p.id from private.blog_posts p join private.blog_revisions r on r.post_id=p.id where r.created_by=$1 or p.external_id like $2',[fixture.id,fixture.prefix+'%'])).rows.map(row=>row.id);
    const media=(await control.query('select m.id from private.blog_media m left join private.blog_tokens t on t.id=m.token_id where m.created_by=$1 or t.created_by=$1',[fixture.id])).rows.map(row=>row.id);
    await control.query('delete from private.blog_translation_pairs where nl_post_id=any($1::uuid[]) or en_post_id=any($1::uuid[])',[posts]);
    await control.query('delete from public.blog_live where post_id=any($1::uuid[])',[posts]);
    await control.query('delete from private.blog_media_references where post_id=any($1::uuid[])',[posts]);
    await control.query('delete from private.blog_slug_reservations where post_id=any($1::uuid[])',[posts]);
    await control.query('delete from private.blog_revisions where post_id=any($1::uuid[])',[posts]);
    await control.query('delete from private.blog_posts where id=any($1::uuid[])',[posts]);
    await control.query("delete from private.blog_operation_receipts where principal=$1 or key like $2 or result->>'id'=any($3::text[]) or result->>'assetId'=any($4::text[])",['user:'+fixture.id,fixture.prefix+'%',posts,media]);
    await control.query('delete from private.blog_media where id=any($1::uuid[])',[media]);
    await control.query('delete from private.blog_tokens where created_by=$1',[fixture.id]);
    await control.query('delete from private.audit_events where actor_id=$1',[fixture.id]);
    await control.query('delete from public.user_roles where user_id=$1 or granted_by=$1',[fixture.id]);
    await control.query('delete from public.preferences where user_id=$1',[fixture.id]);
    await control.query('delete from public.player_ratings where user_id=$1',[fixture.id]);
    await control.query('delete from public.profiles where id=$1',[fixture.id]);
    await control.query('commit');
    const deleted=await authAdmin().auth.admin.deleteUser(fixture.id);assert.equal(deleted.error,null);
    await unlink(blogFixturePath);
    console.log(JSON.stringify({event:'owned_local_blog_fixture_removed',articles:posts.length,assets:media.length}));
  }catch(error){await control.query('rollback');throw error;}finally{await control.end();}
}
