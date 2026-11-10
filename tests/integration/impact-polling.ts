import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {postgresOptions} from '../../packages/data/src/postgres';
import {db,redis,transaction} from '../../packages/data/src/db';
import {actorById,type Actor} from '../../packages/data/src/auth';
import {createMatch,acquireMatch,matchAccess,matchCommand,settleImpacts} from '../../packages/data/src/matches';
import {practiceCommand,settlePractice} from '../../packages/data/src/practice';
import {ImpactPolling,hasImpactActivity,hasPendingImpacts} from '../../packages/data/src/impact-polling';
import {dartsGameReducer} from '../../packages/game-core/src/darts-game-state';
import {domainTiming} from './timing-fixture';
import {getLegalPublicBundle,recordLegalAcceptance} from '../../packages/data/src/legal';

assert.equal(process.env.APP_ENV,'development');
for(const key of ['DATABASE_URL','MIGRATION_DATABASE_URL','REDIS_URL'])assert.equal(new URL(process.env[key]!).hostname,'127.0.0.1');
const setup=new Pool({...postgresOptions(process.env.MIGRATION_DATABASE_URL!),max:1});
const ids=Array.from({length:3},()=>randomUUID()),room=randomUUID(),prefix='QaImpact'+randomUUID().replaceAll('-','').slice(0,7);
const activityKey='dartspoint:impacts:active',pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const r=await redis(),originalDraining=await r.get('dartspoint:draining');let matchId='',writer='',fence=0;
let actors:Actor[]=[];

async function matchAction(seat:number,type:string){
 const snapshot=await matchAccess(actors[seat],matchId),timing=domainTiming(snapshot.state,type);
 const input={protocolVersion:1,commandId:randomUUID(),matchId,expectedStateVersion:snapshot.stateVersion,type,phaseToken:snapshot.state.phaseToken,...(timing.renderSample?{renderSample:timing.renderSample}:{})};
 return matchCommand(actors[seat],input,writer,fence,timing.ingress);
}
async function practiceAction(snapshot:any,type:'horizontal'|'vertical'){
 const receivedAt=Date.now(),connectionId=randomUUID();
 return practiceCommand(actors[2],{commandId:randomUUID(),sessionId:snapshot.id,type,expectedStateVersion:snapshot.stateVersion,phaseToken:snapshot.state.phaseToken,renderSample:{sampleAt:Math.max(snapshot.state.phaseStartedAt,receivedAt-1),connectionId,dartNumber:snapshot.state.count+1,meterSpeedVersion:snapshot.state.meterSpeedVersion}},{receivedAt,connectionId,latencyMs:0,admissionWindowMs:54});
}
async function idlePoller(){
 await r.del(activityKey);
 // Freeze only the recovery clock: a subsequent wake must come from actual Redis,
 // even though the next scheduled SQL scan has not become eligible.
 const poller=new ImpactPolling({now:()=>0,hasActivity:hasImpactActivity,hasPending:hasPendingImpacts});
 assert.equal(await poller.shouldPoll(),false,'No active launch exists before the first dart');
 return poller;
}
async function processUntil(poller:ImpactPolling,done:()=>Promise<boolean>,impactAt:number){
 const deadline=Date.now()+2000;
 while(!await done()&&Date.now()<deadline){
  if(await poller.shouldPoll()){await settleImpacts();await settlePractice();}
  await pause(50);
 }
 assert.equal(await done(),true,'The launched dart settles without waiting for the idle SQL scan');
 assert.ok(Date.now()-impactAt<350,'Normal impact processing remains close to the 50ms cadence');
}
async function launchPractice(){
 const session=await practiceCommand(actors[2],{type:'reset',commandId:randomUUID(),configuration:{mode:'free',tutorial:false,chosenDouble:20,finish:170}});
 return practiceAction(await practiceAction(session,'horizontal'),'vertical');
}

try{
 if(originalDraining===null)await r.set('dartspoint:draining','0',{NX:true});
 assert.equal(await r.get('dartspoint:draining'),'0');
 await setup.query('insert into auth.users(id) select unnest($1::uuid[])',[ids]);
 await setup.query('update profiles p set username=f.name,onboarded_at=now() from unnest($1::uuid[],$2::text[]) f(id,name) where p.id=f.id',[ids,ids.map((_,i)=>prefix+i)]);
 await setup.query('insert into player_ratings(user_id) select unnest($1::uuid[])',[ids]);
 await setup.query("insert into preferences(user_id,data) select id,'{}'::jsonb from unnest($1::uuid[]) id",[ids]);
 await setup.query('insert into community_rooms(id,name,slug,capacity,min_rating,max_rating) values($1,$2,$2,50,0,5000)',[room,prefix]);
 await setup.query("insert into room_memberships(user_id,room_id,lease_until,last_activity_at) select id,$2,now()+interval '5 minutes',now() from unnest($1::uuid[]) id",[ids,room]);
 actors=await Promise.all(ids.map(id=>actorById(id,Date.now()+3600000)));
 const legal=await getLegalPublicBundle();
 if(legal.current.terms&&legal.current.privacy)for(const id of ids)await recordLegalAcceptance(id,{termsVersionId:legal.current.terms.id,privacyVersionId:legal.current.privacy.id,age16Confirmed:true,termsAccepted:true});
 const game=await transaction(c=>createMatch(c,actors[0],ids[1],room,{startScore:501,bestOf:1,format:'legs',bestOfSets:1,doubleIn:false,doubleOut:true},'casual'));
 matchId=game.matchId;writer=randomUUID();fence=await acquireMatch(matchId,writer);
 await matchAction(0,'match.ready');await matchAction(1,'match.ready');await matchAction(0,'dart.stop_horizontal');
 const matchPoller=await idlePoller(),launch=await matchAction(0,'dart.stop_vertical');
 assert.equal(await hasImpactActivity(),true,'The actual match launch publishes its wake hint');
 assert.equal(await matchPoller.shouldPoll(),true,'The first dart immediately wakes an idle worker');
 const expected=dartsGameReducer(launch.state,{type:'land',id:launch.state.pendingDart!.id,at:launch.state.impactAt!});
 const matchDone=async()=>!(await setup.query('select state from matches where id=$1',[matchId])).rows[0].state.pendingDart;
 await processUntil(matchPoller,matchDone,launch.state.impactAt!);
 const landed=await matchAccess(actors[0],matchId);
 for(const key of ['scores','dartCount','pointsScored'] as const)assert.deepEqual(landed.state[key],expected[key],'Match scoring remains unchanged: '+key);
 assert.equal(landed.state.events.length,1);
 await Promise.all([settleImpacts(),settleImpacts()]);
 assert.equal((await matchAccess(actors[0],matchId)).stateVersion,landed.stateVersion,'Duplicate worker ticks never apply a dart twice');
 assert.equal((await setup.query('select count(*)::int n from match_darts where match_id=$1 and impacted_at is not null',[matchId])).rows[0].n,1);

 const practicePoller=await idlePoller(),practice=await launchPractice();
 assert.equal(await hasImpactActivity(),true,'The actual practice launch publishes its wake hint');
 assert.equal(await practicePoller.shouldPoll(),true);
 const practiceDone=async()=>Number((await setup.query('select state from practice_sessions where id=$1',[practice.id])).rows[0].state.count)===1;
 await processUntil(practicePoller,practiceDone,practice.state.impactAt!);
 const practiced=(await setup.query('select state,state_version from practice_sessions where id=$1',[practice.id])).rows[0];
 assert.equal(practiced.state.sessionPoints,practice.state.dart!.hit.score);
 assert.equal(practiced.state.count,1);assert.equal(practiced.state.visit.length,1);
 await Promise.all([settlePractice(),settlePractice()]);
 assert.equal((await setup.query('select state_version from practice_sessions where id=$1',[practice.id])).rows[0].state_version,practiced.state_version);

 const recoverable=await launchPractice();await r.del(activityKey);
 assert.equal(await hasImpactActivity(),false,'Redis intentionally loses the committed launch hint');
 const recovery=new ImpactPolling({hasActivity:hasImpactActivity,hasPending:hasPendingImpacts});
 assert.equal(await recovery.shouldPoll(),true,'A restarted worker discovers the durable pending launch');
 const recovered=async()=>Number((await setup.query('select state from practice_sessions where id=$1',[recoverable.id])).rows[0].state.count)===1;
 await processUntil(recovery,recovered,recoverable.state.impactAt!);
 const recoveredState=(await setup.query('select state from practice_sessions where id=$1',[recoverable.id])).rows[0].state;
 assert.equal(recoveredState.sessionPoints,recoverable.state.dart!.hit.score);
 assert.equal(recoveredState.count,1);
 console.log('Real match/practice launches wake idle polling, preserve scoring, settle exactly once at the active cadence, and recover durable launches after Redis hint loss.');
}finally{
 const c=await setup.connect();try{
  await c.query('begin');
  const matches=matchId?[matchId]:[],channels=(await c.query('select id from channels where match_id=any($1::uuid[])',[matches])).rows.map(row=>row.id);
  await c.query('delete from channel_memberships where channel_id=any($1::uuid[])',[channels]);await c.query('delete from channels where id=any($1::uuid[])',[channels]);
  for(const table of ['private.match_commands','match_darts','match_events','active_player_reservations','match_players'])await c.query(`delete from ${table} where match_id=any($1::uuid[])`,[matches]);
  await c.query('delete from matches where id=any($1::uuid[])',[matches]);
  await c.query('delete from private.practice_commands where user_id=any($1::uuid[])',[ids]);
  await c.query('delete from practice_results where user_id=any($1::uuid[])',[ids]);await c.query('delete from practice_sessions where user_id=any($1::uuid[])',[ids]);await c.query('delete from practice_progress where user_id=any($1::uuid[])',[ids]);await c.query('delete from user_badges where user_id=any($1::uuid[])',[ids]);
  await c.query('delete from private.command_ingress where actor_id=any($1::uuid[])',[ids]);await c.query('delete from private.audit_events where actor_id=any($1::uuid[]) or subject=any($2::text[])',[ids,[room,...matches,...ids]]);
  await c.query('delete from room_memberships where user_id=any($1::uuid[])',[ids]);await c.query('delete from community_rooms where id=$1',[room]);await c.query('delete from preferences where user_id=any($1::uuid[])',[ids]);await c.query('delete from player_ratings where user_id=any($1::uuid[])',[ids]);await c.query('delete from private.legal_acceptances where user_id=any($1::uuid[])',[ids]);await c.query('delete from profiles where id=any($1::uuid[])',[ids]);await c.query('delete from auth.users where id=any($1::uuid[])',[ids]);
  await c.query('commit');
 }catch(error){await c.query('rollback');throw error;}finally{c.release();await setup.end();await db().end();if(originalDraining===null)await r.del('dartspoint:draining');await r.quit();}
}
