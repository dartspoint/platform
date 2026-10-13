import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {db,redis} from '../../packages/data/src/db';
import {authAdmin,actorById,verifyToken,revokeSession,type Actor} from '../../packages/data/src/auth';
import {onboard,joinRoom,sendMessage,personalChatChange,privateChannel,channelAccess} from '../../packages/data/src/community';
import {filterAction} from '../../packages/data/src/content-filter';
import {moderateMessage} from '../../packages/data/src/admin';

assert.equal(process.env.APP_ENV,'development');
assert.equal(new URL(process.env.MIGRATION_DATABASE_URL!).hostname,'127.0.0.1');
const prefix='Batch'+randomUUID().slice(0,7),admin=authAdmin(),pool=db();
async function fixture(i:number){
 const email=`${prefix}-${i}@dartspoint.local`,password=randomUUID()+randomUUID();
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);
 await onboard(await actorById(created.data.user!.id,Date.now()+3600000,false),{username:prefix+i});
 const login=await authAdmin().auth.signInWithPassword({email,password});assert.equal(login.error,null);
 const token=login.data.session!.access_token;return {actor:await verifyToken(token),token};
}
const [fa,fb,fc]=await Promise.all([0,1,2].map(fixture)),a=fa.actor,b=fb.actor,c=fc.actor;
const connected=new WeakSet<object>(),queries:string[]=[];let collecting=false,authCalls=0;
let waitingLock:{key:string;issued:()=>void}|undefined;
let waitingMutation:{actorId:string;issued:(pid:number)=>void}|undefined;
pool.on('acquire',client=>{
 if(connected.has(client))return;connected.add(client);const original=client.query.bind(client);
 (client as any).query=(...args:any[])=>{
  const sql=String(typeof args[0]==='string'?args[0]:args[0]?.text).replace(/\s+/g,' ').trim();
  if(collecting)queries.push(sql);
  if(waitingLock&&sql.startsWith('select pg_advisory_xact_lock')&&args[1]?.[0]===waitingLock.key)waitingLock.issued();
  if(waitingMutation&&sql.startsWith('with read_state as')&&args[1]?.[1]===waitingMutation.actorId)waitingMutation.issued((client as any).processID);
  return (original as any)(...args);
 };
});
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(collecting&&url.pathname==='/auth/v1/user')authCalls++;
 return originalFetch(input,init);
};
const measured:Array<{label:string;postgresRoundtrips:number;providerCalls:number;statements:string[]}>=[];
async function counted<T>(label:string,fn:()=>Promise<T>,count=9){
 queries.length=0;authCalls=0;collecting=true;
 try{
  const result=await fn();assert.equal(authCalls,1,label+' always asks the Auth provider');
  assert.equal(queries.length,count,label+' Postgres roundtrips');
  if(count===9){
   assert.match(queries[0],/session_revoked.*from profiles/);
   assert.equal(queries[1],'begin');assert.match(queries[2],/^select pg_advisory_xact_lock/);
   assert.match(queries[3],/^with context as/,'Rights and quota reads occur after the separate lock statement');
   assert.match(queries[4],/^with read_state as/);assert.match(queries[5],/^select m.id,m.channel_id/,'Canonical projection gets a fresh snapshot after row-lock waits');assert.equal(queries[6],'commit');
   assert.match(queries[7],/^select cm.user_id/,'IDs-only fanout follows commit');
   assert.match(queries[8],/^with sessions as/,'Recipient body projection gets a fresh snapshot');
  }
  // Record statement categories only, never parameters, credentials, or messages.
  measured.push({label,postgresRoundtrips:queries.length,providerCalls:authCalls,statements:count===9?['fresh-profile-session','begin','separate-user-lock','post-lock-rights-filter-quota','mutation-returning-id','fresh-canonical-after-waits','commit','fresh-ids-fanout','fresh-personal-projection']:['fresh-profile-session']});return result;
 }finally{collecting=false;}
}
async function deny(actor:Actor,channel:string,code:string,id=randomUUID(),body='Geweigerde unieke intentie'){
 await assert.rejects(sendMessage(actor,{channelId:channel,clientMessageId:id,body}),{code});
}
async function legacyDenied(actor:Actor,channel:string,code:string){
 const client=await pool.connect();try{await client.query('begin');await assert.rejects(channelAccess(client,actor,channel,true),{code});}finally{await client.query('rollback');client.release();}
}
const fixtureSanctions:string[]=[];
async function sanction(actor:Actor,room:string|null,kind:string){
 const row=(await pool.query('insert into sanctions(target_id,actor_id,room_id,kind,reason,ends_at) values($1,$2,$3,$4,$5,now()+interval \'10 minutes\') returning id',[actor.id,c.id,room,kind,'Isolated batching precedence check'])).rows[0];fixtureSanctions.push(row.id);return row.id as string;
}
async function blockedMutation(actor:Actor,lockSql:string,lockValues:unknown[],channel:string,id:string,body:string,whileBlocked:()=>Promise<void>){
 const holder=await pool.connect();let pending:Promise<any>|undefined;
 try{
  await holder.query('begin');await holder.query(lockSql,lockValues);
  let issued!:(pid:number)=>void;const statementIssued=new Promise<number>(resolve=>{issued=resolve;});waitingMutation={actorId:actor.id,issued};
  pending=sendMessage(actor,{channelId:channel,clientMessageId:id,body});const pid=await statementIssued;
  let blocked=false;for(let i=0;i<100&&!blocked;i++){blocked=(await pool.query('select $2::integer=any(pg_blocking_pids($1::integer)) blocked',[pid,(holder as any).processID])).rows[0].blocked;if(!blocked)await new Promise(resolve=>setTimeout(resolve,10));}
  assert.ok(blocked,'The mutation statement has its snapshot and demonstrably waits on the held row');
  await whileBlocked();await holder.query('commit');return await pending;
 }finally{waitingMutation=undefined;await holder.query('rollback');holder.release();await pending?.catch(()=>{});}
}
try{
 const rooms=(await pool.query("insert into community_rooms(name,slug,capacity,status,min_rating,max_rating) values($1,$1,10,'open',0,3000),($2,$2,10,'private',0,1000) returning id",[prefix,prefix+'private'])).rows.map(r=>r.id),[room,privateRoom]=rooms;
 await pool.query("insert into channels(kind,room_id) values('community',$1),('community',$2)",rooms);
 const channels=(await pool.query('select id,room_id from channels where room_id=any($1::uuid[])',[rooms])).rows;
 const channel=channels.find(ch=>ch.room_id===room)!.id,privateChat=channels.find(ch=>ch.room_id===privateRoom)!.id;
 await joinRoom(a,{roomId:room});await joinRoom(b,{roomId:room});
 const clientMessageId=randomUUID(),body='Een gebundeld geldig bericht';
 const deliver=async()=>{const actor=await verifyToken(fa.token),row=await sendMessage(actor,{channelId:channel,clientMessageId,body});const rows=await personalChatChange(row.id,[b]);assert.equal(rows.get(b.id+':'+b.sessionId).body,row.body);return row;};
 const saved=await counted('new-human-message',deliver);assert.equal(saved.client_message_id,clientMessageId);assert.equal(saved.sender_id,a.id);assert.equal(saved.channel_id,channel);assert.equal(saved.kind,'human');
 const before=(await pool.query('select (select cursor from channels where id=$1) cursor,(select last_read_cursor from channel_memberships where channel_id=$1 and user_id=$2) read_cursor,(select count(*) from chat_messages where sender_id=$2) messages',[channel,a.id])).rows[0];
 assert.equal((await counted('durable-UUID-retry',deliver)).id,saved.id);
 assert.deepEqual((await pool.query('select (select cursor from channels where id=$1) cursor,(select last_read_cursor from channel_memberships where channel_id=$1 and user_id=$2) read_cursor,(select count(*) from chat_messages where sender_id=$2) messages',[channel,a.id])).rows[0],before,'Retry advances neither cursor, read state nor quota');
 await pool.query('update channels set cursor=cursor+1 where id=$1',[channel]);
 await pool.query('update chat_messages set redacted_at=now(),change_cursor=(select cursor from channels where id=$2) where id=$1',[saved.id,channel]);
 const redacted=await counted('redacted-UUID-retry',deliver);assert.equal(redacted.body,null);assert.equal(redacted.redacted,true);assert.ok(Number(redacted.cursor)>Number(redacted.seq));
 await deny(a,randomUUID(),'channel_not_found',clientMessageId,body);
 await deny(a,channel,'idempotency_conflict',clientMessageId,'Andere tekst');

 // Statement snapshots precede row-lock waits. The final ACK must project names
 // and tombstones from a fresh snapshot after those waits, just like history.
 await pool.query("insert into user_roles(user_id,role,granted_by) values($1,'owner',$1)",[b.id]);const owner=await actorById(b.id,b.expiresAt);
 await pool.query('update profiles set username=$2 where id=$1',[a.id,prefix+'-geil']);
 const renameId=randomUUID(),renameBody='Bericht tijdens naamcontrole',alias='Speler-'+a.id.replaceAll('-','').slice(0,12);
 const renamed=await blockedMutation(a,'select id from channels where id=$1 for update',[channel],channel,renameId,renameBody,async()=>{await filterAction(owner,{action:'require-rename',targetId:a.id,reason:'Isolated concurrent ACK name protection'});});
 const duringRedaction=await blockedMutation(a,'select channel_id from channel_memberships where channel_id=$1 and user_id=$2 for update',[channel,a.id],channel,renameId,renameBody,async()=>{await moderateMessage(owner,{messageId:renamed.id,reason:'Isolated concurrent UUID retry tombstone'});});
 assert.deepEqual({renameNameIsCurrent:renamed.username===alias,redactedFlagIsCurrent:duringRedaction.redacted===true,redactedBodyIsNull:duringRedaction.body===null,tombstoneCursorIsCurrent:Number(duringRedaction.cursor)>Number(renamed.seq)},
  {renameNameIsCurrent:true,redactedFlagIsCurrent:true,redactedBodyIsNull:true,tombstoneCursorIsCurrent:true},'Canonical ACK projections must use a fresh snapshot after membership/cursor lock waits');
 await pool.query('update profiles set username=$2,rename_required=false where id=$1',[a.id,prefix+'0']);

 // The old access helper is used as the reference for overlapping denial order.
 const dm=(await privateChannel(a,{targetId:b.id})).channelId;
 const mute=await sanction(a,null,'mute');await pool.query("update preferences set data=jsonb_set(data,'{privateMessages}','\"nobody\"') where user_id=$1",[b.id]);
 await pool.query('insert into user_blocks(blocker_id,blocked_id) values($1,$2)',[b.id,a.id]);
 await legacyDenied(c,dm,'forbidden');await deny(c,dm,'forbidden');
 await legacyDenied(a,dm,'blocked');await deny(a,dm,'blocked');
 await pool.query('delete from user_blocks where blocker_id=$1 and blocked_id=$2',[b.id,a.id]);
 await legacyDenied(a,dm,'private_messages_closed');await deny(a,dm,'private_messages_closed');
 await pool.query("update preferences set data=jsonb_set(data,'{privateMessages}','\"everyone\"') where user_id=$1",[b.id]);
 await legacyDenied(a,dm,'muted');await deny(a,dm,'muted');
 const removal=await sanction(a,privateRoom,'remove');
 await legacyDenied(a,privateChat,'room_private');await deny(a,privateChat,'room_private');
 await pool.query('insert into room_access(room_id,user_id) values($1,$2)',[privateRoom,a.id]);
 await legacyDenied(a,privateChat,'room_removed');await deny(a,privateChat,'room_removed');
 await pool.query('update sanctions set revoked_at=now() where id=$1',[removal]);
 await legacyDenied(a,privateChat,'room_rating_restricted');await deny(a,privateChat,'room_rating_restricted');
 await pool.query('update community_rooms set max_rating=3000 where id=$1',[privateRoom]);
 await legacyDenied(a,privateChat,'join_room_first');await deny(a,privateChat,'join_room_first');
 await joinRoom(a,{roomId:privateRoom});await legacyDenied(a,privateChat,'muted');await deny(a,privateChat,'muted');
 await pool.query('update sanctions set revoked_at=now() where id=$1',[mute]);
 // Stale role privileges cannot authorize the new combined access snapshot.
 await pool.query("insert into user_roles(user_id,role,granted_by) values($1,'admin',$1)",[c.id]);
 const staleAdmin=await verifyToken(fc.token);await joinRoom(staleAdmin,{roomId:privateRoom});
 await pool.query("update user_roles set revoked_at=now() where user_id=$1 and role='admin'",[c.id]);
 await deny(staleAdmin,privateChat,'room_private');
 await counted('fresh-current-role',async()=>{assert.equal((await verifyToken(fc.token)).role,'player');},1);
 // A sender transaction begins and waits on the lock while the previous sender
 // commits this UUID. Only a separate post-lock snapshot can see that receipt.
 await joinRoom(c,{roomId:room});const holder=await pool.connect(),intentId=randomUUID(),committedId=randomUUID(),waitingBody='Intentie uit vorige transactie';
 let pending:Promise<any>|undefined;
 try{
  await holder.query('begin');await holder.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['chat-send:'+c.id]);
  let issued!:()=>void;const lockIssued=new Promise<void>(resolve=>{issued=resolve;});waitingLock={key:'chat-send:'+c.id,issued};
  pending=sendMessage(c,{channelId:channel,clientMessageId:intentId,body:waitingBody});await lockIssued;
  let blocked=false;for(let i=0;i<100&&!blocked;i++){blocked=(await pool.query("select exists(select 1 from pg_locks where locktype='advisory' and not granted) blocked")).rows[0].blocked;if(!blocked)await new Promise(resolve=>setTimeout(resolve,10));}
  assert.ok(blocked,'The next sender is demonstrably waiting before the previous commit');
  const seq=(await holder.query('update channels set cursor=cursor+1 where id=$1 returning cursor',[channel])).rows[0].cursor;
  await holder.query('insert into chat_messages(id,channel_id,sender_id,client_message_id,seq,body,normalized_body) values($1,$2,$3,$4,$5,$6,$7)',[committedId,channel,c.id,intentId,seq,waitingBody,waitingBody.toLowerCase()]);await holder.query('commit');
  assert.equal((await pending).id,committedId,'The waiter returns the committed UUID receipt instead of conflicting or charging quota');
  assert.equal((await pool.query('select count(*)::int n from chat_messages where sender_id=$1 and client_message_id=$2',[c.id,intentId])).rows[0].n,1);
 }finally{waitingLock=undefined;await holder.query('rollback');holder.release();await pending?.catch(()=>{});}
 await pool.query("update profiles set status='suspended' where id=$1",[a.id]);
 await counted('fresh-profile-suspension',async()=>{await assert.rejects(verifyToken(fa.token),{code:'banned'});},1);await pool.query("update profiles set status='active' where id=$1",[a.id]);
 await revokeSession(a);
 await counted('fresh-local-session-revocation',async()=>{await assert.rejects(verifyToken(fa.token),{code:'session_revoked'});},1);
 const result={ok:true,mandatoryFreshProvider:true,nineWarmPostgresRoundtrips:true,separateLockPostLockSnapshot:true,committedReceiptVisibleAfterLockWait:true,canonicalStoredRow:true,freshRenameAfterCursorWait:true,freshRedactionAfterMembershipWait:true,idempotentQuotaCursorReadState:true,redactedRetrySafe:true,originalPermissionErrorPrecedence:true,revokedRoleImmediate:true,revokedSessionImmediate:true,profileSuspensionImmediate:true,measured};
 await writeFile('artifacts/chat-send-batching-result.json',JSON.stringify(result,null,2));console.log('Fresh Auth, nine actual Postgres roundtrips, fresh ACK races, canonical retries and permission precedence passed');
}finally{
 collecting=false;globalThis.fetch=originalFetch;
 await pool.query("update sanctions set revoked_at=coalesce(revoked_at,now()) where id=any($1::uuid[])",[fixtureSanctions]);
 await pool.query("update user_roles set revoked_at=coalesce(revoked_at,now()) where user_id=$1 and role='admin'",[c.id]);
 await pool.query("update user_roles set revoked_at=coalesce(revoked_at,now()) where user_id=$1 and role='owner'",[b.id]);
 await pool.query('update profiles set username=$2,rename_required=false where id=$1',[a.id,prefix+'0']);
 await pool.query("update profiles set status='active' where id=any($1::uuid[])",[[a.id,b.id,c.id]]);
 await pool.end();await(await redis()).quit();
}
