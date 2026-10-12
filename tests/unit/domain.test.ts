import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreDart,BOARD_GEOMETRY} from '../../packages/game-core/src/darts-rules';
import {initialGameState,dartsGameReducer} from '../../packages/game-core/src/darts-game-state';
import {calculateElo} from '../../packages/game-core/src/darts-elo';
import {practiceWeek,practiceChallenge} from '../../packages/game-core/src/darts-practice';
import {commandSchema,usernameSchema,safeDestination} from '../../packages/contracts/src/index';
import {renderDartsEmail,renderSupabaseOtpTemplate} from '../../packages/emails/src/templates';
import {randomUUID} from 'node:crypto';
test('Physical ring boundaries and double bull use the original 440 geometry',()=>{
 assert.equal(BOARD_GEOMETRY.size,440);assert.deepEqual([scoreDart(0,-1).label,scoreDart(0,-162/170).label,scoreDart(0,-161.9/170).label,scoreDart(0,-103/170).label,scoreDart(0,0).label,scoreDart(1.001,0).label],['D20','D20','20','T20','BULL','MIS']);
});
test('Double-in ignores non-doubles and launches do not alter settled statistics',()=>{
 let s=initialGameState(0,randomUUID(),0,{startScore:301,doubleIn:true,doubleOut:true,bestOf:3,format:'legs',bestOfSets:1});
 const hit=(label:string)=>label==='D20'?scoreDart(0,-166/170):label==='T20'?scoreDart(0,-103/170):scoreDart(0,-.7);
 function dart(h:any){s=dartsGameReducer(s,{type:'lock-x'});s=dartsGameReducer(s,{type:'launch',dart:{id:s.events.length+1,hit:h,opponentName:'Peer'}});assert.equal(s.events.length,s.dartCount[0]+s.dartCount[1]);s=dartsGameReducer(s,{type:'land',id:s.pendingDart!.id});}
 dart(hit('T20'));assert.equal(s.scores[0],301);assert.equal(s.opened[0],false);dart(hit('D20'));assert.equal(s.scores[0],261);assert.equal(s.opened[0],true);
});
test('Elo preserves fractional unequal values and zero sum; equal 1500 gives ±16',()=>{
 const equal=calculateElo(1500,1500,0);assert.equal(equal.deltaA,16);assert.equal(equal.deltaB,-16);
 const unequal=calculateElo(1700.25,1449.8,1);assert.ok(Math.abs(unequal.deltaA+unequal.deltaB)<1e-10);assert.ok(!Number.isInteger(unequal.deltaA));
});
test('Amsterdam ISO week rolls at local Monday, including year and DST boundaries',()=>{
 assert.equal(practiceWeek(new Date('2026-10-11T21:59:59Z')).id,'2026-W41');assert.equal(practiceWeek(new Date('2026-10-11T22:00:00Z')).id,'2026-W42');assert.equal(practiceWeek(new Date('2027-01-01T12:00:00Z')).id,'2026-W53');assert.equal(new Set(practiceChallenge(new Date('2026-10-12')).targets).size,5);
});
test('Commands accept only stops and readiness, never client score, coordinates or winners',()=>{
 const base={protocolVersion:1,commandId:randomUUID(),matchId:randomUUID(),expectedStateVersion:1,type:'dart.stop_horizontal'};assert.ok(commandSchema.safeParse(base).success);
 for(const extra of [{x:0,y:0},{score:180},{winner:0},{clientTime:Date.now()}])assert.equal(commandSchema.safeParse({...base,...extra}).success,false);
});
test('Username and return destination reject role impersonation and external navigation',()=>{
 assert.equal(usernameSchema.parse(' Test_1 '),'Test_1');for(const name of ['owner','ADMIN','a','a b','école'])assert.equal(usernameSchema.safeParse(name).success,false);
 assert.equal(safeDestination('https://evil.test'),'/lobby');assert.equal(safeDestination('//evil.test'),'/lobby');assert.equal(safeDestination('/toernooi/'+randomUUID()).startsWith('/toernooi/'),true);
});
test('Email HTML escapes user text; auth template contains Token and no magic-link login',()=>{
 const otp=renderSupabaseOtpTemplate();assert.ok(otp.html.includes('{{ .Token }}'));assert.equal(otp.html.includes('.ConfirmationURL'),false);
 const welcome=renderDartsEmail({type:'welcome',username:'<img src=x onerror=alert(1)>'},{origin:'https://staging.dartspoint.nl'});assert.equal(welcome.html.includes('<img src=x'),false);assert.ok(welcome.text.includes('<img src=x'));assert.throws(()=>renderDartsEmail({type:'welcome',username:'Test'},{origin:'https://evil.test'}));
});
import {initialMatchScoring,advanceMatchScoring} from '../../packages/game-core/src/darts-match-rules';
import {buildTournamentBracket,applyTournamentResult,DEFAULT_TOURNAMENT_SETTINGS,type Tournament} from '../../packages/game-core/src/darts-tournament-model';
test('301 reopens on every leg and a best-of-three match ends after two leg wins',()=>{
 let s=initialMatchScoring(0,{startScore:301,doubleIn:true,doubleOut:true,bestOf:3,format:'legs',bestOfSets:1});
 s={...s,scores:[40,301],opened:[true,false],visitStart:40};s=advanceMatchScoring(s,scoreDart(0,-166/170)).state;
 assert.deepEqual(s.legs,[1,0]);assert.equal(s.winner,null);assert.deepEqual(s.opened,[false,false]);assert.deepEqual(s.scores,[301,301]);
 s={...s,turn:0,scores:[40,301],opened:[true,false],visitStart:40};s=advanceMatchScoring(s,scoreDart(0,-166/170)).state;assert.equal(s.winner,0);assert.deepEqual(s.legs,[2,0]);
});
test('Double elimination generates a reset when the losers finalist wins the grand final',()=>{
 const ids=Array.from({length:4},()=>randomUUID());let t:Tournament={id:randomUUID(),name:'Pure fixture',description:'',organizer:'DartsPoint',published:false,status:'checkin',settings:{...DEFAULT_TOURNAMENT_SETTINGS,format:'double-elimination',maxPlayers:4,requireCheckIn:false,bestOf:1,finalBestOf:1},participants:ids.map((id,i)=>({id,name:'Test'+i,role:'player',rating:1500,played:0,status:'confirmed',ready:true,rulesAccepted:true,approved:true,seed:i+1,joinedAt:0})),matches:[],championId:null,createdAt:0,updatedAt:0};
 t={...buildTournamentBracket(t),status:'live'};let reset=false;
 for(let i=0;i<30&&t.status!=='completed';i++){const m=t.matches.find(m=>m.status==='ready');assert.ok(m,'Bracket stalled');const winner=m.bracket==='grand-final'?1:0;if(m.bracket==='reset')reset=true;t=applyTournamentResult(t,m.id,{score:winner===0?[1,0]:[0,1],kind:'played'});}
 assert.equal(reset,true);assert.equal(t.status,'completed');assert.ok(t.championId);
});
import {postgresOptions} from '../../packages/data/src/postgres';
import pg from 'pg';
test('Remote TLS flags cannot replace node-postgres certificate verification',()=>{
 const previous=process.env.APP_ENV;process.env.APP_ENV='staging';
 try{
  const client=new pg.Client(postgresOptions('postgresql://test:test@database.example/postgres?sslmode=require'));
  assert.equal((client as any).connectionParameters.ssl.rejectUnauthorized,true);
  for(const query of ['sslmode=disable','sslmode=require&sslmode=disable','sslmode=require&ssl=no-verify','sslmode=require&sslrootcert=/tmp/other'])assert.throws(()=>postgresOptions('postgresql://test:test@database.example/postgres?'+query));
  assert.throws(()=>postgresOptions('postgresql://test:test@127.0.0.1/postgres'),'Hosted localhost is never a plaintext exception');
 }finally{if(previous===undefined)delete process.env.APP_ENV;else process.env.APP_ENV=previous;}
});
test('Local captured emails link to the development app without admitting hosted HTTP origins',()=>{
 const previous=process.env.APP_ENV;
 try{
  process.env.APP_ENV='development';const message=renderDartsEmail({type:'welcome',username:'LocalQA'},{origin:'http://127.0.0.1:4300',localDevelopment:true});assert.ok(message.html.includes('http://127.0.0.1:4300/lobby'));
  assert.throws(()=>renderDartsEmail({type:'welcome',username:'LocalQA'},{origin:'http://example.com',localDevelopment:true}));
  process.env.APP_ENV='staging';assert.throws(()=>renderDartsEmail({type:'welcome',username:'LocalQA'},{origin:'http://127.0.0.1:4300',localDevelopment:true}));
 }finally{if(previous===undefined)delete process.env.APP_ENV;else process.env.APP_ENV=previous;}
});
