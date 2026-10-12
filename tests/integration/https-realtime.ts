import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
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
 return new Promise<any>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('HTTPS command receipt timeout')),10000);
  const off=room.onMessage('receipt',(value:any)=>{clearTimeout(timer);off();resolve(value);});
  room.send('command',{protocolVersion:1,commandId:randomUUID(),matchId:id,expectedStateVersion:state.stateVersion,phaseToken:state.state.phaseToken,type});
 });
}
try{
 const actors=await Promise.all([actor(0),actor(1)]);
 const room=(await db().query("insert into community_rooms(name,slug,description,capacity) values($1,$1,'Explicit local HTTPS acceptance fixture',50) returning id",[prefix])).rows[0].id;
 await db().query("insert into channels(kind,room_id) values('community',$1)",[room]);
 for(const value of actors)await joinRoom(value.actor,{roomId:room});
 const invitation=await invite(actors[0].actor,{targetId:actors[1].actor.id,roomId:room,rules:{startScore:501,doubleIn:false,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},ranked:false});
 id=(await respondInvite(actors[1].actor,{inviteId:invitation.id,action:'accept'})).matchId!;
 await assert.rejects(sdk.joinOrCreate('match',{matchId:id,token:'invalid-local-test-token'}));
 for(const value of actors){const connection=await sdk.joinOrCreate('match',{matchId:id,token:value.token});connection.onMessage('snapshot',()=>{});connection.onMessage('error',()=>{});rooms.push(connection);}
 await send(rooms[0],actors[0].actor,'match.ready');await send(rooms[1],actors[1].actor,'match.ready');
 assert.equal((await matchAccess(actors[0].actor,id!)).lifecycle,'playing');
 const reconnection=rooms[0].reconnectionToken;
 rooms[0].reconnection.enabled=false;
 const closed=new Promise<void>(resolve=>rooms[0].onLeave(()=>resolve()));
 (rooms[0] as any).connection.transport.ws.close(4010);await closed;
 await new Promise(resolve=>setTimeout(resolve,250));
 const reconnected=await sdk.reconnect(reconnection);reconnected.onMessage('snapshot',()=>{});reconnected.onMessage('error',()=>{});rooms[0]=reconnected;
 await send(rooms[1],actors[1].actor,'match.forfeit');
 assert.equal((await matchAccess(actors[0].actor,id!)).lifecycle,'completed');
 console.log('Real HTTPS Colyseus matchmaking, authenticated seats, WebSocket commands, invalid JWT rejection and reconnection passed');
}finally{
 for(const room of rooms)await room.leave().catch(()=>{});
 if(id){
  // Only this explicit local casual fixture may be cancelled after a test failure.
  await db().query("delete from active_player_reservations where match_id=$1 and exists(select 1 from matches m join community_rooms r on r.id=m.room_id where m.id=$1 and r.slug=$2)",[id,prefix]);
  await db().query("update matches set lifecycle='cancelled',ended_at=now(),state_version=state_version+1 where id=$1 and lifecycle<>'completed' and room_id=(select id from community_rooms where slug=$2)",[id,prefix]);
 }
 await db().end();await(await redis()).quit();
}
