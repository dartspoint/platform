import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import {
  addDivisionDays, applyDivisionResult, buildDivisionSchedule, finishDivisionSeason, getDivisionFixtureAccess,
  getDivisionMovements, getDivisionStandings, getPlayerDivision, validateDivisionSeason, validateDivisionSettings, validDivisionDate,
} from "../lib/darts-divisions-model.ts";

function season(counts = [4], patch = {}) {
  const divisions = counts.map((_, i) => ({ id: `d${i + 1}`, name: `Divisie ${i + 1}`, level: i + 1, color: ["gold", "silver", "bronze"][i % 3] }));
  return { id: "test", name: "Testseizoen", description: "", status: "draft", startsOn: "2026-10-05", bestOf: 5, promoteCount: 1, relegateCount: 1,
    divisions, members: counts.flatMap((count, i) => Array.from({ length: count }, (_, n) => ({ id: `d${i + 1}-p${n + 1}`, name: `Speler ${i + 1}.${n + 1}`, divisionId: `d${i + 1}`, rating: 1500 + n * 50 }))),
    fixtures: [], previousSeasonId: null, createdAt: 0, updatedAt: 0, completedAt: null, completionReason: "", ...patch };
}
for (let count = 2; count <= 24; count++) {
  const scheduled = buildDivisionSchedule(season([count]));
  const matches = scheduled.fixtures.filter(f => f.players[1]);
  assert.equal(matches.length, count * (count - 1) / 2, `${count} players have every pair exactly once`);
  assert.equal(new Set(matches.map(f => [...f.players].sort().join("|"))).size, matches.length);
  const rounds = Math.max(...scheduled.fixtures.map(f => f.matchday));
  assert.equal(rounds, count % 2 ? count : count - 1);
  for (let day = 1; day <= rounds; day++) {
    const participants = scheduled.fixtures.filter(f => f.matchday === day).flatMap(f => f.players.filter(Boolean));
    assert.equal(new Set(participants).size, count, `Every player accounted for on day ${day}`);
    assert.equal(participants.length, count, "No double-booking within one matchday");
  }
  if (count % 2) for (const player of scheduled.members) assert.equal(scheduled.fixtures.filter(f => f.status === "bye" && f.players[0] === player.id).length, 1, "Every odd-roster player has exactly one rest week");
  assert.equal(scheduled.fixtures.find(f => f.matchday === 1).dueOn, "2026-10-11");
  assert.deepEqual(buildDivisionSchedule(season([count])).fixtures, scheduled.fixtures, "Scheduling is deterministic");
  validateDivisionSeason(scheduled);
}
assert.equal(validDivisionDate("2026-02-29"), false); assert.equal(validDivisionDate("2028-02-29"), true);
assert.equal(addDivisionDays("2026-10-25", 7), "2026-11-01", "Calendar dates survive the Amsterdam DST boundary");
assert.throws(() => validateDivisionSettings({ ...season(), bestOf: 4 }), /oneven/);
assert.throws(() => buildDivisionSchedule(season([1])), /minimaal/);
assert.throws(() => validateDivisionSeason(season([25])), /24 spelers/);

let live = { ...buildDivisionSchedule(season([4, 4, 4])), status: "live" };
const first = live.fixtures[0];
for (const score of [[0, 0], [3, 3], [2, 1], [4, 0], [-1, 3], [3, 0.5], [NaN, 3]]) assert.throws(() => applyDivisionResult(live, first.id, { score }));
assert.throws(() => applyDivisionResult({ ...live, status: "draft" }, first.id, { score: [3, 0] }), /Start/);
assert.throws(() => finishDivisionSeason(live), /open wedstrijden/);
assert.equal(finishDivisionSeason(live, "Seizoen ingekort vanwege onderhoud").status, "completed");
assert.equal(getDivisionFixtureAccess(live, first.id, "Buitenstaander").canPlay, false);
const firstName = live.members.find(m => m.id === first.players[0]).name;
assert.equal(getDivisionFixtureAccess(live, first.id, firstName).canPlay, true);
assert.equal(getDivisionFixtureAccess(live, first.id, "Buitenstaander").canSpectate, true);
assert.equal(getDivisionFixtureAccess(live, live.fixtures.find(f => f.matchday === 2).id, live.members.find(m => m.id === live.fixtures.find(f => f.matchday === 2).players[0]).name).canPlay, false, "Both players finish their previous matchday first");
assert.equal(getPlayerDivision([live], firstName).division.id, "d1");
assert.equal(getPlayerDivision([{ ...live, status: "completed" }], firstName), null);

for (const fixture of live.fixtures) {
  const winner = fixture.players[0].localeCompare(fixture.players[1]) < 0 ? 0 : 1;
  live = applyDivisionResult(live, fixture.id, { score: winner === 0 ? [3, 0] : [0, 3] });
}
const table = getDivisionStandings(live, "d1");
assert.deepEqual(table.map(r => [r.memberId, r.points, r.played]), [["d1-p1", 9, 3], ["d1-p2", 6, 3], ["d1-p3", 3, 3], ["d1-p4", 0, 3]]);
assert.equal(table[0].rating, 1500, "Higher Elo does not decide the division ladder");
assert.equal(table[0].legsFor, 9); assert.equal(table[0].legDifference, 9);
assert.equal(table.reduce((sum, r) => sum + r.legsFor, 0), table.reduce((sum, r) => sum + r.legsAgainst, 0));
assert.equal(table.reduce((sum, r) => sum + r.points, 0), 18, "Six matches award three points each");
assert.throws(() => applyDivisionResult(live, first.id, { score: [0, 3] }), /reden/);
const corrected = applyDivisionResult(live, first.id, { score: [0, 3], reason: "Legs omgedraaid na controle" });
assert.equal(corrected.fixtures.filter(f => f.status === "completed").length, 18, "Correction changes one result without adding an extra fixture");
assert.equal(getDivisionStandings(corrected, "d1").reduce((sum, r) => sum + r.points, 0), 18);
const ended = finishDivisionSeason(live); assert.equal(ended.status, "completed");
assert.equal(applyDivisionResult(ended, first.id, { score: [0, 3], reason: "Controle na het afsluiten" }).status, "live", "A correction reopens the final standings");
const movements = getDivisionMovements(ended);
assert.equal(movements.movements.length, 4);
assert.equal(new Set(movements.movements.map(m => m.memberId)).size, 4);
assert.equal(movements.members.find(m => m.id === "d1-p1").divisionId, "d1", "Top division champion never promotes out of the ladder");
assert.equal(movements.members.find(m => m.id === "d3-p4").divisionId, "d3", "Bottom division last place never relegates out of the ladder");
assert.equal(movements.members.find(m => m.id === "d2-p1").divisionId, "d1");
assert.equal(movements.members.find(m => m.id === "d2-p4").divisionId, "d3");
for (const division of ended.divisions) assert.equal(movements.members.filter(m => m.divisionId === division.id).length, 4, "Divisions keep their size");
const tiedMoves = getDivisionMovements({ ...buildDivisionSchedule(season([4, 4, 4])), status: "completed" });
assert.equal(tiedMoves.movements.length, 0, "Unresolved ties never promote someone alphabetically"); assert.equal(tiedMoves.warnings.length, 2);
assert.equal(getDivisionMovements({ ...ended, promoteCount: 0 }).movements.length, 0);
assert.equal(getDivisionMovements({ ...ended, promoteCount: 4, relegateCount: 4 }).movements.length, 8, "Movement is capped at half a division to prevent up/down overlap");
const tiedTable = getDivisionStandings(season([3]), "d1"); assert.deepEqual(tiedTable.map(r => r.rank), [1, 1, 1]);

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/lib/darts-")) return nextResolve(new URL(`../lib/${specifier.slice(6)}.ts`, import.meta.url).href, context);
  if (context.parentURL?.includes("/lib/darts-") && specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const values = new Map(); globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, addEventListener() {} };
globalThis.localStorage = globalThis.window.localStorage;
const store = await import("../lib/darts-divisions-store.ts");
const active = store.getDivisionSeasonState().seasons.find(s => s.status === "live");
assert.equal(active.divisions.length, 3); assert.ok(getPlayerDivision([active], "Nick"));
let draft = store.createDivisionSeason({ name: "Storetest", startsOn: "2026-11-02", divisions: [{ name: "Open", color: "green" }], bestOf: 3 });
for (const name of ["Nick", "Mila", "Bullseye"]) draft = store.addDivisionMember(draft.id, { name, divisionId: draft.divisions[0].id });
assert.throws(() => store.addDivisionMember(draft.id, { name: "nick", divisionId: draft.divisions[0].id }), /één divisie/);
assert.throws(() => store.moveDivisionMember(draft.id, draft.members[0].id, "missing"), /divisie/);
draft = store.generateDivisionSchedule(draft.id);
assert.throws(() => store.startDivisionSeason(draft.id), /lopende seizoen/);
store.completeDivisionSeason(active.id, "Demoseizoen administratief afgerond");
draft = store.startDivisionSeason(draft.id);
assert.throws(() => store.updateDivisionSeason(draft.id, { bestOf: 7 }), /vergrendeld/);
assert.throws(() => store.addDivisionMember(draft.id, { name: "Nieuw", divisionId: draft.divisions[0].id }), /vergrendeld/);
assert.throws(() => store.createNextDivisionSeason(draft.id), /Sluit/);
for (const fixture of draft.fixtures.filter(f => f.status !== "bye")) {
  const a = draft.members.find(m => m.id === fixture.players[0]);
  assert.throws(() => store.submitDivisionPlayedResult(draft.id, fixture.id, "Ander", [2, 0]), /ingedeelde spelers/);
  store.submitDivisionPlayedResult(draft.id, fixture.id, a.name, [2, 0]);
  const count = store.getDivisionSeasonState().audit.length;
  store.submitDivisionPlayedResult(draft.id, fixture.id, a.name, [2, 0]);
  assert.equal(store.getDivisionSeasonState().audit.length, count, "Retrying the same completed fixture is idempotent");
  assert.throws(() => store.submitDivisionPlayedResult(draft.id, fixture.id, a.name, [0, 2]), /al gespeeld/);
}
store.completeDivisionSeason(draft.id);
const next = store.createNextDivisionSeason(draft.id, { name: "Tweede ronde" });
assert.equal(next.status, "draft"); assert.equal(next.previousSeasonId, draft.id); assert.equal(next.fixtures.length, 0); assert.equal(next.members.length, 3);
assert.throws(() => store.createNextDivisionSeason(draft.id), /bestaat al/);
assert.throws(() => store.recordDivisionResult(draft.id, draft.fixtures.find(f => f.status !== "bye").id, { score: [0, 2], reason: "Late correctie" }), /vergrendeld/);
const reloaded = await import("../lib/darts-divisions-store.ts?reload=1"); assert.equal(reloaded.getDivisionSeasonState().seasons.find(s => s.id === next.id).previousSeasonId, draft.id);
values.set("dartspoint-divisions-v1", JSON.stringify({ version: 1, seasons: [{ ...next, members: [{ id: "broken", name: "Bad" }] }], audit: [] }));
const corrupt = await import("../lib/darts-divisions-store.ts?corrupt=1"); assert.ok(corrupt.getDivisionSeasonState().seasons.find(s => s.id === "season-afterhours-01"), "Invalid saved state restores a consistent seed, never partial corrupted data");
console.log("Division checks passed: 2–24-player round robins, unique pairs/rest weeks/no double bookings, date boundaries, score validity, standings independent of Elo, safe corrections, membership/fixture gating, tied promotion boundaries, adjacent promotion/relegation, lifecycle locks, idempotent results and safe durable restore.");
