import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {Client,type Room} from '@colyseus/sdk';
import {createClient} from '@supabase/supabase-js';
import {db,redis,transaction} from '../../packages/data/src/db';
import {authAdmin,actorById,verifyToken,type Actor} from '../../packages/data/src/auth';
import {joinRoom} from '../../packages/data/src/community';
import {createMatch,matchAccess} from '../../packages/data/src/matches';

assert.equal(process.env.APP_ENV,'development');
const sockets:Room[]=[],latencies:number[]=[],calibrations=new WeakMap<Room,{connectionId:string;ready:boolean}>();let staleStateReconciliations=0,connectionReconciliations=0;const admin=authAdmin();const ids:string[]=[];
try{
 const profiles=(await db().query("select p.id from profiles p where p.username like 'qa%' and p.status='active' and not exists(select 1 from active_player_reservations a where a.user_id=p.id) and not exists(select 1 from user_roles r where r.user_id=p.id and revoked_at is null) order by p.created_at desc limit 50")).rows;assert.equal(profiles.length,50);
 const users:{actor:Actor;token:string}[]=[];
 for(const p of profiles){
  const user=await admin.auth.admin.getUserById(p.id);const link=await admin.auth.admin.generateLink({type:'magiclink',email:user.data.user!.email!});assert.equal(link.error,null);
  const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});const verified=await auth.auth.verifyOtp({type:'email',token_hash:link.data.properties!.hashed_token});assert.equal(verified.error,null);users.push({actor:await actorById(p.id,Date.now()+3600000),token:verified.data.session!.access_token});
 }
 const rooms:string[]=[];for(let index=0;index<2;index++){const name='qa-load-'+randomUUID();const room=(await db().query("insert into community_rooms(name,slug,description,capacity) values($1,$1,'Explicit load fixture',50) returning id",[name])).rows[0].id;await db().query("insert into channels(kind,room_id) values('community',$1)",[room]);rooms.push(room);}
 for(let index=0;index<50;index++)await joinRoom(users[index].actor,{roomId:rooms[index%2]});
 const sdk=new Client('ws://127.0.0.1:42567');
 async function connect(user:typeof users[number],matchId:string){
  for(let attempt=0;attempt<3;attempt++)try{
   const socket=await sdk.joinOrCreate('match',{matchId,token:user.token});socket.onMessage('snapshot',()=>{});socket.onMessage('clock.challenge',(sample:any)=>socket.send('clock.echo',{nonce:sample.nonce}));socket.onMessage('clock.ready',(sample:any)=>calibrations.set(socket,sample));socket.onMessage('clock.sample',(sample:any)=>calibrations.set(socket,sample));sockets.push(socket);for(let n=0;n<6;n++)setTimeout(()=>{if(socket.connection.isOpen)socket.send('clock.ping',{nonce:randomUUID()});},n*100);return socket;
  }catch(error){
   if((error as {code?:number}).code!==4001||attempt===2)throw error;
   // A local Auth/room handshake may close before Colyseus returns a useful
   // reason. Retry only after the same production checks prove that the token,
   // session, membership and match access are still valid.
   const verified=await verifyToken(user.token);assert.equal(verified.id,user.actor.id);await matchAccess(verified,matchId);connectionReconciliations++;await new Promise(r=>setTimeout(r,100));
  }
  throw new Error('Realtime load connection could not be reconciled');
 }
 const pairs:{a:typeof users[number];b:typeof users[number];id:string;sockets:Room[]}[]=[];
 for(let index=0;index<8;index++){
  // Allocate four matches per room; user indices do not overlap.
  const a=users[(index%2)+Math.floor(index/2)*4],b=users[(index%2)+Math.floor(index/2)*4+2];
  const result=await transaction(c=>createMatch(c,a.actor,b.actor.id,rooms[index%2],{startScore:701,doubleIn:false,doubleOut:true,bestOf:1,format:'legs',bestOfSets:1},'casual'));ids.push(result.matchId);
  const playerSockets=[];for(const user of [a,b])playerSockets.push(await connect(user,result.matchId));
  pairs.push({a,b,id:result.matchId,sockets:playerSockets});
 }
 // Sixteen players and thirty-four spectators, fifty live WebSocket connections.
 for(let index=16;index<50;index++){const pair=pairs.find((_,n)=>n%2===index%2)!;await connect(users[index],pair.id);}
 async function command(pair:typeof pairs[number],seat:number,type:string){
  const socket=pair.sockets[seat],start=performance.now();
  for(let attempt=0;attempt<4;attempt++){
   let state=await matchAccess([pair.a,pair.b][seat].actor,pair.id);
   const phase=type==='dart.stop_horizontal'?'horizontal':type==='dart.stop_vertical'?'vertical':null;
   while(type!=='match.ready'&&(state.state.pendingDart||phase&&(state.state.phase!==phase||state.state.turn!==seat))){
    assert.ok(performance.now()-start<10000,'Authoritative load phase did not become ready');
    await new Promise(r=>setTimeout(r,25));state=await matchAccess([pair.a,pair.b][seat].actor,pair.id);
   }
   while(phase&&!calibrations.get(socket)?.ready){assert.ok(performance.now()-start<10000,'Clock calibration did not complete');await new Promise(r=>setTimeout(r,25));}
   const accepted=await new Promise<boolean>((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timeout);offReceipt();offError();};
    const timeout=setTimeout(()=>{cleanup();reject(new Error('Realtime load receipt timeout'));},10000);
    const offReceipt=socket.onMessage('receipt',()=>{cleanup();resolve(true);});
    const offError=socket.onMessage('error',(e:any)=>{cleanup();if(e.code==='stale_state')resolve(false);else reject(new Error('Realtime load rejected: '+e.code));});
    // A rejected stale intent gets a new UUID after a fresh authoritative read.
    // No accepted command is replayed with a changed payload.
    const calibration=calibrations.get(socket);assert.ok(!phase||calibration?.ready,'Socket must complete measured calibration');
    socket.send('command',{protocolVersion:1,commandId:randomUUID(),matchId:pair.id,expectedStateVersion:state.stateVersion,phaseToken:state.state.phaseToken,type,...(phase?{renderSample:{sampleAt:Math.max(state.state.phaseStartedAt,Date.now()-2),connectionId:calibration!.connectionId,dartNumber:state.state.dartCount[0]+state.state.dartCount[1]+1}}:{})});
   });
   if(accepted){latencies.push(performance.now()-start);return;}
   staleStateReconciliations++;
  }
  throw new Error('Realtime load state could not be reconciled');
 }

 await Promise.all(pairs.map(async pair=>{await command(pair,0,'match.ready');await command(pair,1,'match.ready');for(let dart=0;dart<3;dart++){await command(pair,0,'dart.stop_horizontal');await command(pair,0,'dart.stop_vertical');await new Promise(r=>setTimeout(r,750));}}));
 assert.equal(sockets.filter(s=>s.connection.isOpen).length,50);
 const response=await fetch('http://127.0.0.1:42567/internal/deploy/metrics',{headers:{Authorization:'Bearer '+process.env.INTERNAL_DEPLOY_TOKEN}});assert.ok(response.ok);const metrics=await response.json();
 latencies.sort((a,b)=>a-b);const p95=latencies[Math.ceil(latencies.length*.95)-1];assert.ok(p95<1000,'Local p95 receipt latency exceeds one second');assert.ok(metrics.eventLoopP95Ms<200,'Local event loop p95 exceeds 200ms');
 await Promise.all(pairs.map(pair=>command(pair,0,'match.forfeit')));
 await writeFile('artifacts/load-result.json',JSON.stringify({ok:true,rooms:2,matches:8,players:16,spectators:34,connections:50,commands:latencies.length,connectionReconciliations,staleStateReconciliations,p95ReceiptMs:p95,...metrics,scope:'Local smoke load; no production capacity claim'},null,2));console.log('Two rooms, eight matches and fifty real WebSocket connections passed bounded local load');
}finally{
 await Promise.allSettled(sockets.map(s=>s.leave()));
 if(ids.length)await db().query("update matches set lifecycle='cancelled',ended_at=now() where id=any($1::uuid[]) and lifecycle in('assigned','playing','paused')",[ids]);
 if(ids.length){await db().query('delete from active_player_reservations where match_id=any($1::uuid[])',[ids]);await db().query('delete from board_reservations where match_id=any($1::uuid[])',[ids]);}
 await db().end();await(await redis()).quit();
}
