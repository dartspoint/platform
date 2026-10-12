import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, next) { if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context); return next(specifier, context); } });
const { initialGameState, dartsGameReducer, DEFAULT_GAME_RULES } = await import("../lib/darts-game-state.ts");
const { scoreDart } = await import("../lib/darts-rules.ts");
let id = 0;
function land(state, hit) {
  if (state.phase === "horizontal") state = dartsGameReducer(state, { type: "lock-x" });
  const before = [...state.scores];
  state = dartsGameReducer(state, { type: "launch", dart: { id: ++id, hit, opponentName: "Bullseye" } });
  assert.deepEqual(state.scores, before, "Competition scoring must wait for dart impact");
  return dartsGameReducer(state, { type: "land", id, at: id * 1000 });
}
const single20 = scoreDart(0, -.4), double20 = scoreDart(0, -166 / 170);
for (const startScore of [301, 501, 701]) for (const doubleOut of [true, false]) for (const bestOf of [1, 3, 5, 21]) {
  let state = initialGameState(0, "competition-test", 10, { startScore, doubleOut, bestOf, doubleIn: false, format: "legs" });
  assert.deepEqual(state.scores, [startScore, startScore]);
  assert.equal(state.visitStart, startScore);
  const target = (bestOf + 1) / 2;
  for (let leg = 0; leg < target; leg++) {
    state = { ...state, turn: 0, phase: "horizontal", scores: [doubleOut ? 40 : 20, startScore], visitStart: doubleOut ? 40 : 20, freshVisit: true };
    state = land(state, doubleOut ? double20 : single20);
    assert.equal(state.legs[0], leg + 1);
    if (leg < target - 1) { assert.deepEqual(state.scores, [startScore, startScore]); assert.equal(state.winner, null); assert.equal(state.turn, (leg + 1) % 2); }
    else { assert.equal(state.phase, "won"); assert.equal(state.winner, 0); }
  }
}
let single = { ...initialGameState(0,"single",1,{startScore:301,doubleOut:false,bestOf:1,doubleIn:false,format:"legs"}), scores:[21,301],visitStart:21 };
single = land(single,single20); assert.equal(single.scores[0],1); assert.equal(single.bustReason,null,"1 remaining allowed in single-out");
let double = { ...initialGameState(0,"double",1,{startScore:701,doubleOut:true,bestOf:5}), scores:[21,701],visitStart:21 };
double = land(double,single20); assert.equal(double.scores[0],21); assert.equal(double.events[0].bust,true);
let over = { ...initialGameState(0,"over",1,{startScore:301,doubleOut:false,bestOf:1,doubleIn:false,format:"legs"}), scores:[19,301],visitStart:19 };
over = land(over,single20);assert.equal(over.scores[0],19);assert.equal(over.events[0].bust,true);
const legacy = initialGameState(); delete legacy.rules;
assert.deepEqual(dartsGameReducer(initialGameState(),{type:"restore",state:legacy}).rules,DEFAULT_GAME_RULES);
assert.throws(()=>initialGameState(0,"invalid",1,{bestOf:2}),/Ongeldige/);
assert.throws(()=>initialGameState(0,"invalid",1,{startScore:101}),/Ongeldige/);
console.log("Competition checks passed: 24 rule combinations, correct winning leg threshold/reset score, alternating starts, single-out vs double-out bust/finish, impact-only scoring and legacy save compatibility.");
