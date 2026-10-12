import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

registerHooks({ resolve(specifier, context, next) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) {
    try { return next(`${specifier}.ts`, context); } catch { /* try normal resolution */ }
  }
  return next(specifier, context);
} });
const { advanceFairPlayState, initialFairPlayState, validThrowCoordinates } = await import("../lib/darts-fair-play-state.ts");
const { scoreDart } = await import("../lib/darts-rules.ts");
const { initialGameState, dartsGameReducer } = await import("../lib/darts-game-state.ts");
const hit = (label) => {
  if (label === "BULL") return { x: 0, y: 0 };
  const numbers = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const n = Number(label.replace(/^[TD]/, "")), index = numbers.indexOf(n);
  const r = label[0] === "T" ? 103 / 170 : label[0] === "D" ? 166 / 170 : 0.45;
  return { x: Math.sin(index * Math.PI / 10) * r, y: -Math.cos(index * Math.PI / 10) * r };
};

// Real boundary case: an apparent T20 must never be accepted as a supplied 20.
const first = advanceFairPlayState(initialFairPlayState(0), { ...hit("T20"), score: 20 });
assert.equal(first.hit.score, 60);
assert.equal(first.state.scores[0], 441);
assert.equal(first.state.sequence, 1);
for (const pair of [[NaN, 0], [0, Infinity], [1.21, 0], [0, "0"]]) assert.equal(validThrowCoordinates(...pair), false);
assert.throws(() => advanceFairPlayState(initialFairPlayState(0), { x: NaN, y: 0 }));

let state = { ...initialFairPlayState(0), scores: [41, 501], visitStart: 41 };
state = advanceFairPlayState(state, hit("20")).state;
state = advanceFairPlayState(state, hit("20")).state;
assert.equal(state.scores[0], 41, "Leaving one restores the entire visit");
assert.equal(state.turn, 1);
assert.equal(state.dartsLeft, 3);

state = { ...initialFairPlayState(0), scores: [20, 501], visitStart: 20 };
assert.equal(advanceFairPlayState(state, hit("20")).state.lastEvent.bust, true, "Single cannot finish double-out");
state = advanceFairPlayState({ ...state, scores: [40, 501], visitStart: 40 }, hit("D20")).state;
assert.deepEqual(state.legs, [1, 0]);
assert.deepEqual(state.scores, [501, 501]);
assert.equal(state.turn, 1, "First starter alternates by leg");
state = advanceFairPlayState({ ...state, turn: 0, scores: [50, 501], visitStart: 50 }, hit("BULL")).state;
assert.equal(state.winner, 0);
assert.equal(state.status, "finished");
assert.throws(() => advanceFairPlayState(state, hit("20")), /afgelopen/);

// Client/UI scores must agree with the authoritative state, while launch alone
// never mutates displayed scores. Deterministic routes include misses and busts.
let compared = 0;
for (const starter of [0, 1]) {
  let server = initialFairPlayState(starter), client = initialGameState(starter);
  const shots = ["T20", "T20", "20", "T19", "D20", "BULL", "19", "T20", "D16", "1"];
  for (let i = 0; i < 240 && !server.winner && server.status !== "finished"; i++) {
    const coordinates = hit(shots[i % shots.length]);
    const result = advanceFairPlayState(server, coordinates);
    if (client.phase === "horizontal") client = dartsGameReducer(client, { type: "lock-x" });
    const before = client.scores;
    client = dartsGameReducer(client, { type: "launch", dart: { id: i + 1, hit: scoreDart(coordinates.x, coordinates.y), opponentName: "Bot" } });
    assert.deepEqual(client.scores, before, "Flight does not score early");
    client = dartsGameReducer(client, { type: "land", id: i + 1 });
    server = result.state;
    for (const key of ["scores", "legs", "turn", "dartsLeft", "visitStart", "winner"]) assert.deepEqual(client[key], server[key], `Server and board agree: ${key}, dart ${i + 1}`);
    compared++;
  }
}

// Apply the real migration and verify unique receipt protection at the DB layer.
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../drizzle/0000_futuristic_mephistopheles.sql", import.meta.url), "utf8"));
sqlite.prepare("INSERT INTO fair_play_games (id,token_hash,state,created_at,expires_at) VALUES (?,?,?,?,?)").run("g", "hash", "{}", 1, 2);
sqlite.prepare("INSERT INTO fair_play_darts (id,game_id,sequence,fingerprint,result,created_at) VALUES (?,?,?,?,?,?)").run("one", "g", 1, "fp", "{}", 1);
assert.throws(() => sqlite.prepare("INSERT INTO fair_play_darts (id,game_id,sequence,fingerprint,result,created_at) VALUES (?,?,?,?,?,?)").run("two", "g", 1, "different", "{}", 1), /UNIQUE/);
sqlite.close();
console.log(`Fair-play checks passed: ${compared} server/impact-state comparisons, busts, checkouts, invalid coordinates and unique persisted receipts.`);
