import {validateHeroImage,heroAssetId,type HeroImage} from '../../contracts/src/hero';
import {syncMediaReferences} from './lobby';
import {randomUUID,randomInt} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {db,transaction,audit,outbox,draining} from './db';
import {actorById,staff,type Actor} from './auth';
import {requireThat,uuid,DomainError} from '../../contracts/src/index';
import {admission,createMatch,finishMatch} from './matches';
import {DEFAULT_TOURNAMENT_SETTINGS,validateTournamentSettings,eligibilityReasons,registrationIsOpen,checkInIsOpen,eligibleParticipants,buildTournamentBracket,applyTournamentResult,type Tournament,type TournamentInput,type TournamentParticipant} from '../../game-core/src/darts-tournament-model';
import {planTournamentBoards,assignTournamentBoardPure,startTournamentMatchPure} from '../../game-core/src/darts-tournament-planning';
import {DEFAULT_ADMIN_SETTINGS} from './settings-model';
import {buildDivisionSchedule,applyDivisionResult,validateDivisionSeason,finishDivisionSeason,getDivisionMovements,addDivisionDays,type DivisionSeason,type DivisionSeasonInput,type DivisionColor} from '../../game-core/src/darts-divisions-model';

const date=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const reasonSchema=z.string().trim().min(5).max(500);
const text=z.string().trim().min(1).max(100);
const heroSchema=z.object({src:z.string().max(2048),positionX:z.number().finite().min(0).max(100),positionY:z.number().finite().min(0).max(100),overlay:z.number().finite().min(25).max(85)}).strict();
function checkHero(hero:HeroImage|undefined){if(hero===undefined)return;try{validateHeroImage(hero);}catch(error){throw new DomainError('invalid_hero',400,error instanceof Error?error.message:'Kies een geldige afbeelding.');}}
const seasonInput=z.object({name:text.optional(),description:z.string().max(2000).optional(),startsOn:z.string().optional(),bestOf:z.number().optional(),promoteCount:z.number().optional(),relegateCount:z.number().optional(),divisions:z.array(z.object({name:text,color:z.enum(['gold','silver','bronze','green','blue'])}).strict()).min(1).max(8).optional()}).strict();
function makeSeason(input:DivisionSeasonInput={}):DivisionSeason{const id=randomUUID(),now=Date.now();return {id,name:input.name??'Nieuw seizoen',description:input.description??'',startsOn:input.startsOn??date(),bestOf:input.bestOf??5,promoteCount:input.promoteCount??1,relegateCount:input.relegateCount??1,divisions:(input.divisions??[{name:'Premier Division',color:'gold'}]).map((d,i)=>({...d,id:randomUUID(),level:i+1})),status:'draft',members:[],fixtures:[],previousSeasonId:null,createdAt:now,updatedAt:now,completedAt:null,completionReason:''};}
async function userByName(c:PoolClient,name:unknown){const value=text.parse(name);const p=(await c.query('select id,username from profiles where username_key=lower($1) and status=$2',[value,'active'])).rows[0];requireThat(p,'player_not_found',404);return p;}
async function participant(c:PoolClient,id:string,seed:number):Promise<TournamentParticipant>{const actor=await actorById(id,Date.now()+3600000);const r=(await c.query('select rating,ranked_played from player_ratings where user_id=$1',[id])).rows[0];return {id,name:actor.username!,role:actor.role,rating:Number(r.rating),played:r.ranked_played,status:'confirmed',ready:false,rulesAccepted:false,approved:false,seed,joinedAt:Date.now()};}
async function resolveRoom(c:PoolClient,name:string){const r=(await c.query("select * from community_rooms where name=$1 and category='tournament' and status='open'",[name])).rows[0];requireThat(r,'tournament_room_required',400);return r;}
async function saveTournament(c:PoolClient,actor:Actor|null,t:Tournament,action:string,reason?:string){
 for(const [key,value] of Object.entries(DEFAULT_TOURNAMENT_SETTINGS))requireThat(typeof (t.settings as any)[key]===typeof value,'invalid_setting_type',400);
 try{validateTournamentSettings(t.settings);}catch(e){throw new DomainError('invalid_settings',400,e instanceof Error?e.message:'Ongeldige toernooi-instellingen');}requireThat(t.settings.doubleOut,'double_out_required',400);
 const room=await resolveRoom(c,t.settings.room);requireThat(!t.published||t.settings.maxPlayers<=room.capacity,'capacity_exceeds_room',400,'Het deelnemersmaximum mag niet groter zijn dan de kamercapaciteit.');
 checkHero(t.hero);const assetId=heroAssetId(t.hero);await syncMediaReferences(c,'tournament',t.id,assetId?[assetId]:[]);
 const model={...planTournamentBoards(t),updatedAt:Date.now()};
 const saved=(await c.query("insert into tournaments(id,room_id,name,status,published,model) values($1,$2,$3,$4,$5,$6) on conflict(id) do update set room_id=$2,name=$3,status=$4,published=$5,model=$6,hero_version=tournaments.hero_version+case when tournaments.model->'hero' is distinct from excluded.model->'hero' then 1 else 0 end,version=tournaments.version+1,updated_at=now() returning hero_version",[t.id,room.id,t.name,t.status,t.published,JSON.stringify(model)])).rows[0];
 for(const p of t.participants)await c.query('insert into tournament_entries(tournament_id,user_id,state,ready,accepted_rules_version) values($1,$2,$3,$4,$5) on conflict(tournament_id,user_id) do update set state=$3,ready=$4,accepted_rules_version=$5',[t.id,p.id,p.status,p.ready,p.rulesAccepted?1:null]);
 for(const node of model.matches)await c.query('insert into tournament_nodes(tournament_id,node_id,model) values($1,$2,$3) on conflict(tournament_id,node_id) do update set model=$3',[t.id,node.id,JSON.stringify(node)]);
 for(let number=1;number<=model.settings.boardCount;number++)await c.query('insert into boards(tournament_id,number) values($1,$2) on conflict(tournament_id,number) do nothing',[t.id,number]);
 await audit(c,actor?.id??null,'tournament.'+action,t.id,{},reason);return {...model,heroVersion:Number(saved.hero_version)};
}
async function saveSeason(c:PoolClient,actor:Actor|null,s:DivisionSeason,action:string,reason?:string){
 validateDivisionSeason(s);s={...s,updatedAt:Date.now()};
 await c.query('insert into seasons(id,name,status,model) values($1,$2,$3,$4) on conflict(id) do update set name=$2,status=$3,model=$4,version=seasons.version+1',[s.id,s.name,s.status,JSON.stringify(s)]);
 for(const d of s.divisions)await c.query('insert into divisions(id,season_id,level,name,color) values($1,$2,$3,$4,$5) on conflict(id) do update set level=$3,name=$4,color=$5',[d.id,s.id,d.level,d.name,d.color]);
 for(const m of s.members)await c.query('insert into division_memberships(season_id,user_id,division_id) values($1,$2,$3) on conflict(season_id,user_id) do update set division_id=$3',[s.id,m.id,m.divisionId]);
 for(const f of s.fixtures){if(f.players[1]){const [lo,hi]=[f.players[0],f.players[1]].sort();await c.query('insert into division_fixtures(season_id,division_id,player_low,player_high,model) values($1,$2,$3,$4,$5) on conflict(season_id,player_low,player_high) do update set model=$5',[s.id,f.divisionId,lo,hi,JSON.stringify(f)]);}}
 await audit(c,actor?.id??null,'division.'+action,s.id,{},reason);return s;
}
export async function tournamentAction(actor:Actor,input:unknown){
 const {action,args}=z.object({action:z.string().max(64),args:z.array(z.unknown()).max(5)}).strict().parse(input);
 const selfActions=['addTournamentParticipant','updateTournamentParticipant','setTournamentReady','startTournamentMatch'];if(!selfActions.includes(action))staff(actor);
 return transaction(async c=>{
  await c.query('select pg_advisory_xact_lock(1247281200)');
  let id:string,t:Tournament;
  if(action==='createTournament'){
   const patch=z.object({name:text.optional(),description:z.string().max(2000).optional(),published:z.boolean().optional(),hero:heroSchema.optional(),expectedHeroVersion:z.number().int().positive().optional(),settings:z.record(z.string(),z.unknown()).optional()}).strict().parse(args[0]??{}) as TournamentInput;
   for(const key of Object.keys(patch.settings??{}))requireThat(key in DEFAULT_TOURNAMENT_SETTINGS,'unknown_setting',400);
   const room=(await c.query("select name from community_rooms where category='tournament' and status='open' order by name limit 1")).rows[0];requireThat(room,'tournament_room_required',400);
   const defaults=(await c.query("select data from private.system_settings where key='settings'")).rows[0]?.data??DEFAULT_ADMIN_SETTINGS;const game=defaults.game,entry=defaults.entry;
   id=randomUUID();const now=Date.now();t={id,name:patch.name??'Nieuw toernooi',description:patch.description??'',published:patch.published??false,hero:patch.hero,organizer:'DartsPoint',status:'draft',settings:{...DEFAULT_TOURNAMENT_SETTINGS,startScore:game.startScore,bestOf:game.bestOfLegs,finalBestOf:game.finalBestOfLegs,turnSeconds:game.turnSeconds,reconnectSeconds:game.reconnectSeconds,checkoutHints:game.checkoutHints,maxPlayers:entry.maxPlayers,minRating:entry.minRating,maxRating:entry.maxRating,minMatches:entry.minMatches,requireCheckIn:entry.requireCheckIn,checkInMinutes:entry.checkInMinutes,approvalRequired:entry.approval,vipOnly:entry.vipOnly,room:room.name,...patch.settings,spectators:true,doubleOut:true},participants:[],matches:[],championId:null,createdAt:now,updatedAt:now};
  }else{
   id=uuid.parse(args[0]);const row=(await c.query('select model,hero_version from tournaments where id=$1 for update',[id])).rows[0];requireThat(row,'tournament_not_found',404);t={...row.model,heroVersion:Number(row.hero_version)};
   if(action==='updateTournamentHero'){
    const patch=z.object({hero:heroSchema,expectedHeroVersion:z.number().int().positive()}).strict().parse(args[1]);checkHero(patch.hero);requireThat(patch.expectedHeroVersion===Number(row.hero_version),'hero_version_conflict',409,'Een andere beheerder heeft de afbeelding gewijzigd. Herlaad het toernooi voordat je opnieuw opslaat.');
    const assetId=heroAssetId(patch.hero);await syncMediaReferences(c,'tournament',id,assetId?[assetId]:[]);const next={...row.model,hero:patch.hero,heroVersion:Number(row.hero_version)+1,updatedAt:Date.now()};
    await c.query('update tournaments set model=$2,hero_version=hero_version+1,version=version+1,updated_at=now() where id=$1',[id,JSON.stringify(next)]);await audit(c,actor.id,'tournament.hero',id,{heroVersion:next.heroVersion,assetId,source:patch.hero.src.startsWith('https:')?'allowed-https':assetId?'uploaded':patch.hero.src?'default':'none'});return next as Tournament;
   }else if(action==='cloneTournament'){const now=Date.now();t={...t,id:randomUUID(),name:(t.name+' — kopie').slice(0,100),published:false,status:'draft',participants:[],matches:[],championId:null,createdAt:now,updatedAt:now};}
   else if(action==='updateTournament'){
    const patch=z.object({name:text.optional(),description:z.string().max(2000).optional(),published:z.boolean().optional(),hero:heroSchema.optional(),expectedHeroVersion:z.number().int().positive().optional(),settings:z.record(z.string(),z.unknown()).optional()}).strict().parse(args[1]) as TournamentInput;
    if(patch.hero!==undefined){checkHero(patch.hero);requireThat(patch.expectedHeroVersion===Number(row.hero_version),'hero_version_conflict',409,'Een andere beheerder heeft de afbeelding gewijzigd. Herlaad het toernooi.');}delete patch.expectedHeroVersion;
    requireThat(!patch.settings||!['live','completed','cancelled'].includes(t.status),'settings_locked',409);for(const key of Object.keys(patch.settings??{}))requireThat(key in DEFAULT_TOURNAMENT_SETTINGS,'unknown_setting',400);
    t={...t,...patch,settings:{...t.settings,...patch.settings,spectators:true,doubleOut:true}};if(patch.settings)t={...t,matches:[],championId:null};
   }else if(action==='setTournamentPublished')t={...t,published:z.boolean().parse(args[1])};
   else if(action==='deleteTournament'){requireThat(t.status==='draft'&&!t.participants.length,'draft_required',409);await c.query('delete from boards where tournament_id=$1',[id]);await c.query("delete from private.media_references where scope='tournament' and subject=$1",[id]);await c.query('delete from tournaments where id=$1',[id]);await audit(c,actor.id,'tournament.delete',id);return {id};}
   else if(action==='setTournamentStatus'){
    const status=z.enum(['draft','registration','checkin','live','cancelled']).parse(args[1]);requireThat(!['live','completed','cancelled'].includes(t.status)||status==='cancelled','status_locked',409);requireThat(status!=='live','use_start_action');
    if(status==='cancelled'){
     const live=(await c.query("select id,state,lifecycle from matches where competition->>'id'=$1 and lifecycle in('assigned','playing','paused') order by id for update",[id])).rows;
     requireThat(live.every(m=>m.lifecycle==='assigned'),'active_matches_must_finish',409,'Laat lopende wedstrijden afronden voordat je het toernooi annuleert.');
     const ids=live.map(m=>m.id);await c.query("update matches set lifecycle='cancelled',ended_at=now() where id=any($1::uuid[])",[ids]);await c.query('delete from active_player_reservations where match_id=any($1::uuid[])',[ids]);await c.query('delete from board_reservations where match_id=any($1::uuid[])',[ids]);
     await audit(c,actor.id,'tournament.cancel',id,{cancelledAssignments:ids.length},'Toernooi geannuleerd');
    }
    t={...t,status};
   }
   else if(action==='addTournamentParticipant'){
    const p=z.object({name:text,rulesAccepted:z.boolean().optional(),approved:z.boolean().optional(),rating:z.number().optional(),played:z.number().optional(),role:z.string().optional()}).strict().parse(args[1]);
    const member=await userByName(c,p.name);const self=member.id===actor.id;
    requireThat(self||['owner','admin'].includes(actor.role),'forbidden',403);requireThat(!['live','completed','cancelled'].includes(t.status),'entries_locked',409);requireThat(!self||registrationIsOpen(t),'registration_closed',409);
    const previous=t.participants.find(p=>p.id===member.id);requireThat(!previous||previous.status==='withdrawn','already_entered',409);
    let candidate=await participant(c,member.id,previous?.seed??t.participants.length+1);candidate={...candidate,rulesAccepted:!!p.rulesAccepted,approved:self?!t.settings.approvalRequired:!!p.approved||!t.settings.approvalRequired};
    const reasons=eligibilityReasons(t,candidate);requireThat(!self||!reasons.filter(r=>r!=='Goedkeuring door beheer nodig').length,'ineligible',403,reasons.join(' · '));
    const full=t.participants.filter(p=>['confirmed','checkedin'].includes(p.status)).length>=t.settings.maxPlayers;
    if(reasons.length||full)candidate.status='waiting';candidate.ready=candidate.status==='confirmed'&&!t.settings.requireCheckIn;
    t={...t,participants:[...t.participants.filter(p=>p.id!==member.id),candidate],matches:[],championId:null};
   }else if(action==='updateTournamentParticipant'||action==='removeTournamentParticipant'){
    const pid=uuid.parse(args[1]);const current=t.participants.find(p=>p.id===pid);requireThat(current,'participant_not_found',404);const self=pid===actor.id;requireThat(self||['owner','admin'].includes(actor.role),'forbidden',403);
    const patch=action==='removeTournamentParticipant'?{status:'withdrawn' as const}:z.object({status:z.enum(['waiting','confirmed','checkedin','withdrawn']).optional(),rulesAccepted:z.boolean().optional(),approved:z.boolean().optional(),seed:z.number().int().min(1).max(64).optional()}).strict().parse(args[2]);
    if(self){requireThat(patch.approved===undefined&&patch.seed===undefined&&(!patch.status||['checkedin','withdrawn'].includes(patch.status)),'staff_only',403);requireThat(patch.status!=='checkedin'||checkInIsOpen(t),'checkin_closed',409);}
    requireThat(!['completed','cancelled'].includes(t.status),'entries_locked',409);
    if(t.status==='live'){requireThat(patch.status==='withdrawn','entries_locked',409);for(const n of t.matches.filter(n=>n.players.includes(pid)&&['ready','playing'].includes(n.status))){const other=n.players.find(p=>p&&p!==pid);if(other){const linked=(await c.query('select m.id,m.state from tournament_nodes n join matches m on m.id=n.match_id where n.tournament_id=$1 and n.node_id=$2 for update of m',[t.id,n.id])).rows[0];if(linked){requireThat(!linked.state.pendingDart,'impact_pending',409);await c.query("update matches set lifecycle='cancelled',ended_at=now() where id=$1 and lifecycle in('assigned','playing','paused')",[linked.id]);await c.query('delete from active_player_reservations where match_id=$1',[linked.id]);await c.query('delete from board_reservations where match_id=$1',[linked.id]);await audit(c,actor.id,'competition.withdrawal',linked.id,{},'Deelnemer teruggetrokken');}t=applyTournamentResult(t,n.id,{score:[0,0],kind:'walkover',winnerId:other,reason:'Deelnemer teruggetrokken'});}}}
    const refreshed=await participant(c,pid,current.seed);let next={...current,rating:refreshed.rating,played:refreshed.played,role:refreshed.role,...patch};if(patch.status==='checkedin')next.ready=true;if(patch.status==='withdrawn')next.ready=false;
    if(['confirmed','checkedin'].includes(next.status)){requireThat(!eligibilityReasons(t,next).length,'ineligible',403);requireThat(t.participants.filter(p=>p.id!==pid&&['confirmed','checkedin'].includes(p.status)).length<t.settings.maxPlayers,'tournament_full',409);}
    t={...t,participants:t.participants.map(p=>p.id===pid?next:patch.seed===p.seed?{...p,seed:current.seed}:p)};
   }else if(action==='generateTournamentBracket'){requireThat(['registration','checkin'].includes(t.status),'checkin_required',409);t=buildTournamentBracket(t,()=>randomInt(0,2**24)/2**24);}
   else if(action==='startTournament'){
    await admission(c);requireThat(['registration','checkin'].includes(t.status)&&t.matches.length>0,'bracket_required',409);requireThat(!t.settings.startsAt||Date.now()>=Date.parse(t.settings.startsAt),'too_early',409);requireThat(eligibleParticipants(t).length>=2,'not_enough_players',409);
    for(const p of eligibleParticipants(t)){const now=await participant(c,p.id,p.seed);requireThat(!eligibilityReasons(t,{...p,role:now.role,rating:now.rating,played:now.played}).length,'eligibility_changed',409);}
    t={...t,status:'live'};
   }else if(action==='recordTournamentResult'){
    const result=z.object({score:z.tuple([z.number().int(),z.number().int()]),kind:z.enum(['played','walkover']).optional(),winnerId:uuid.optional(),reason:reasonSchema}).strict().parse(args[2]);
    requireThat(!(await c.query("select 1 from tournament_nodes n join matches m on m.id=n.match_id where n.tournament_id=$1 and n.node_id=$2 and m.lifecycle in('assigned','playing','paused')",[id,args[1]])).rowCount,'active_match_cannot_be_replaced',409);
    t=applyTournamentResult(t,z.string().parse(args[1]),result);await c.query('insert into private.competition_decisions(actor_id,context,reason) values($1,$2,$3)',[actor.id,JSON.stringify({tournamentId:id,nodeId:args[1],result}),result.reason]);
   }else if(action==='resetTournamentBracket'){const reason=reasonSchema.parse(args[1]);requireThat(!(await c.query("select 1 from matches where competition->>'id'=$1 and lifecycle in('assigned','playing','paused')",[id])).rowCount,'active_matches',409);t={...t,status:'checkin',matches:[],championId:null};await audit(c,actor.id,'tournament.reset',id,{},reason);}
   else if(action==='setTournamentReady'){const pid=uuid.parse(args[1]),ready=z.boolean().parse(args[2]);requireThat(pid===actor.id||['owner','admin'].includes(actor.role),'forbidden',403);requireThat(t.participants.some(p=>p.id===pid&&p.status==='checkedin'),'checkin_required',409);t={...t,participants:t.participants.map(p=>p.id===pid?{...p,ready}:p)};}
   else if(action==='assignTournamentBoard')t=assignTournamentBoardPure(t,z.string().parse(args[1]),z.number().int().min(1).max(t.settings.boardCount).nullable().parse(args[2]));
   else if(action==='startTournamentMatch'){
    const node=t.matches.find(n=>n.id===args[1]);requireThat(node&&(node.players.includes(actor.id)||['owner','admin'].includes(actor.role)),'assigned_players_only',403);await admission(c);
    t=await scheduleTournament(c,t,z.string().parse(args[1]));const assignment=(await c.query('select match_id from tournament_nodes where tournament_id=$1 and node_id=$2',[id,args[1]])).rows[0];return {tournament:await saveTournament(c,actor,t,action),matchId:assignment?.match_id};
   }else if(action!=='refreshTournamentSchedule')throw new DomainError('unknown_action',400);
  }
  return saveTournament(c,actor,t,action);
 });
}
async function scheduleTournament(c:PoolClient,t:Tournament,only?:string){
 t=planTournamentBoards(t);if(t.status!=='live'||await draining())return t;
 const room=await resolveRoom(c,t.settings.room);
 for(const node of [...t.matches].filter(n=>n.status==='ready'&&n.boardId&&(!only||n.id===only))){
  const previous=(await c.query('select match_id from tournament_nodes where tournament_id=$1 and node_id=$2',[t.id,node.id])).rows[0];
  if(previous?.match_id){const m=(await c.query('select lifecycle from matches where id=$1',[previous.match_id])).rows[0];if(m&&m.lifecycle!=='cancelled')continue;}
  if(!node.players.every(Boolean))continue;
  const members=(await c.query('select count(*) n from room_memberships where room_id=$1 and user_id=any($2::uuid[]) and lease_until>now()',[room.id,node.players])).rows[0];if(Number(members.n)!==2)continue;
  if((await c.query('select 1 from active_player_reservations where user_id=any($1::uuid[])',[node.players])).rowCount)continue;
  const actor=await actorById(node.players[0]!,Date.now()+3600000);
  const {matchId}=await createMatch(c,actor,node.players[1]!,room.id,{startScore:t.settings.startScore,doubleIn:t.settings.startScore===301,doubleOut:true,bestOf:node.bestOf,format:'legs',bestOfSets:1},'tournament',{type:'tournament',id:t.id,nodeId:node.id,ranked:t.settings.ranked,turnSeconds:t.settings.turnSeconds,reconnectSeconds:t.settings.reconnectSeconds});
  const board=(await c.query('select id from boards where tournament_id=$1 and number=$2',[t.id,node.boardId])).rows[0];await c.query('insert into board_reservations(board_id,match_id) values($1,$2)',[board.id,matchId]);
  await c.query('update tournament_nodes set match_id=$3 where tournament_id=$1 and node_id=$2',[t.id,node.id,matchId]);t=startTournamentMatchPure(t,node.id);
 }
 return t;
}
export async function scheduleCompetitions(){if(await draining())return;return transaction(async c=>{
 await admission(c);const tournaments=(await c.query("select model from tournaments where status='live' order by id for update skip locked")).rows;
 for(const row of tournaments){const t=await scheduleTournament(c,row.model);if(JSON.stringify(t)!==JSON.stringify(row.model))await saveTournament(c,null,t,'scheduled');}
});}
export async function divisionAction(actor:Actor,input:unknown){
 const {action,args}=z.object({action:z.string(),args:z.array(z.unknown()).max(4)}).strict().parse(input);staff(actor);
 return transaction(async c=>{
  await c.query('select pg_advisory_xact_lock(1247281201)');let s:DivisionSeason;
  if(action==='createDivisionSeason')s=makeSeason(seasonInput.parse(args[0]??{}));
  else{
   const id=uuid.parse(args[0]);const row=(await c.query('select model from seasons where id=$1 for update',[id])).rows[0];requireThat(row,'season_not_found',404);s=row.model;
   const draft=()=>requireThat(s.status==='draft','season_locked',409);
   if(action==='updateDivisionSeason'){draft();const p=seasonInput.omit({divisions:true}).parse(args[1]);s={...s,...p,fixtures:[]};}
   else if(action==='addSeasonDivision'){draft();const p=z.object({name:text,color:z.enum(['gold','silver','bronze','green','blue'])}).strict().parse(args[1]);s={...s,divisions:[...s.divisions,{...p,id:randomUUID(),level:s.divisions.length+1}],fixtures:[]};}
   else if(action==='updateSeasonDivision'){draft();const did=uuid.parse(args[1]);const p=z.object({name:text.optional(),color:z.enum(['gold','silver','bronze','green','blue']).optional(),level:z.number().int().min(1).max(8).optional()}).strict().parse(args[2]);s={...s,divisions:s.divisions.map(d=>d.id===did?{...d,...p}:d),fixtures:[]};}
   else if(action==='removeSeasonDivision'){draft();const did=uuid.parse(args[1]);requireThat(!s.members.some(m=>m.divisionId===did),'division_not_empty',409);await c.query('delete from divisions where id=$1 and season_id=$2',[did,s.id]);s={...s,divisions:s.divisions.filter(d=>d.id!==did).map((d,i)=>({...d,level:i+1})),fixtures:[]};}
   else if(action==='addDivisionMember'){draft();const p=z.object({name:text,divisionId:uuid,rating:z.number().optional()}).strict().parse(args[1]);const user=await userByName(c,p.name);requireThat(!s.members.some(m=>m.id===user.id),'already_entered',409);const real=await participant(c,user.id,1);s={...s,members:[...s.members,{id:user.id,name:real.name,rating:real.rating,divisionId:p.divisionId}],fixtures:[]};}
   else if(action==='moveDivisionMember'){draft();const uid=uuid.parse(args[1]),did=uuid.parse(args[2]);s={...s,members:s.members.map(m=>m.id===uid?{...m,divisionId:did}:m),fixtures:[]};}
   else if(action==='removeDivisionMember'){draft();const uid=uuid.parse(args[1]);await c.query('delete from division_memberships where season_id=$1 and user_id=$2',[s.id,uid]);s={...s,members:s.members.filter(m=>m.id!==uid),fixtures:[]};}
   else if(action==='generateDivisionSchedule'){draft();s=buildDivisionSchedule(s);}
   else if(action==='startDivisionSeason'){draft();await admission(c);requireThat(s.fixtures.length>0,'schedule_required',409);s={...s,status:'live'};}
   else if(action==='recordDivisionResult'){const p=z.object({score:z.tuple([z.number().int(),z.number().int()]),reason:reasonSchema}).strict().parse(args[2]);requireThat(!(await c.query("select 1 from division_fixtures f join matches m on m.id=f.match_id where f.season_id=$1 and f.model->>'id'=$2 and m.lifecycle in('assigned','playing','paused')",[s.id,args[1]])).rowCount,'active_match_cannot_be_replaced',409);s=applyDivisionResult(s,z.string().parse(args[1]),p);await c.query('insert into private.competition_decisions(actor_id,context,reason) values($1,$2,$3)',[actor.id,JSON.stringify({seasonId:s.id,fixtureId:args[1],result:p}),p.reason]);}
   else if(action==='completeDivisionSeason')s=finishDivisionSeason(s,z.string().max(500).parse(args[1]??''));
   else if(action==='createNextDivisionSeason'){requireThat(s.status==='completed','season_not_completed',409);requireThat(!(await c.query("select 1 from seasons where model->>'previousSeasonId'=$1",[s.id])).rowCount,'next_season_exists',409);const moves=getDivisionMovements(s);requireThat(!moves.warnings.length,'manual_promotion_decision_required',409,moves.warnings.join(' '));const p=z.object({name:text.optional(),startsOn:z.string().optional()}).strict().parse(args[1]??{});const next=makeSeason({...p,divisions:s.divisions.map(({name,color})=>({name,color})),bestOf:s.bestOf,promoteCount:s.promoteCount,relegateCount:s.relegateCount,startsOn:p.startsOn??addDivisionDays(s.startsOn,Math.max(...s.fixtures.map(f=>f.matchday),1)*7)});const mapping=Object.fromEntries(s.divisions.map((d,i)=>[d.id,next.divisions[i].id]));s={...next,previousSeasonId:s.id,members:moves.members.map(m=>({...m,divisionId:mapping[m.divisionId]}))};}
   else throw new DomainError('unknown_action',400);
  }
  return saveSeason(c,actor,s,action);
 });
}
export async function startDivisionMatch(actor:Actor,input:unknown){
 const {seasonId,fixtureId}=z.object({seasonId:uuid,fixtureId:z.string().max(150)}).strict().parse(input);
 return transaction(async c=>{
  const row=(await c.query("select model from seasons where id=$1 and status='live' for update",[seasonId])).rows[0];requireThat(row,'season_not_live',409);const s=row.model as DivisionSeason;const f=s.fixtures.find(f=>f.id===fixtureId);requireThat(f&&f.status==='scheduled'&&f.players.includes(actor.id)&&f.players[1],'assigned_players_only',403);
  const match=(await c.query("select match_id from division_fixtures where season_id=$1 and model->>'id'=$2",[seasonId,fixtureId])).rows[0];if(match?.match_id){const m=(await c.query('select lifecycle from matches where id=$1',[match.match_id])).rows[0];if(m.lifecycle!=='cancelled')return {matchId:match.match_id};}
  const room=(await c.query("select id from community_rooms where category='tournament' and status='open' order by name limit 1")).rows[0];requireThat(room,'competition_room_required',400);
  const first=await actorById(f.players[0],Date.now()+3600000);const result=await createMatch(c,first,f.players[1],room.id,{startScore:501,doubleIn:false,doubleOut:true,bestOf:s.bestOf,format:'legs',bestOfSets:1},'division',{type:'division',id:seasonId,fixtureId});
  await c.query("update division_fixtures set match_id=$3 where season_id=$1 and model->>'id'=$2",[seasonId,fixtureId,result.matchId]);return result;
 });
}
export async function competitionResult(c:PoolClient,event:any){
 const p=event.payload;if(!p.competition)return;
 const {type,id,nodeId,fixtureId}=p.competition;
 const match=(await c.query('select * from matches where id=$1',[p.matchId])).rows[0];const players=(await c.query('select user_id from match_players where match_id=$1 order by seat',[p.matchId])).rows;const winner=players.findIndex(r=>r.user_id===p.winnerId);
 if(type==='tournament'){
  const row=(await c.query('select model from tournaments where id=$1 for update',[id])).rows[0];if(!row)return;let t=row.model as Tournament;const node=t.matches.find(m=>m.id===nodeId);if(!node||node.result)return;
  if(winner<0){t={...t,participants:t.participants.map(p=>node.players.includes(p.id)?{...p,ready:false}:p),matches:t.matches.map(n=>n.id===nodeId?{...n,status:'ready',startedAt:null,assignedAt:null,boardId:null}:n)};await c.query('update tournament_nodes set match_id=null where tournament_id=$1 and node_id=$2',[id,nodeId]);}
  else{const target=(node.bestOf+1)/2;const administrative=!['played','forfeit','disconnect'].includes(p.kind);const score: [number,number]=p.kind==='played'?p.score:winner===0?[target,Math.min(p.score[1],target-1)]:[Math.min(p.score[0],target-1),target];t=applyTournamentResult(t,nodeId,{score,...(administrative?{kind:'walkover' as const,winnerId:p.winnerId,reason:p.kind}:{})});}
  await c.query('delete from board_reservations where match_id=$1',[p.matchId]);await saveTournament(c,null,t,'match-finalized');
 }else if(type==='division'){
  const row=(await c.query('select model from seasons where id=$1 for update',[id])).rows[0];if(!row)return;const s=row.model as DivisionSeason;const f=s.fixtures.find(f=>f.id===fixtureId);if(!f||f.result||winner<0)return;
  const target=(s.bestOf+1)/2;const score:[number,number]=p.kind==='played'?p.score:winner===0?[target,Math.min(p.score[1],target-1)]:[Math.min(p.score[0],target-1),target];await saveSeason(c,null,applyDivisionResult(s,fixtureId,{score,reason:p.kind==='played'?'':p.kind}),'match-finalized');
 }
}
