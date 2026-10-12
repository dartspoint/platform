import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, next) { if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context); return next(specifier, context); } });
const { normalizeGameRules, initialGameState, dartsGameReducer } = await import("../lib/darts-game-state.ts");
const { initialFairPlayState, advanceFairPlayState } = await import("../lib/darts-fair-play-state.ts");
const { scoreDart } = await import("../lib/darts-rules.ts");
const t20 = scoreDart(0, -103 / 170), d20 = scoreDart(0, -166 / 170), s20 = scoreDart(0, -.4), bull = scoreDart(0, 0), miss = scoreDart(0, -1.1);
let id = 0;
function land(state, hit) {
  const locked = state.phase === "horizontal" ? dartsGameReducer(state, { type: "lock-x" }) : state;
  const dartId = ++id;
  const flight = dartsGameReducer(locked, { type: "launch", dart: { id: dartId, hit, opponentName: "Bullseye" } });
  for (const key of ["scores", "legs", "sets", "totalLegs", "opened", "pointsScored"]) assert.deepEqual(flight[key], state[key], `${key} cannot change in flight`);
  const result = dartsGameReducer(flight, { type: "land", id: dartId });
  assert.equal(dartsGameReducer(result, { type: "land", id: dartId }), result, "Landing receipt is idempotent");
  return result;
}
for (const startScore of [301,501,701]) for (const format of ["legs","sets"]) for (const bestOf of [1,3,21]) for (const bestOfSets of [1,3,7]) {
  const rules = normalizeGameRules({ startScore, format, bestOf, bestOfSets });
  assert.equal(rules.doubleIn, startScore === 301);
  assert.deepEqual(initialGameState(0, "config", 0, rules).scores, [startScore,startScore]);
}
for (const invalid of [{startScore:401},{bestOf:0},{bestOf:2},{bestOf:23},{bestOfSets:2},{bestOfSets:9},{format:"roundrobin"},{doubleIn:null},{doubleIn:"yes"},{doubleOut:1},null,[]]) assert.throws(() => normalizeGameRules(invalid), /Ongeldige/);

let game = initialGameState(0, "double-in", 0, {startScore:301});
game = land(game, s20); game = land(game, t20); game = land(game, miss);
assert.deepEqual(game.scores,[301,301]); assert.deepEqual(game.pointsScored,[0,0]);
assert.equal(game.dartCount[0],3); assert.equal(game.turn,1); assert.equal(game.visitScores[0],0);
assert.deepEqual(game.events.map(event=>event.credited),[0,0,0]);
assert.ok(game.events.every(event=>event.ignoredOnEntry));
assert.equal(game.events[1].hit.label,"T20","Physical score chip keeps actual hit");
game = land(game, bull); assert.equal(game.scores[1],251); assert.deepEqual(game.opened,[false,true]);
game = land(game, s20); assert.equal(game.scores[1],231); assert.equal(game.pointsScored[1],70);
game = land(game, miss); game = land(game,d20);
assert.equal(game.scores[0],261); assert.equal(game.pointsScored[0],40); assert.deepEqual(game.opened,[true,true]);

let bust = {...initialGameState(0,"open-bust",0,{startScore:301}),scores:[61,301],visitStart:61};
bust=land(bust,d20); assert.equal(bust.opened[0],true); bust=land(bust,s20);
assert.equal(bust.scores[0],61);assert.equal(bust.opened[0],false);assert.equal(bust.pointsScored[0],0);assert.equal(bust.visitScores[0],0);
assert.equal(bust.turn,1,"A bust consumes the rest of the visit");
let openedBust={...initialGameState(0,"already-open",0,{startScore:301}),scores:[41,301],visitStart:41,opened:[true,false],visitOpened:true};
openedBust=land(openedBust,d20);assert.equal(openedBust.opened[0],true,"Earlier opening survives later-visit bust");

let sets=initialGameState(0,"sets",0,{startScore:301,format:"sets",bestOf:3,bestOfSets:3});
function winLeg(state,player){return land({...state,turn:player,phase:player===0?"horizontal":"opponent",scores:player===0?[40,301]:[301,40],visitStart:40,opened:[true,true],visitOpened:true},d20);}
sets=winLeg(sets,0);assert.deepEqual(sets.legs,[1,0]);assert.equal(sets.winner,null);assert.deepEqual(sets.opened,[false,false]);assert.equal(sets.turn,1);
sets=winLeg(sets,0);assert.deepEqual(sets.sets,[1,0]);assert.deepEqual(sets.legs,[0,0]);assert.equal(sets.phase,"opponent");assert.equal(sets.winner,null,"Winning one set is not winning the match");
sets=winLeg(sets,1);assert.equal(sets.turn,0,"Second leg alternates within the set");
sets=winLeg(sets,1);assert.deepEqual(sets.sets,[1,1]);assert.equal(sets.turn,0,"Set starters alternate independently of prior set length");
sets=winLeg(sets,0);sets=winLeg(sets,0);
assert.deepEqual(sets.sets,[2,1]);assert.deepEqual(sets.totalLegs,[4,2]);assert.deepEqual(sets.legs,[2,0]);assert.equal(sets.winner,0);assert.equal(sets.phase,"won");
assert.deepEqual(sets.events.map(event=>event.leg),[1,2,3,4,5,6],"Leg IDs remain unique across sets");
assert.deepEqual(sets.dartCount,[4,2]);assert.deepEqual(sets.pointsScored,[160,80]);
let oneSet=initialGameState(0,"one-set",0,{format:"sets",bestOf:1,bestOfSets:1});oneSet=winLeg(oneSet,0);assert.equal(oneSet.winner,0);
let singleOut={...initialGameState(0,"singleout",0,{startScore:701,doubleOut:false,bestOf:1}),scores:[20,701],visitStart:20};singleOut=land(singleOut,s20);assert.equal(singleOut.winner,0);

// Old saves retain straight-in 301 and restore missing counters, including undo snapshots.
const old={...initialGameState(),rules:{startScore:301,doubleOut:true,bestOf:3},scores:[301,301],visitStart:301,legs:[1,0]};
for(const key of ["sets","totalLegs","opened","visitOpened"]) delete old[key];
old.history=[{...old,history:undefined}];
const restored=dartsGameReducer(initialGameState(),{type:"restore",state:JSON.parse(JSON.stringify(old))});
assert.equal(restored.rules.doubleIn,false);assert.deepEqual(restored.totalLegs,[1,0]);assert.deepEqual(restored.opened,[true,true]);assert.equal(restored.history[0].rules.doubleIn,false);
assert.equal(land(restored,s20).scores[0],281);

// Distinct client flight pipeline versus server coordinate pipeline for all formats.
let comparisons=0;
for(const startScore of [301,501,701])for(const format of ["legs","sets"])for(const starter of [0,1]) {
  const rules={startScore,format,bestOf:3,bestOfSets:3};
  let client=initialGameState(starter,"matrix",0,rules),server=initialFairPlayState(starter,rules);
  const shots=[t20,s20,d20,bull,t20,t20,t20,s20,miss,d20];
  for(let i=0;i<360&&server.status!=="finished";i++){
    const shot=shots[i%shots.length];client=land(client,shot);server=advanceFairPlayState(server,shot).state;
    for(const key of ["rules","scores","legs","sets","totalLegs","opened","turn","dartsLeft","visitStart","visitOpened","winner"])assert.deepEqual(client[key],server[key],`${startScore} ${format} ${key} dart ${i}`);
    assert.equal(client.events.at(-1).credited,server.lastEvent.credited);assert.equal(client.events.at(-1).ignoredOnEntry,server.lastEvent.ignoredOnEntry);
    comparisons++;
  }
}
console.log(`Match formats passed: 301 double-in/out, 501/701, ${comparisons} client/server comparisons, sets/leg starters, opening rollback, zero-point entry darts, record IDs and legacy restoration.`);
