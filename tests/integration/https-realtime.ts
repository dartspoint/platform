import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {commandSchema} from '../../packages/contracts/src/index';
import {writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {Client,type Room} from '@colyseus/sdk';
import {db,redis} from '../../packages/data/src/db';
import {authAdmin,verifyToken} from '../../packages/data/src/auth';
import {onboard,joinRoom} from '../../packages/data/src/community';
import {invite,respondInvite,matchAccess} from '../../packages/data/src/matches';

assert.equal(process.env.APP_ENV,'development');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname,'127.0.0.1');
assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
assert.equal(new URL(process.env.MIGRATION_DATABASE_URL!).hostname,'127.0.0.1');
const endpoint='https://127.0.0.1:49443',sdk=new Client(endpoint),rooms:Room[]=[];
const prefix='qahttps'+randomUUID().replaceAll('-','').slice(0,8);
let id:string|undefined;
const phases=['auth_actor_0','auth_actor_1','create_room','join_room_0','join_room_1','create_invite','accept_invite','invalid_join','join_seat_0','join_seat_1','ready_seat_0','ready_seat_1','verify_playing','drop_seat_0','reconnect_seat_0','forfeit_seat_1','verify_completed','cleanup_room_0','cleanup_room_1','cleanup_room_2','cleanup_reservations','cleanup_match','cleanup_database','cleanup_redis'] as const;
type Phase=typeof phases[number];
type Category='assertion_failed'|'operation_failed'|'phase_timeout'|'cleanup_timeout'|'cleanup_failed'|'metadata_write_failed';
class FixtureFailure extends Error {constructor(readonly category:Category){super(category);}}
const startedAt=performance.now(),progress:any={ok:false,phase:null,status:'started',elapsedMs:0,records:[],cleanupFailures:[]};
let metadataFailure:FixtureFailure|undefined;
function persistProgress(){
 try{writeFileSync('artifacts/https-sdk-progress.json',JSON.stringify(progress,null,2),{mode:0o600});}
 catch{
  if(!metadataFailure)console.log(JSON.stringify({event:'https_sdk_metadata_failure',errorCategory:'metadata_write_failed'}));
  metadataFailure??=new FixtureFailure('metadata_write_failed');progress.metadataFailure='metadata_write_failed';progress.ok=false;
 }
}
function category(error:unknown):Category{return error instanceof FixtureFailure?error.category:(error as {code?:string})?.code==='ERR_ASSERTION'?'assertion_failed':'operation_failed';}
function checkpoint(phase:Phase,status:'started'|'done'|'failed',errorCategory?:Category){
 const record={phase,status,elapsedMs:Math.round(performance.now()-startedAt),...(errorCategory?{errorCategory}:{})};
 Object.assign(progress,record);progress.records.push(record);
 persistProgress();
 console.log(JSON.stringify({event:'https_sdk_phase',...record}));
}
async function phase<T>(name:Phase,action:()=>Promise<T>,timeoutMs?:number):Promise<T>{
 checkpoint(name,'started');let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const result=timeoutMs===undefined?await action():await Promise.race([action(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new FixtureFailure(name.startsWith('cleanup_')?'cleanup_timeout':'phase_timeout')),timeoutMs);})]);
  checkpoint(name,'done');return result;
 }catch(error){checkpoint(name,'failed',category(error));throw error;}finally{if(timer)clearTimeout(timer);}
}
const clocks=new Map<Room,{ready:boolean;connectionId?:string}>();
const ingressProof:any={ok:false,checks:{}};
const ownedRooms=new Map<Room,{closed:boolean;onLeave:()=>void;offMessage:Array<()=>void>}>();
function own(room:Room){
 const tracked={closed:false,onLeave:()=>{},offMessage:[] as Array<()=>void>};
 tracked.onLeave=()=>{tracked.closed=true;};room.onLeave(tracked.onLeave);
 const clock={ready:false,connectionId:undefined as string|undefined};clocks.set(room,clock);
 tracked.offMessage.push(room.onMessage('clock.challenge',(value:any)=>room.send('clock.echo',{nonce:value.nonce})),room.onMessage('clock.ready',(value:any)=>{clock.ready=value.ready===true;clock.connectionId=value.connectionId;}),room.onMessage('snapshot',()=>{}),room.onMessage('error',()=>{}));ownedRooms.set(room,tracked);return room;
}
async function leaveOwnRoom(room:Room){
 const tracked=ownedRooms.get(room)!;room.reconnection.enabled=false;
 if(tracked.closed||!room.connection?.isOpen){room.connection?.close(1000);return;}
 try{await room.leave();}finally{if(!tracked.closed)room.connection.close(1000);}
}
async function joinedPhase(name:'join_seat_0'|'join_seat_1'|'reconnect_seat_0',action:()=>Promise<Room>){
 let active=true;
 try{return await phase(name,async()=>{const room=own(await action());if(!active){room.reconnection.enabled=false;room.connection.close(1000);}return room;},10000);}
 finally{active=false;}
}
async function actor(index:number){
 const email=`${prefix}-${index}@dartspoint.local`,password=randomUUID()+randomUUID();
 const created=await authAdmin().auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await client.auth.signInWithPassword({email,password});assert.equal(auth.error,null);
 const token=auth.data.session!.access_token;
 await onboard(await verifyToken(token,false),{username:prefix+index});return {token,actor:await verifyToken(token)};
}
async function send(room:Room,actor:any,type:string){
 const state=await matchAccess(actor,id!);
 const commandId=randomUUID();let timer:ReturnType<typeof setTimeout>|undefined,offReceipt:()=>void=()=>{},offError:()=>void=()=>{};
 try{return await new Promise<any>((resolve,reject)=>{
  timer=setTimeout(()=>reject(new FixtureFailure('phase_timeout')),10000);
  offReceipt=room.onMessage('receipt',(value:any)=>{if(value.commandId===commandId)resolve(value);});
  offError=room.onMessage('error',(value:any)=>{if(value.commandId===commandId)reject(new FixtureFailure('operation_failed'));});
  room.send('command',{protocolVersion:1,commandId,matchId:id,expectedStateVersion:state.stateVersion,phaseToken:state.state.phaseToken,type});
 });}finally{if(timer)clearTimeout(timer);offReceipt();offError();}
}
async function stopOutcome(room:Room,payload:any){
 let timer:ReturnType<typeof setTimeout>|undefined,offReceipt:()=>void=()=>{},offError:()=>void=()=>{};
 try{return await new Promise<{type:'receipt'|'error';payload:any}>((resolve,reject)=>{
  timer=setTimeout(()=>reject(new FixtureFailure('phase_timeout')),10000);
  offReceipt=room.onMessage('receipt',(value:any)=>{if(value.commandId===payload.commandId)resolve({type:'receipt',payload:value});});
  offError=room.onMessage('error',(value:any)=>{if(value.commandId===payload.commandId)resolve({type:'error',payload:value});});room.send('command',payload);
 });}finally{if(timer)clearTimeout(timer);offReceipt();offError();}
}
async function proveOriginalRejectionIngress(actor0:any,actor1:any){
 const clock=clocks.get(rooms[0])!,deadline=performance.now()+10000;
 while(!clock.ready&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));assert.equal(clock.ready,true);assert.ok(clock.connectionId);
 const baseline=await matchAccess(actor0,id!);assert.equal(baseline.lifecycle,'playing');assert.equal(baseline.state.phase,'horizontal');assert.equal(baseline.state.turn,0);
 const payload=commandSchema.parse({protocolVersion:1,commandId:randomUUID(),matchId:id,expectedStateVersion:baseline.stateVersion,type:'dart.stop_horizontal',phaseToken:baseline.state.phaseToken,renderSample:{sampleAt:Date.now()-300,connectionId:clock.connectionId,dartNumber:1,meterSpeedVersion:baseline.state.meterSpeedVersion}});
 const first=await stopOutcome(rooms[0],payload);assert.equal(first.type,'error');assert.equal(first.payload.code,'invalid_render_sample');
 const metadata=first.payload.ingress;assert.ok(metadata);assert.equal(metadata.source,'server-original-command-ingress-v1');assert.equal(metadata.scope,'match');assert.equal(metadata.actorId,actor0.id);assert.equal(metadata.commandId,payload.commandId);assert.equal(metadata.matchId,id);
 const row=(await db().query("select * from private.command_ingress where scope='match' and actor_id=$1 and command_id=$2",[actor0.id,payload.commandId])).rows[0];assert.ok(row);
 assert.equal(metadata.payloadHash,createHash('sha256').update(JSON.stringify(payload)).digest('hex'));assert.equal(metadata.payloadHash,row.payload_hash);assert.equal(metadata.receivedAt,new Date(row.received_at).getTime());assert.equal(metadata.latencyMs,Number(row.latency_ms));assert.equal(metadata.admissionWindowMs,Number(row.admission_window_ms));assert.equal(metadata.connectionId,row.connection_id);assert.equal(metadata.connectionId,clock.connectionId);assert.equal(metadata.timingVersion,'render-sample-v3');assert.equal(metadata.timingVersion,row.timing_version);assert.ok(metadata.receivedAt-payload.renderSample!.sampleAt>metadata.admissionWindowMs);
 ingressProof.checks.ownOriginalTupleMatchesDatabase=true;ingressProof.sampleAgeAtOriginalIngressMs=metadata.receivedAt-payload.renderSample!.sampleAt;ingressProof.originalWindowMs=metadata.admissionWindowMs;
 await new Promise(resolve=>setTimeout(resolve,20));const retry=await stopOutcome(rooms[0],payload);assert.equal(retry.type,'error');assert.equal(retry.payload.code,'invalid_render_sample');assert.deepEqual(retry.payload.ingress,metadata,'Same UUID retry preserves its original receive time/window and binding');ingressProof.checks.sameUuidRetryPreservesOriginalTuple=true;
 const conflict=await stopOutcome(rooms[0],{...payload,renderSample:{...payload.renderSample,sampleAt:payload.renderSample!.sampleAt+1}});assert.equal(conflict.type,'error');assert.equal(conflict.payload.code,'idempotency_conflict');assert.equal(conflict.payload.ingress,undefined);ingressProof.checks.conflictingPayloadDoesNotReceiveIngress=true;
 const peer=await stopOutcome(rooms[1],{...payload,commandId:randomUUID()});assert.equal(peer.type,'error');assert.equal(peer.payload.code,'not_your_turn');assert.equal(peer.payload.ingress,undefined);ingressProof.checks.peerPolicyErrorDoesNotReceiveIngress=true;
 const stale=await stopOutcome(rooms[0],{...payload,commandId:randomUUID(),phaseToken:randomUUID()});assert.equal(stale.type,'error');assert.equal(stale.payload.code,'stale_phase');assert.equal(stale.payload.ingress,undefined);ingressProof.checks.stalePhaseDoesNotReceiveIngress=true;
 const forged=await stopOutcome(rooms[0],{...payload,commandId:randomUUID(),ingress:{receivedAt:Date.now(),actorId:actor1.id}});assert.equal(forged.type,'error');assert.equal(forged.payload.code,'invalid_command');assert.equal(forged.payload.ingress,undefined);ingressProof.checks.clientCannotSupplyTrustedIngress=true;
 const after=await matchAccess(actor0,id!);assert.equal(after.stateVersion,baseline.stateVersion);assert.equal(after.lifecycle,baseline.lifecycle);assert.deepEqual(after.state,baseline.state);assert.equal(Number((await db().query('select count(*) from match_darts where match_id=$1',[id])).rows[0].count),0);ingressProof.checks.allRejectedCommandsPreserveAuthoritativeState=true;ingressProof.ok=true;
}
let originalError:unknown;const cleanupErrors:unknown[]=[];
try{
 const actors=await Promise.all([phase('auth_actor_0',()=>actor(0)),phase('auth_actor_1',()=>actor(1))]);
 const room=await phase('create_room',async()=>{const value=(await db().query("insert into community_rooms(name,slug,description,capacity) values($1,$1,'Explicit local HTTPS acceptance fixture',50) returning id",[prefix])).rows[0].id;await db().query("insert into channels(kind,room_id) values('community',$1)",[value]);return value;});
 for(const [index,value] of actors.entries())await phase(index?'join_room_1':'join_room_0',()=>joinRoom(value.actor,{roomId:room}));
 const invitation=await phase('create_invite',()=>invite(actors[0].actor,{targetId:actors[1].actor.id,roomId:room,rules:{startScore:501,doubleIn:false,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:false}));
 id=(await phase('accept_invite',()=>respondInvite(actors[1].actor,{inviteId:invitation.id,action:'accept'}))).matchId!;
 await phase('invalid_join',()=>assert.rejects(sdk.joinOrCreate('match',{matchId:id,token:'invalid-local-test-token'})),10000);
 for(const [index,value] of actors.entries())rooms.push(await joinedPhase(index?'join_seat_1':'join_seat_0',()=>sdk.joinOrCreate('match',{matchId:id,token:value.token})));
 await phase('ready_seat_0',()=>send(rooms[0],actors[0].actor,'match.ready'));await phase('ready_seat_1',()=>send(rooms[1],actors[1].actor,'match.ready'));
 await phase('verify_playing',async()=>{assert.equal((await matchAccess(actors[0].actor,id!)).lifecycle,'playing');await proveOriginalRejectionIngress(actors[0].actor,actors[1].actor);});
 const reconnection=rooms[0].reconnectionToken;
 rooms[0].reconnection.enabled=false;
 let dropListener:()=>void=()=>{};
 try{await phase('drop_seat_0',async()=>{const closed=new Promise<void>(resolve=>{dropListener=resolve;rooms[0].onLeave(dropListener);});(rooms[0] as any).connection.transport.ws.close(4010);await closed;},10000);}
 finally{if(!ownedRooms.get(rooms[0])!.closed)rooms[0].onLeave.remove(dropListener);}
 await new Promise(resolve=>setTimeout(resolve,250));
 rooms[0]=await joinedPhase('reconnect_seat_0',()=>sdk.reconnect(reconnection));
 await phase('forfeit_seat_1',()=>send(rooms[1],actors[1].actor,'match.forfeit'));
 await phase('verify_completed',async()=>assert.equal((await matchAccess(actors[0].actor,id!)).lifecycle,'completed'));
 console.log('Real HTTPS Colyseus matchmaking, authenticated seats, WebSocket commands, invalid JWT rejection and reconnection passed');
}catch(error){originalError=error;progress.originalFailure=category(error);
}finally{
 const cleanup=async(name:Phase,action:()=>Promise<unknown>)=>{try{await phase(name,action,10000);}catch(error){cleanupErrors.push(error);progress.cleanupFailures.push({phase:name,errorCategory:category(error)});}};
 for(const [index,room] of [...ownedRooms.keys()].entries()){
  const name=(['cleanup_room_0','cleanup_room_1','cleanup_room_2'] as const)[index];
  try{await cleanup(name,()=>leaveOwnRoom(room));}
  finally{try{room.reconnection.enabled=false;if(room.connection?.isOpen)room.connection.close(1000);const tracked=ownedRooms.get(room)!;for(const off of tracked.offMessage)off();if(!tracked.closed)room.onLeave.remove(tracked.onLeave);}catch(error){cleanupErrors.push(error);progress.cleanupFailures.push({phase:name,errorCategory:'cleanup_failed'});}}
 }
 if(id){
  // Only this explicit local casual fixture may be cancelled after a test failure.
  await cleanup('cleanup_reservations',()=>db().query("delete from active_player_reservations where match_id=$1 and exists(select 1 from matches m join community_rooms r on r.id=m.room_id where m.id=$1 and r.slug=$2)",[id,prefix]));
  await cleanup('cleanup_match',()=>db().query("update matches set lifecycle='cancelled',ended_at=now(),state_version=state_version+1 where id=$1 and lifecycle<>'completed' and room_id=(select id from community_rooms where slug=$2)",[id,prefix]));
 }
 await cleanup('cleanup_database',()=>db().end());await cleanup('cleanup_redis',async()=>{await(await redis()).quit();});
 progress.ok=originalError===undefined&&cleanupErrors.length===0&&metadataFailure===undefined;
 ingressProof.cleanupPassed=cleanupErrors.length===0;ingressProof.ok=ingressProof.ok&&progress.ok;writeFileSync('artifacts/https-command-ingress-result.json',JSON.stringify(ingressProof,null,2),{mode:0o600});
 persistProgress();
}
if(originalError!==undefined)throw new FixtureFailure(category(originalError));
if(cleanupErrors.length)throw new FixtureFailure('cleanup_failed');
if(metadataFailure)throw metadataFailure;
