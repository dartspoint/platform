import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { calculateElo, expectedRatingChange, ratingStatus } from "../lib/darts-elo.ts";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
assert.deepEqual(calculateElo(1500, 1500, 0), { a: 1516, b: 1484, deltaA: 16, deltaB: -16, expectedA: .5 });
const upset = calculateElo(1400, 1600, 0);
assert.ok(upset.deltaA > 24 && upset.deltaA < 25);
close(upset.a + upset.b, 3000);
const favorite = calculateElo(1400, 1600, 1);
assert.ok(favorite.deltaB > 7 && favorite.deltaB < 8);
for (const a of [800, 1400, 1500, 1732.42, 2200]) for (const b of [850, 1500, 1766.3, 2300]) {
  const expectation = expectedRatingChange(a, b);
  for (const winner of [0, 1]) {
    const result = calculateElo(a, b, winner);
    close(result.a + result.b, a + b);
    close(result.deltaA, winner === 0 ? expectation.win : expectation.loss);
    assert.equal(result.deltaA, -result.deltaB);
    assert.ok(Math.abs(result.deltaA) < 32);
  }
}
assert.throws(() => calculateElo(NaN, 1500, 0));
assert.throws(() => calculateElo(1500, 1500, 2));
const opponents = ["a", "b", "c", "d", "e"];
for (const [rating, expected] of [[1400, "red"], [1449.49, "red"], [1449.5, "amber"], [1450, "amber"], [1500, "amber"], [1549.49, "amber"], [1549.5, "green"], [1550, "green"]]) assert.equal(ratingStatus({ rating, rankedPlayed: 10, opponents }), expected);
assert.equal(ratingStatus({ rating: 1700, rankedPlayed: 9, opponents }), "white");
assert.equal(ratingStatus({ rating: 1700, rankedPlayed: 10, opponents: ["a", "b", "c", "d", "d"] }), "white");

// Node's strip-types loader needs extensions for the app's bundler imports.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.includes("darts-ratings.ts") && specifier.startsWith("./")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const values = new Map();
globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, addEventListener() {} };
const store = await import("../lib/darts-ratings.ts");
assert.equal(store.getRatingProfile("FreshDart").provisional, true);
assert.equal(store.getRatingProfile("Nick").provisional, false);
for (const mode of ["bot", "practice", "casual"]) {
  assert.equal(store.completeRatedMatch({ id: mode, a: "FreshDart", b: "NewPlayer", winner: 0, mode }).counted, false);
  assert.equal(store.getRatingProfile("FreshDart").rating, 1500);
  assert.equal(store.getRatingProfile("FreshDart").rankedPlayed, 0);
}
const first = store.completeRatedMatch({ id: "match-1", a: "FreshDart", b: "NewPlayer", winner: 0, mode: "ranked-demo" });
assert.equal(first.counted, true);
assert.equal(first.afterA, 1516);
assert.equal(first.afterB, 1484);
assert.deepEqual(store.completeRatedMatch({ id: "match-1", a: "FreshDart", b: "NewPlayer", winner: 0, mode: "ranked-demo" }), first);
assert.throws(() => store.completeRatedMatch({ id: "match-1", a: "FreshDart", b: "NewPlayer", winner: 1, mode: "ranked-demo" }));
assert.equal(store.getRatingProfile("FreshDart").rankedPlayed, 1);
assert.equal(store.getRatingProfile("FreshDart").rating, 1516);
// A newly loaded module must restore both rating and processed-match ledger.
const reloaded = await import("../lib/darts-ratings.ts?reload=1");
assert.equal(reloaded.getRatingProfile("FreshDart").rating, 1516);
assert.deepEqual(reloaded.completeRatedMatch({ id: "match-1", a: "FreshDart", b: "NewPlayer", winner: 0, mode: "ranked-demo" }), first);
assert.equal(reloaded.getRatingProfile("FreshDart").rankedPlayed, 1);
for (let i = 2; i <= 10; i++) reloaded.completeRatedMatch({ id: `match-${i}`, a: "FreshDart", b: `Opponent-${i % 5}`, winner: i % 2, mode: "ranked-demo" });
assert.equal(reloaded.getRatingProfile("FreshDart").rankedPlayed, 10);
assert.equal(reloaded.getRatingProfile("FreshDart").provisional, false);
assert.ok(reloaded.getRatingProfile("FreshDart").opponents.length >= 5);
console.log("Elo checks passed: zero-sum calculations, upsets, decimal retention, rating bands, placement gates, excluded modes, duplicate-result prevention and durable restore.");
