import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const catalog = await import("../lib/darts-public-data.ts");
const { getTournamentState } = await import("../lib/darts-tournament-store.ts");
const { getDivisionSeasonState } = await import("../lib/darts-divisions-store.ts");
const { getDivisionStandings } = await import("../lib/darts-divisions-model.ts");
const published = getTournamentState().tournaments.filter(t => t.published && t.status !== "draft");
assert.deepEqual(catalog.PUBLIC_EVENTS.map(t => t.id).sort(), published.map(t => t.id).sort());
for (const item of catalog.PUBLIC_EVENTS) {
  const source = published.find(t => t.id === item.id);
  assert.equal(item.status, source.status);
  assert.equal(item.participantCount, source.participants.filter(p => ["confirmed", "checkedin"].includes(p.status)).length);
  assert.equal(item.maxPlayers, source.settings.maxPlayers);
  assert.equal(item.startsAt, source.settings.startsAt || null, "No invented dates");
  assert.equal("participants" in item, false, "No private participant records in public projection");
}
const season = getDivisionSeasonState().seasons.find(s => s.id === catalog.PUBLIC_SEASON.id);
for (const item of catalog.PUBLIC_DIVISIONS) {
  assert.deepEqual(item.standings, getDivisionStandings(season, item.id).map(({ rank, name, played, won, legDifference, points }) => ({ rank, name, played, wins: won, legDifference, points })));
}
assert.equal(catalog.PUBLIC_LADDER.every((entry, i, list) => !i || list[i - 1].rating >= entry.rating), true);
assert.equal(catalog.PUBLIC_ROOMS.every(room => room.count <= room.capacity && room.capacity === 50), true);
console.log("Public catalog checked: published events only, correct capacities, unchanged seed standings, no invented dates.");
