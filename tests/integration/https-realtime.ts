import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {Client,type Room} from '@colyseus/sdk';
import {db,redis} from '../../packages/data/src/db';
import {authAdmin,verifyToken} from '../../packages/data/src/auth';
import {onboard,joinRoom} from '../../packages/data/src/community';
import {invite,respondInvite,matchAccess} from '../../packages/data/src/matches';

assert.equal(process.env.APP_ENV,'development');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname,'127.0.0.1');
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
const ownedRooms=new Map<Room,{closed:boolean;onLeave:()=>void;offMessage:Array<()=>void>}>();
function own(room:Room){
 const tracked={closed:false,onLeave:()=>{},offMessage:[] as Array<()=>void>};
 tracked.onLeave=()=>{tracked.closed=true;};room.onLeave(tracked.onLeave);
 tracked.offMessage.push(room.onMessage('snapshot',()=>{}),room.onMessage('error',()=>{}));ownedRooms.set(room,tracked);return room;
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
 await phase('verify_playing',async()=>assert.equal((await matchAccess(actors[0].actor,id!)).lifecycle,'playing'));
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
 persistProgress();
}
if(originalError!==undefined)throw new FixtureFailure(category(originalError));
if(cleanupErrors.length)throw new FixtureFailure('cleanup_failed');
if(metadataFailure)throw metadataFailure;
