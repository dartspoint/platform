import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {db,redis,transaction} from '../../packages/data/src/db';
import {actorById} from '../../packages/data/src/auth';
import {joinRoom} from '../../packages/data/src/community';
import {tournamentAction,divisionAction,scheduleCompetitions,competitionResult} from '../../packages/data/src/competitions';
import {getDivisionStandings} from '../../packages/game-core/src/darts-divisions-model';
assert.equal(process.env.APP_ENV,'development');
const ownerRow=(await db().query("select user_id from user_roles where role='owner' and revoked_at is null limit 1")).rows[0];assert.ok(ownerRow,'Run service fixtures first');const owner=await actorById(ownerRow.user_id,Date.now()+3600000);
const users=(await db().query("select p.id,p.username from profiles p where p.username like 'qa%' and not exists(select 1 from user_roles r where r.user_id=p.id and revoked_at is null) order by created_at desc limit 4")).rows;const actors=await Promise.all(users.map(p=>actorById(p.id,Date.now()+3600000)));
try{
 const prefix='QA '+randomUUID().slice(0,8);let event=await tournamentAction(owner,{action:'createTournament',args:[{name:prefix,published:true,settings:{maxPlayers:4,boardCount:2,bestOf:1,finalBestOf:1,restSeconds:0,requireCheckIn:false,ranked:true}}]});
 await assert.rejects(tournamentAction(owner,{action:'updateTournament',args:[event.id,{settings:{maxPlayers:64}}]}),{code:'capacity_exceeds_room'});
 event=await tournamentAction(owner,{action:'setTournamentStatus',args:[event.id,'registration']});
 for(const actor of actors)event=await tournamentAction(actor,{action:'addTournamentParticipant',args:[event.id,{name:actor.username,rulesAccepted:true}]});
 // Closed registration is an authoritative rejection, independent of displayed buttons.
 event=await tournamentAction(owner,{action:'updateTournament',args:[event.id,{settings:{registrationCloses:new Date(Date.now()-1000).toISOString()}}]});
 event=await tournamentAction(owner,{action:'generateTournamentBracket',args:[event.id]});event=await tournamentAction(owner,{action:'startTournament',args:[event.id]});
 const room=(await db().query('select room_id from tournaments where id=$1',[event.id])).rows[0].room_id;for(const actor of actors)await joinRoom(actor,{roomId:room});
 await Promise.all([scheduleCompetitions(),scheduleCompetitions()]);
 const links=(await db().query('select n.node_id,n.match_id,m.state,m.lifecycle from tournament_nodes n join matches m on m.id=n.match_id where tournament_id=$1',[event.id])).rows;assert.equal(links.length,2);
 assert.equal(Number((await db().query('select count(*) n from active_player_reservations where user_id=any($1::uuid[])',[actors.map(a=>a.id)])).rows[0].n),4);
 assert.equal(Number((await db().query('select count(*) n from board_reservations b join boards x on x.id=b.board_id where x.tournament_id=$1',[event.id])).rows[0].n),2);
 await assert.rejects(tournamentAction(owner,{action:'recordTournamentResult',args:[event.id,links[0].node_id,{score:[1,0],reason:'Attempted replacement of active match'}]}),{code:'active_match_cannot_be_replaced'});
 // Withdrawal cancels the operational reservation and records administrative W/O without Elo.
 const state=(await db().query('select model from tournaments where id=$1',[event.id])).rows[0].model,node=state.matches.find((m:any)=>m.id===links[0].node_id),withdraw=actors.find(a=>a.id===node.players[0])!;
 await tournamentAction(withdraw,{action:'updateTournamentParticipant',args:[event.id,withdraw.id,{status:'withdrawn'}]});assert.equal((await db().query('select lifecycle from matches where id=$1',[links[0].match_id])).rows[0].lifecycle,'cancelled');assert.equal((await db().query('select 1 from rating_ledger where match_id=$1',[links[0].match_id])).rowCount,0);
 // End this QA event explicitly; no fabricated played scores.
 await tournamentAction(owner,{action:'setTournamentStatus',args:[event.id,'cancelled']});
 assert.equal((await db().query('select 1 from active_player_reservations where match_id=any($1::uuid[])',[links.map(l=>l.match_id)])).rowCount,0);
 assert.equal((await db().query('select 1 from board_reservations where match_id=any($1::uuid[])',[links.map(l=>l.match_id)])).rowCount,0);
 let season=await divisionAction(owner,{action:'createDivisionSeason',args:[{name:prefix,bestOf:3,promoteCount:0,relegateCount:0}]});for(const actor of actors)season=await divisionAction(owner,{action:'addDivisionMember',args:[season.id,{name:actor.username,divisionId:season.divisions[0].id}]});
 season=await divisionAction(owner,{action:'generateDivisionSchedule',args:[season.id]});assert.equal(season.fixtures.length,6);assert.equal(new Set(season.fixtures.map((f:any)=>[...f.players].sort().join(':'))).size,6);
 await assert.rejects(divisionAction(actors[0],{action:'recordDivisionResult',args:[season.id,season.fixtures[0].id,{score:[2,0],reason:'Attempted client result'}]}),{code:'forbidden'});
 season=await divisionAction(owner,{action:'startDivisionSeason',args:[season.id]});
 // These are explicitly audited administrative decisions, never performance statistics.
 for(const fixture of season.fixtures)season=await divisionAction(owner,{action:'recordDivisionResult',args:[season.id,fixture.id,{score:[2,0],reason:'Explicit QA administrative decision'}]});
 const standings=getDivisionStandings(season,season.divisions[0].id);assert.equal(standings.reduce((n,p)=>n+p.points,0),18);assert.equal(standings.reduce((n,p)=>n+p.played,0),12);
 await divisionAction(owner,{action:'completeDivisionSeason',args:[season.id,'Explicit QA season completion']});
 await writeFile('artifacts/competition-result.json',JSON.stringify({ok:true,realRegistrations:true,capacity64Rejected:true,concurrentPlannerNoDuplicate:true,globalPlayerReservations:true,boardReservations:true,activeResultReplacementRejected:true,withdrawalCancelsMatch:true,administrativeNoElo:true,roundRobinPairsOnce:true,divisionThreePoints:true},null,2));console.log('Real tournament entries, concurrent planner, reservations, withdrawal and divisions passed');
}finally{await db().end();await(await redis()).quit();}
