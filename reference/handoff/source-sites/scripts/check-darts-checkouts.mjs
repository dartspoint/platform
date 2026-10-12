import assert from "node:assert/strict";
import { getCheckoutRoutes } from "../lib/darts-checkouts.ts";

function parseTarget(label) {
  if (label === "BULL") return { score: 50, double: true };
  if (label === "25") return { score: 25, double: false };
  const match = /^(T|D)?([1-9]|1[0-9]|20)$/.exec(label);
  assert.ok(match, `Invalid target: ${label}`);
  return { score: Number(match[2]) * (match[1] === "T" ? 3 : match[1] === "D" ? 2 : 1), double: match[1] === "D" };
}

// Independent reachability sets: every positive board score before a final
// double. These do not depend on the route generator's targets or ranking.
const scoringValues = new Set([25, 50]);
for (let number = 1; number <= 20; number++) {
  scoringValues.add(number);
  scoringValues.add(number * 2);
  scoringValues.add(number * 3);
}
const reachable = [new Set(), new Set([50])];
for (let number = 1; number <= 20; number++) reachable[1].add(number * 2);
for (let darts = 2; darts <= 3; darts++) {
  reachable[darts] = new Set(reachable[darts - 1]);
  for (const previous of reachable[darts - 1]) {
    for (const value of scoringValues) reachable[darts].add(previous + value);
  }
}

let verifiedRoutes = 0;
for (let darts = 1; darts <= 3; darts++) {
  for (let score = 2; score <= 170; score++) {
    const routes = getCheckoutRoutes(score, darts);
    assert.equal(routes.length > 0, reachable[darts].has(score), `Finish existence for ${score} / ${darts} darts`);
    assert.ok(routes.length <= 4);
    const seen = new Set();
    for (const route of routes) {
      assert.ok(route.length > 0 && route.length <= darts, `Wrong dart count for ${score}`);
      let remaining = score;
      route.forEach((label, index) => {
        const hit = parseTarget(label);
        remaining -= hit.score;
        if (index === route.length - 1) {
          assert.equal(remaining, 0, `${score}: ${route.join(" ")} does not finish exactly`);
          assert.ok(hit.double, `${score}: ${route.join(" ")} does not finish on a double`);
        } else {
          assert.ok(remaining >= 2, `${score}: ${route.join(" ")} busts before its finish`);
        }
      });
      const setupKey = route.slice(0, -1).map((label) => parseTarget(label).score).sort((a, b) => b - a).join(",");
      const key = `${setupKey}/${route.at(-1)}`;
      assert.ok(!seen.has(key), `Duplicate setup permutations for ${score}`);
      seen.add(key);
      verifiedRoutes++;
    }
  }
}

assert.deepEqual(getCheckoutRoutes(170, 3), [["T20", "T20", "BULL"]]);
assert.deepEqual(getCheckoutRoutes(167, 3), [["T20", "T19", "BULL"]]);
assert.deepEqual(getCheckoutRoutes(110, 2), [["T20", "BULL"]]);
assert.deepEqual(getCheckoutRoutes(50, 3), [["BULL"]]);
assert.deepEqual(getCheckoutRoutes(40, 3), [["D20"]]);
assert.deepEqual(getCheckoutRoutes(32, 2), [["D16"]]);
assert.deepEqual(getCheckoutRoutes(2, 3), [["D1"]]);
assert.deepEqual(getCheckoutRoutes(110, 3)[0], ["T20", "BULL"]);
assert.ok(getCheckoutRoutes(110, 3).some((route) => route.join(" ") === "T20 10 D20"));
assert.ok(getCheckoutRoutes(25, 1).length === 0, "Outer bull cannot finish a leg");
assert.ok(getCheckoutRoutes(25, 2).length > 0, "25 can be finished with a setup and double");
for (const bogey of [159, 162, 163, 165, 166, 168, 169]) assert.deepEqual(getCheckoutRoutes(bogey, 3), []);
for (const score of [-1, 0, 1, 171, 501, 40.5, NaN, Infinity]) assert.deepEqual(getCheckoutRoutes(score, 3), []);
for (const darts of [-1, 0, 4, 1.5, NaN, Infinity]) assert.deepEqual(getCheckoutRoutes(40, darts), []);
for (const limit of [-1, 0, 1.5, NaN, Infinity]) assert.deepEqual(getCheckoutRoutes(40, 3, limit), []);
assert.equal(getCheckoutRoutes(121, 3, 1).length, 1);

// A landed T20 from a 170 finish leaves 110 with two darts; a miss consumes a
// dart without reducing 170, so that route must disappear immediately.
assert.deepEqual(getCheckoutRoutes(170 - 60, 3 - 1), [["T20", "BULL"]]);
assert.deepEqual(getCheckoutRoutes(170, 3 - 1), []);
assert.deepEqual(getCheckoutRoutes(50, 1), [["BULL"]]);
assert.deepEqual(getCheckoutRoutes(0, 0), []);

console.log(`Checkout checks passed: all 507 score/dart combinations, ${verifiedRoutes} valid routes, finish boundaries, bogeys and per-dart recalculation.`);
