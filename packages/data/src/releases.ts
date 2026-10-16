import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import type {Actor} from './auth';
import {audit,rateLimit,transaction} from './db';
import {requireThat,uuid} from '../../contracts/src/index';
import {RELEASE_STATUSES,type PlayerReleaseIdea,type PublicReleaseUpdate,type ReleaseBoardState,type ReleaseItem,type ReleaseItemPatch} from '../../contracts/src/releases';

const category=z.enum(['game','community','tournaments','account','other']);
const status=z.enum(['ideas','considering','doing','added']);
const priority=z.enum(['low','normal','high']);
const editable=z.object({title:z.string().trim().min(3).max(140),description:z.string().trim().max(3000),category,priority,status,version:z.string().trim().max(40),releaseTitle:z.string().trim().max(140),releaseSummary:z.string().trim().max(800),notes:z.string().trim().max(5000)}).strict();
const submitSchema=z.object({requestId:uuid,title:editable.shape.title,category,description:editable.shape.description.default('')}).strict();
const expected={requestId:uuid,id:uuid,expectedRevision:z.number().int().positive()};
const actionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),requestId:uuid,title:editable.shape.title,description:editable.shape.description.default(''),category,priority:priority.default('normal')}).strict(),
 z.object({action:z.literal('update'),...expected,patch:editable.partial(),confirmWithdraw:z.boolean().default(false)}).strict(),
 z.object({action:z.literal('status'),...expected,status,confirmWithdraw:z.boolean().default(false)}).strict(),
 z.object({action:z.literal('publish'),...expected}).strict(),
 z.object({action:z.literal('withdraw'),...expected}).strict(),
]);

/** Recheck durable permissions before reads, writes and idempotent replays.
 * The route verified the provider session; these locks order account closure
 * and permission revocation against this transaction. Ticket roles grant none. */
async function freshActor(c:PoolClient,actor:Actor,admin=false){
 requireThat(actor.expiresAt>Date.now(),'session_expired',401);
 const p=(await c.query('select status,onboarded_at,session_version,rename_required from public.profiles where id=$1 for share',[actor.id])).rows[0];
 requireThat(p?.status==='active'&&p.onboarded_at,'unauthenticated',401);
 requireThat(Number(p.session_version)===actor.sessionVersion,'session_revoked',401);
 requireThat(!p.rename_required,'rename_required',403,'Kies eerst een nieuwe gebruikersnaam.');
 if(actor.sessionId)requireThat(!(await c.query('select 1 from private.revoked_sessions where session_id=$1',[actor.sessionId])).rowCount,'session_revoked',401);
 requireThat(!(await c.query("select 1 from public.sanctions where target_id=$1 and room_id is null and kind='suspend' and starts_at<=now() and ends_at>now() and revoked_at is null",[actor.id])).rowCount,'banned',403);
 if(admin)requireThat((await c.query("select 1 from public.user_roles where user_id=$1 and role in('owner','admin') and revoked_at is null for share",[actor.id])).rowCount,'forbidden',403);
}
const at=(value:Date|string)=>new Date(value).getTime();
const publicColumns='p.id,p.number,p.title,p.summary,p.category,p.version,p.published_at';
function publicUpdate(row:any):PublicReleaseUpdate{return {id:row.id,number:Number(row.number),title:row.title,summary:row.summary,category:row.category,version:row.version,publishedAt:at(row.published_at)};}
/** Used by the room feed only after its existing room-access check. */
export async function publishedReleases(c:PoolClient,limit?:number):Promise<PublicReleaseUpdate[]>{
 const bounded=limit===undefined?undefined:Math.max(1,Math.min(5,Math.trunc(limit)));
 const rows=(await c.query(`select ${publicColumns} from private.release_publications p join private.release_cards card on card.publication_id=p.id where card.status='added' order by p.published_at desc,p.id desc`+(bounded?' limit $1':''),bounded?[bounded]:[])).rows;
 return rows.map(publicUpdate);
}
async function projection(c:PoolClient,ids?:string[]):Promise<ReleaseItem[]>{
 const rows=(await c.query(`select card.*,case when submitter.rename_required then 'Speler-'||left(replace(submitter.id::text,'-',''),12) else submitter.username end author_name from private.release_cards card left join public.profiles submitter on submitter.id=card.submitter_id ${ids?'where card.id=any($1::uuid[])':''} order by card.number desc for share of card`,ids?[ids]:[])).rows;
 if(!rows.length)return [];
 const cardIds=rows.map(r=>r.id);
 const events=await c.query("select h.*,case when actor.rename_required then 'Speler-'||left(replace(actor.id::text,'-',''),12) else actor.username end actor_name from private.release_history h left join public.profiles actor on actor.id=h.actor_id where h.card_id=any($1::uuid[]) order by h.created_at desc,h.id desc",[cardIds]);
 const publications=await c.query(`select ${publicColumns} from private.release_publications p where p.id=any($1::uuid[])`,[rows.map(r=>r.publication_id).filter(Boolean)]);
 return rows.map(r=>({id:r.id,number:Number(r.number),title:r.title,description:r.description,category:r.category,status:r.status,priority:r.priority,authorName:r.author_name??(r.source==='team'?'DartsPoint-team':'Verwijderde speler'),source:r.source,createdAt:at(r.created_at),updatedAt:at(r.updated_at),version:r.version,releaseTitle:r.release_title,releaseSummary:r.release_summary,notes:r.notes,revision:Number(r.revision),history:events.rows.filter(h=>h.card_id===r.id).map(h=>({id:h.id,at:at(h.created_at),actor:h.actor_name??'Verwijderde gebruiker',text:h.text,revision:Number(h.revision)})),...(r.publication_id?{publication:publicUpdate(publications.rows.find(p=>p.id===r.publication_id))}:{})}));
}
async function ownProjection(c:PoolClient,actor:Actor,id?:string):Promise<PlayerReleaseIdea[]>{
 // A separate SELECT never fetches notes, priority, staff identities or history.
 const rows=(await c.query(`select card.id,card.number,card.title,card.description,card.category,card.status,card.created_at,card.updated_at,case when p.id is not null then jsonb_build_object('id',p.id,'number',p.number,'title',p.title,'summary',p.summary,'category',p.category,'version',p.version,'publishedAt',floor(extract(epoch from p.published_at)*1000)::bigint) end publication from private.release_cards card left join private.release_publications p on p.id=card.publication_id where card.source='player' and card.submitter_id=$1 ${id?'and card.id=$2':''} order by card.number desc`,id?[actor.id,id]:[actor.id])).rows;
 return rows.map(r=>({id:r.id,number:Number(r.number),title:r.title,description:r.description,category:r.category,status:r.status,createdAt:at(r.created_at),updatedAt:at(r.updated_at),...(r.publication?{publication:r.publication}:{})}));
}
export async function releaseAdmin(actor:Actor):Promise<ReleaseBoardState>{return transaction(async c=>{
 await freshActor(c,actor,true);
 const items=await projection(c),board=await c.query('select revision from private.release_board where id=1'),logs=await c.query("select a.id,a.created_at,a.action,a.reason,a.data,actor.username from private.audit_events a left join public.profiles actor on actor.id=a.actor_id where a.action like 'release.%' order by a.id desc limit 250");
 return {items,revision:Number(board.rows[0].revision),audit:logs.rows.map(a=>({id:String(a.id),at:at(a.created_at),actor:a.username??'Verwijderde gebruiker',action:a.action,subject:a.data.number?'#'+a.data.number:'Releasebeheer',detail:a.reason??''}))};
});}
export async function releaseMine(actor:Actor){return transaction(async c=>{await freshActor(c,actor);return {ideas:await ownProjection(c,actor)};});}
export async function releasePublications(actor:Actor){return transaction(async c=>{await freshActor(c,actor);return {updates:await publishedReleases(c)};});}

async function idempotent(c:PoolClient,actor:Actor,scope:string,requestId:string,payload:unknown,perform:()=>Promise<string>):Promise<string>{
 const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['release-request:'+actor.id+':'+scope+':'+requestId]);
 const previous=(await c.query('select payload_hash,response from private.idempotency_keys where actor_id=$1 and scope=$2 and key=$3',[actor.id,scope,requestId])).rows[0];
 if(previous){requireThat(previous.payload_hash===hash,'idempotency_conflict',409,'Dit verzoek is al met andere inhoud gebruikt.');return previous.response.id;}
 const id=await perform();
 // Store only the stable reference; retries reproject under fresh permissions.
 await c.query('insert into private.idempotency_keys(actor_id,scope,key,payload_hash,response) values($1,$2,$3,$4,$5)',[actor.id,scope,requestId,hash,JSON.stringify({id})]);return id;
}
async function recordChange(c:PoolClient,actor:Actor,card:{id:string;number:string|number;revision:string|number},action:string,text:string){
 await c.query('insert into private.release_history(card_id,actor_id,text,revision) values($1,$2,$3,$4)',[card.id,actor.id,text,Number(card.revision)]);
 await c.query('update private.release_board set revision=revision+1 where id=1');
 await audit(c,actor.id,'release.'+action,card.id,{number:Number(card.number),revision:Number(card.revision)},text);
}
async function createCard(c:PoolClient,actor:Actor,p:{title:string;description:string;category:string;priority?:string},source:'player'|'team'){
 const card=(await c.query('insert into private.release_cards(title,description,category,priority,source,submitter_id) values($1,$2,$3,$4,$5,$6) returning id,number,revision',[p.title,p.description,p.category,p.priority??'normal',source,actor.id])).rows[0];
 await recordChange(c,actor,card,source==='player'?'submit':'create',source==='player'?'Idee ingediend.':'Teamidee toegevoegd.');return card.id as string;
}
export async function releaseSubmit(actor:Actor,input:unknown):Promise<PlayerReleaseIdea>{
 const p=submitSchema.parse(input);await rateLimit('release-submit:'+actor.id,20,300);
 return transaction(async c=>{await freshActor(c,actor);const id=await idempotent(c,actor,'release-submit',p.requestId,p,()=>createCard(c,actor,p,'player'));const own=(await ownProjection(c,actor,id))[0];requireThat(own,'idea_unavailable',404);return own;});
}
const columns:Record<keyof ReleaseItemPatch,string>={title:'title',description:'description',category:'category',priority:'priority',status:'status',version:'version',releaseTitle:'release_title',releaseSummary:'release_summary',notes:'notes'};
export async function releaseAdminAction(actor:Actor,input:unknown):Promise<ReleaseItem>{
 const p=actionSchema.parse(input);await rateLimit('release-admin:'+actor.id,120,60);
 return transaction(async c=>{
  await freshActor(c,actor,true);
  const id=await idempotent(c,actor,'release-admin',p.requestId,p,async()=>{
   if(p.action==='create')return createCard(c,actor,p,'team');
   const current=(await c.query('select * from private.release_cards where id=$1 for update',[p.id])).rows[0];requireThat(current,'release_not_found',404);
   requireThat(Number(current.revision)===p.expectedRevision,'release_version_conflict',409,'Dit item is ondertussen gewijzigd. Jouw tekst is behouden. Herlaad het item om de wijzigingen te vergelijken.');
   let text:string;
   if(p.action==='publish'){
    requireThat(current.status==='added','release_not_added',409,'Verplaats het item eerst naar Toegevoegd.');
    requireThat(current.release_title.trim().length>=3&&current.release_summary.trim().length>=20,'release_publication_incomplete',400,'Vul een openbare titel van minimaal 3 tekens en een samenvatting van minimaal 20 tekens in.');
    const published=(await c.query('insert into private.release_publications(card_id,number,title,summary,category,version) values($1,$2,$3,$4,$5,$6) returning id',[current.id,current.number,current.release_title,current.release_summary,current.category,current.version])).rows[0];
    await c.query('update private.release_cards set publication_id=$2,revision=revision+1,updated_at=now() where id=$1',[current.id,published.id]);text=current.publication_id?'Openbare momentopname opnieuw gepubliceerd.':'Openbare momentopname gepubliceerd in de lobby.';
   }else if(p.action==='withdraw'){
    await c.query('update private.release_cards set publication_id=null,revision=revision+1,updated_at=now() where id=$1',[current.id]);text='Openbare releaseupdate ingetrokken.';
   }else{
    const patch=p.action==='status'?{status:p.status}:p.patch;
    const withdrawn=!!current.publication_id&&patch.status!==undefined&&patch.status!=='added';
    requireThat(!withdrawn||p.confirmWithdraw,'release_withdraw_confirmation',409,'Bevestig dat deze statuswijziging de openbare releaseupdate intrekt.');
    const entries=Object.entries(patch) as [keyof ReleaseItemPatch,unknown][];
    const values:unknown[]=[current.id];const updates=entries.map(([key,value])=>{values.push(value);return columns[key]+'=$'+values.length;});
    if(withdrawn)updates.push('publication_id=null');updates.push('revision=revision+1','updated_at=now()');
    await c.query('update private.release_cards set '+updates.join(',')+' where id=$1',values);
    text=patch.status&&patch.status!==current.status?`Status gewijzigd van ${RELEASE_STATUSES[current.status as keyof typeof RELEASE_STATUSES]} naar ${RELEASE_STATUSES[patch.status]}.${withdrawn?' Openbare releaseupdate ingetrokken.':''}`:'Item bijgewerkt. Een bestaande publicatie blijft ongewijzigd tot opnieuw publiceren.';
   }
   await recordChange(c,actor,{...current,revision:Number(current.revision)+1},p.action,text);return current.id;
  });
  const result=(await projection(c,[id]))[0];requireThat(result,'release_not_found',404);return result;
 });
}
