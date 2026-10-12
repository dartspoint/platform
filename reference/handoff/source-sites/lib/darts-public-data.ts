import { players, rooms, playerByName } from "./darts-data";
import { applyDivisionResult, buildDivisionSchedule, getDivisionStandings, type DivisionSeason } from "./darts-divisions-model";

/**
 * Explicit public demo snapshot. This module never reads account/localStorage data,
 * drafts, moderation records or private messages. Replace this projection with a
 * server endpoint containing only published records when production is connected.
 */
export const PUBLIC_EVENTS = [
  { id: "cup-afterhours-open", name: "Afterhours Open", description: "De avondcup voor acht spelers. Schrijf je in, check in en speel mee.", status: "registration", startsAt: null, maxPlayers: 8, participantCount: 5, format: "knockout", bestOf: 3 },
  { id: "cup-sunday-masters", name: "Sunday Masters", description: "Zestien spelers, één bracket. Volg de weg naar de finale.", status: "live", startsAt: null, maxPlayers: 16, participantCount: 16, format: "knockout", bestOf: 5 },
  { id: "cup-dartspoint-double-chance", name: "Double Chance", description: "Een tweede kans via de verliezersroute. Met twee borden en een mogelijke finalereset.", status: "live", startsAt: null, maxPlayers: 8, participantCount: 8, format: "double-elimination", bestOf: 3 },
] as const;

export const PUBLIC_LADDER = players.filter(player => player.played >= 10)
  .map(({ name, rating, played, role }) => ({ name, rating, played, role }))
  .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));

const stamp = Date.parse("2026-10-05T12:00:00Z");
const seasonId = "season-afterhours-01";
const divisions = [
  { id: `${seasonId}-div-1`, name: "Premier Division", level: 1, color: "gold" as const },
  { id: `${seasonId}-div-2`, name: "Division One", level: 2, color: "silver" as const },
  { id: `${seasonId}-div-3`, name: "Division Two", level: 3, color: "bronze" as const },
];
const groups = [["DartMaster", "TripleKim", "Nick", "Mila"], ["Joey180", "DoubleOut", "Bullseye", "Sophie"], ["NightOwl", "Rookie", "FreshDart", "RedArrow"]];
let season: DivisionSeason = {
  id: seasonId, name: "Afterhours · Seizoen 01", description: "Drie divisies. Wekelijks één tegenstander.", status: "draft", startsOn: "2026-10-05", bestOf: 5,
  promoteCount: 1, relegateCount: 1, divisions,
  members: groups.flatMap((names, index) => names.map(name => ({ id: `division-player-${name.toLowerCase()}`, name, divisionId: divisions[index].id, rating: playerByName(name).rating }))),
  fixtures: [], previousSeasonId: null, createdAt: stamp, updatedAt: stamp, completedAt: null, completionReason: "",
};
season = { ...buildDivisionSchedule(season), status: "live" };
for (const [index, fixture] of season.fixtures.filter(item => item.matchday === 1).entries()) {
  season = applyDivisionResult(season, fixture.id, { score: index % 2 ? [1, 3] : [3, 2] }, stamp + index * 60_000);
}
export const PUBLIC_SEASON = { id: season.id, name: season.name, startsOn: season.startsOn, bestOf: season.bestOf };
export const PUBLIC_DIVISIONS = divisions.map(division => ({
  ...division,
  standings: getDivisionStandings(season, division.id).map(({ rank, name, played, won, legDifference, points }) => ({ rank, name, played, wins: won, legDifference, points })),
}));
export const PUBLIC_ROOMS = rooms.filter(room => room.category !== "Toernooi").map(({ name, subtitle, category, count }) => ({ name, subtitle, category, count, capacity: 50 }));
