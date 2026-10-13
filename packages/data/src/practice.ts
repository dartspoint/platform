import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {db,transaction,rateLimit} from './db';
import {currentRoomMembership} from './community';
import {registerIngress,type TrustedIngress} from './timing';
import {admittedMoment,admittedSample,TIMING_VERSION,type TimingVersion} from '../../game-core/src/timing';
import type {Actor} from './auth';
import {requireThat,uuid,DomainError,renderSampleSchema} from '../../contracts/src/index';
import {meterPosition} from './matches';
import {scoreDart,applyDart,type DartHit} from '../../game-core/src/darts-rules';
import {applyPracticeHit,emptyPracticeProgress,practiceChallenge,practiceBadges} from '../../game-core/src/darts-practice';
import type {PoolClient} from 'pg';
const configuration=z.object({mode:z.enum(['free','doubles','bull','checkout','challenge']),tutorial:z.boolean(),chosenDouble:z.number().int().min(1).max(20),finish:z.number().int().min(2).max(170)}).strict();
const command=z.object({commandId:uuid,type:z.enum(['reset','horizontal','vertical','next']),sessionId:uuid.optional(),expectedStateVersion:z.number().int().positive().optional(),phaseToken:uuid.optional(),configuration:configuration.optional(),renderSample:renderSampleSchema.optional()}).strict();
type State={configuration:z.infer<typeof configuration>;phase:string;phaseToken:string;phaseStartedAt:number;lastAcceptedAt:number;timingVersion?:TimingVersion;lockedY:number|null;lockedX:number|null;impactAt:number|null;dart:{id:number;hit:DartHit}|null;visit:DartHit[];count:number;sessionPoints:number;targetsHit:number;remaining:number;attemptEnded:boolean;message:string;target:string|null};
function view(row:any){return {id:row.id,state:row.state as State,stateVersion:Number(row.state_version),serverAt:Date.now()};}
async function progress(c:PoolClient,userId:string){return (await c.query('select data from practice_progress where user_id=$1 for update',[userId])).rows[0]?.data??emptyPracticeProgress();}
async function impact(c:PoolClient,row:any){
 const s=row.state as State;if(s.phase!=='flying'||s.impactAt!>Date.now())return;
 const hit=s.dart!.hit,nextVisit=[...s.visit,hit],total=nextVisit.reduce((a,h)=>a+h.score,0),config=s.configuration;
 const result=config.mode==='checkout'&&!config.tutorial?applyDart(s.remaining,config.finish,hit):null;
 let p=applyPracticeHit(await progress(c,row.user_id),hit,{visitTotal:total,visitComplete:nextVisit.length===3,checkout:result?.checkout?config.finish:undefined});
 if(config.tutorial&&s.count+1===5)p={...p,tutorialCompleted:true};
 await c.query('insert into practice_progress(user_id,data) values($1,$2) on conflict(user_id) do update set data=excluded.data,updated_at=now()',[row.user_id,JSON.stringify(p)]);
 for(const badge of practiceBadges(p).filter(b=>b.unlocked))await c.query('insert into user_badges(user_id,badge) values($1,$2) on conflict do nothing',[row.user_id,'practice:'+badge.id]);
 const state:State={...s,visit:nextVisit,count:s.count+1,sessionPoints:s.sessionPoints+hit.score,targetsHit:s.targetsHit+(s.target===hit.label?1:0),phase:config.tutorial&&s.count+1===5?'done':'pause',impactAt:null,remaining:result?.remaining??s.remaining,attemptEnded:!!result&&(result.bust||result.checkout||nextVisit.length===3),message:result?.checkout?`${config.finish} uitgegooid! Afgesloten met ${hit.label}.`:result?.bust?`Bust. Terug naar ${config.finish}.`:`${hit.label} · ${hit.score} punten.`};
 await c.query('update practice_sessions set state=$2,state_version=state_version+1,completed_at=case when $3 then now() else completed_at end where id=$1',[row.id,JSON.stringify(state),state.phase==='done']);row.state=state;row.state_version=Number(row.state_version)+1;
 await c.query('insert into practice_results(session_id,user_id,week,data) values($1,$2,$3,$4) on conflict(session_id) do update set data=excluded.data,week=excluded.week',[row.id,row.user_id,practiceChallenge().id,JSON.stringify(state)]);
}
export async function practiceSnapshot(actor:Actor,id:string){return transaction(async c=>{uuid.parse(id);await c.query('select id from profiles where id=$1 for update',[actor.id]);requireThat(!(await c.query('select 1 from active_player_reservations where user_id=$1',[actor.id])).rowCount,'active_match',409);const row=(await c.query('select * from practice_sessions where id=$1 and user_id=$2 for update',[id,actor.id])).rows[0];requireThat(row,'practice_not_found',404);requireThat(row.room_id,'join_room_first',403);await currentRoomMembership(c,actor,row.room_id);await impact(c,row);return view(row);});}
export async function capturePracticeIngress(actor:Actor,input:unknown,ingress:TrustedIngress){const cmd=command.parse(input);await rateLimit('practice:'+actor.id,120,60);const policy=cmd.type==='reset'?TIMING_VERSION:(await db().query("select state->>'timingVersion' version from practice_sessions where id=$1 and user_id=$2",[cmd.sessionId,actor.id])).rows[0]?.version;const version:TimingVersion=policy===TIMING_VERSION?TIMING_VERSION:policy==='bounded-latency-v2'?'bounded-latency-v2':'receive-v1';return registerIngress('practice',actor,cmd.commandId,cmd,ingress,version);}
export async function practiceCommand(actor:Actor,input:unknown,ingress:TrustedIngress={receivedAt:Date.now()},captured?:Awaited<ReturnType<typeof capturePracticeIngress>>){const started=performance.now();const cmd=command.parse(input),registered=captured??await capturePracticeIngress(actor,cmd,ingress);return transaction(async c=>{
 await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['practice:'+actor.id]);await c.query('select id from profiles where id=$1 for update',[actor.id]);
 const roomId=await currentRoomMembership(c,actor);requireThat(!(await c.query('select 1 from active_player_reservations where user_id=$1',[actor.id])).rowCount,'active_match',409,'Keer terug naar je actieve wedstrijd.');
 const hash=createHash('sha256').update(JSON.stringify(cmd)).digest('hex');const prior=(await c.query('select * from private.practice_commands where user_id=$1 and command_id=$2',[actor.id,cmd.commandId])).rows[0];if(prior){requireThat(prior.request_hash===hash,'command_conflict',409);return {...prior.receipt,commandId:cmd.commandId};}
 let row:any;
 if(cmd.type==='reset'){
  const config=configuration.parse(cmd.configuration);const pending=(await c.query("select * from practice_sessions where user_id=$1 and state->>'phase'='flying' for update",[actor.id])).rows;
  for(const old of pending){await impact(c,old);requireThat(old.state.phase!=='flying','impact_pending',409);}
  await c.query('update practice_sessions set completed_at=now() where user_id=$1 and completed_at is null',[actor.id]);
  const state:State={configuration:config,phase:'horizontal',phaseToken:randomUUID(),phaseStartedAt:Date.now(),lastAcceptedAt:0,timingVersion:TIMING_VERSION,lockedX:null,lockedY:null,impactAt:null,dart:null,visit:[],count:0,sessionPoints:0,targetsHit:0,remaining:config.finish,attemptEnded:false,message:'Stop de richting. Daarna kies je de hoogte.',target:null};
  row=(await c.query('insert into practice_sessions(user_id,mode,state,room_id) values($1,$2,$3,$4) returning *',[actor.id,config.mode,JSON.stringify(state),roomId])).rows[0];
 }else{
  requireThat(cmd.sessionId,'practice_not_found',404);row=(await c.query('select * from practice_sessions where id=$1 and user_id=$2 for update',[cmd.sessionId,actor.id])).rows[0];requireThat(row,'practice_not_found',404);requireThat(!row.completed_at,'practice_session_completed',409);requireThat(row.room_id===roomId,'practice_room_changed',409,'Keer terug naar de kamer van deze oefensessie.');await impact(c,row);
  const s=row.state as State;requireThat(Number(row.state_version)===cmd.expectedStateVersion,'stale_state',409);requireThat(s.phaseToken===cmd.phaseToken,'stale_phase',409);const now=Date.now();let admittedAt=now;if(['horizontal','vertical'].includes(cmd.type)){
   if(s.timingVersion===TIMING_VERSION){requireThat(cmd.renderSample&&cmd.renderSample.connectionId===registered.connectionId,'timing_connection_mismatch',409);requireThat(cmd.renderSample.dartNumber===s.count+1,'stale_dart',409);requireThat(registered.admissionWindowMs>0,'timing_not_calibrated',409,'De timing wordt nog afgestemd. Wacht even.');try{admittedAt=admittedSample(cmd.renderSample.sampleAt,registered.receivedAt,registered.admissionWindowMs,s.phaseStartedAt,s.lastAcceptedAt??0,now);}catch{throw new DomainError('invalid_render_sample',409,'Deze timingmeting is te oud of ongeldig. De indicator wordt hersteld; er is geen pijl gegooid.');}}
   else{try{admittedAt=admittedMoment(registered.receivedAt,s.timingVersion==='bounded-latency-v2'?registered.latencyMs:0,s.phaseStartedAt,s.lastAcceptedAt??0,now);}catch{throw new DomainError('invalid_timing',409);}}
   s.lastAcceptedAt=admittedAt;
  }
  if(cmd.type==='horizontal'){requireThat(s.phase==='horizontal','wrong_phase',409);s.lockedX=meterPosition(admittedAt,s.phaseStartedAt,'horizontal');s.lockedY=null;s.phase='vertical';s.message='Richting vast. Stop nu de hoogte.';}
  if(cmd.type==='vertical'){
   requireThat(s.phase==='vertical','wrong_phase',409);s.lockedY=meterPosition(admittedAt,s.phaseStartedAt,'vertical');const hit=scoreDart(s.lockedX!,s.lockedY);s.dart={id:s.count+1,hit};s.phase='flying';s.impactAt=now+560;s.message='Daar gaat je pijl…';const config=s.configuration,p=await progress(c,actor.id),challenge=practiceChallenge();
   s.target=config.tutorial?(s.count===2?'BULL':s.count===3?'D20':null):config.mode==='bull'?'BULL':config.mode==='doubles'?`D${config.chosenDouble}`:config.mode==='challenge'?challenge.targets.find(t=>!p.weeks[challenge.id]?.includes(t))??null:null;
  }
  if(cmd.type==='next'){requireThat(s.phase==='pause','wrong_phase',409);if(s.visit.length===3||s.attemptEnded){s.visit=[];s.remaining=s.configuration.finish;s.attemptEnded=false;}s.phase='horizontal';s.lockedX=null;s.lockedY=null;s.message='Nieuwe pijl. Vind je richting.';}
  s.phaseToken=randomUUID();s.phaseStartedAt=now;await c.query('update practice_sessions set state=$2,state_version=state_version+1 where id=$1',[row.id,JSON.stringify(s)]);row.state=s;row.state_version=Number(row.state_version)+1;
 }
 const receipt={...view(row),commandId:cmd.commandId,timing:{receivedAt:registered.receivedAt,admittedAt:row.state.lastAcceptedAt||registered.receivedAt,timingVersion:row.state.timingVersion??'receive-v1',connectionId:registered.connectionId,latencyMs:registered.latencyMs,admissionWindowMs:registered.admissionWindowMs,processedAt:Date.now(),dbMs:performance.now()-started}};await c.query('insert into private.practice_commands(user_id,command_id,request_hash,receipt,received_at,admitted_at,timing_version) values($1,$2,$3,$4,$5,$6,$7)',[actor.id,cmd.commandId,hash,JSON.stringify(receipt),new Date(registered.receivedAt),new Date(row.state.lastAcceptedAt||registered.receivedAt),row.state.timingVersion??'receive-v1']);return receipt;
});}
export async function settlePractice(){await transaction(async c=>{const rows=(await c.query("select * from practice_sessions where state->>'phase'='flying' and (state->>'impactAt')::bigint<=$1 for update skip locked",[Date.now()])).rows;for(const row of rows)await impact(c,row);});}
