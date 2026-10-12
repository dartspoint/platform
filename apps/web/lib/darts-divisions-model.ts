export type DivisionSeasonStatus = "draft" | "live" | "completed";
export type DivisionColor = "gold" | "silver" | "bronze" | "green" | "blue";
export type Division = { id: string; name: string; level: number; color: DivisionColor };
export type DivisionMember = { id: string; name: string; divisionId: string; rating: number };
export type DivisionFixture = {
  id: string; divisionId: string; matchday: number; players: [string, string | null]; dueOn: string;
  status: "scheduled" | "completed" | "bye";
  result: { score: [number, number]; winnerId: string; reason: string; at: number } | null;
};
export type DivisionSeason = {
  id: string; name: string; description: string; status: DivisionSeasonStatus; startsOn: string; bestOf: number;
  divisions: Division[]; members: DivisionMember[]; fixtures: DivisionFixture[];
  promoteCount: number; relegateCount: number; previousSeasonId: string | null;
  createdAt: number; updatedAt: number; completedAt: number | null; completionReason: string;
};
export type DivisionStanding = {
  memberId: string; name: string; rating: number; played: number; won: number; lost: number;
  legsFor: number; legsAgainst: number; legDifference: number; points: number; rank: number;
};
export type DivisionSeasonInput = {
  name?: string; description?: string; startsOn?: string; bestOf?: number; promoteCount?: number; relegateCount?: number;
  divisions?: Array<{ name: string; color: DivisionColor }>;
};
export type DivisionResultInput = { score: [number, number]; reason?: string };
export type DivisionMovement = { memberId: string; name: string; fromDivisionId: string; toDivisionId: string; direction: "up" | "down" };
export const DIVISION_COLORS: DivisionColor[] = ["gold", "silver", "bronze", "green", "blue"];
function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function validDivisionDate(value: string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function addDivisionDays(value: string, days: number) {
  requireThat(validDivisionDate(value), "Vul een geldige startdatum in.");
  const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}
export function validateDivisionSettings(value: Pick<DivisionSeason, "name" | "startsOn" | "bestOf" | "promoteCount" | "relegateCount">) {
  requireThat(typeof value.name === "string" && value.name.trim().length > 0 && value.name.length <= 100, "Vul een seizoensnaam van maximaal 100 tekens in.");
  requireThat(validDivisionDate(value.startsOn), "Vul een geldige startdatum in.");
  requireThat(Number.isInteger(value.bestOf) && value.bestOf >= 1 && value.bestOf <= 21 && value.bestOf % 2 === 1, "Best of moet oneven zijn, van 1 t/m 21 legs.");
  for (const count of [value.promoteCount, value.relegateCount]) requireThat(Number.isInteger(count) && count >= 0 && count <= 4, "Kies 0 tot en met 4 promotie- en degradatieplaatsen.");
}
export function validateDivisionSeason(season: DivisionSeason) {
  requireThat(season && typeof season === "object", "Ongeldig seizoen."); validateDivisionSettings(season);
  requireThat(typeof season.id === "string" && typeof season.description === "string" && ["draft", "live", "completed"].includes(season.status), "Ongeldige seizoensgegevens.");
  requireThat(Number.isFinite(season.createdAt) && Number.isFinite(season.updatedAt) && (season.completedAt === null || Number.isFinite(season.completedAt)) && typeof season.completionReason === "string" && (season.previousSeasonId === null || typeof season.previousSeasonId === "string"), "Ongeldige seizoenshistorie.");
  requireThat(Array.isArray(season.divisions) && season.divisions.length >= 1 && season.divisions.length <= 8, "Een seizoen heeft 1 tot en met 8 divisies.");
  requireThat(new Set(season.divisions.map(d => d.id)).size === season.divisions.length && new Set(season.divisions.map(d => d.level)).size === season.divisions.length, "Divisies moeten een unieke indeling hebben.");
  requireThat(new Set(season.divisions.map(d => d.name.trim().toLowerCase())).size === season.divisions.length, "Divisienamen moeten uniek zijn.");
  for (const d of season.divisions) requireThat(typeof d.id === "string" && typeof d.name === "string" && d.name.trim().length > 0 && d.name.length <= 50 && Number.isInteger(d.level) && d.level >= 1 && d.level <= season.divisions.length && DIVISION_COLORS.includes(d.color), "Controleer de naam, volgorde en kleur van de divisie.");
  requireThat(Array.isArray(season.members) && season.members.length <= 192, "Maximaal 192 spelers per seizoen.");
  const memberIds = new Set(season.members.map(m => m.id));
  requireThat(memberIds.size === season.members.length && new Set(season.members.map(m => m.name.toLowerCase())).size === season.members.length, "Een speler kan maar in één divisie meedoen.");
  for (const member of season.members) requireThat(typeof member.id === "string" && typeof member.name === "string" && member.name.trim().length > 0 && member.name.length <= 40 && season.divisions.some(d => d.id === member.divisionId) && Number.isFinite(member.rating) && member.rating >= 0 && member.rating <= 5000, "Controleer de speler en divisie.");
  for (const d of season.divisions) requireThat(season.members.filter(m => m.divisionId === d.id).length <= 24, "Maximaal 24 spelers per divisie.");
  requireThat(Array.isArray(season.fixtures) && season.fixtures.length <= 2304 && new Set(season.fixtures.map(f => f.id)).size === season.fixtures.length, "Ongeldig wedstrijdschema.");
  const pairs = new Set<string>();
  for (const fixture of season.fixtures) {
    requireThat(typeof fixture.id === "string" && Number.isInteger(fixture.matchday) && fixture.matchday > 0 && fixture.matchday <= 25 && validDivisionDate(fixture.dueOn) && ["scheduled", "completed", "bye"].includes(fixture.status) && Array.isArray(fixture.players) && fixture.players.length === 2, "Ongeldige wedstrijd.");
    requireThat(fixture.players[0] !== fixture.players[1] && fixture.players.every(p => p === null || season.members.some(m => m.id === p && m.divisionId === fixture.divisionId)), "Spelers in een wedstrijd moeten uit dezelfde divisie komen.");
    requireThat(typeof fixture.players[0] === "string" && memberIds.has(fixture.players[0]), "Wedstrijd mist een speler.");
    if (fixture.players[1] === null) requireThat(fixture.status === "bye" && fixture.result === null, "Een rustweek heeft geen uitslag.");
    else {
      const pair = [...fixture.players].sort().join("|"); requireThat(!pairs.has(pair), "Elke combinatie speelt één keer per seizoen."); pairs.add(pair);
      requireThat(fixture.status !== "bye", "Een wedstrijd met twee spelers is geen rustweek.");
      if (fixture.status === "completed") {
        requireThat(fixture.result && Number.isFinite(fixture.result.at) && typeof fixture.result.reason === "string", "Afgeronde wedstrijd mist een uitslag.");
        const winner = validateDivisionScore(season.bestOf, fixture.result.score);
        requireThat(fixture.result.winnerId === fixture.players[winner], "Winnaar past niet bij de uitslag.");
      } else requireThat(fixture.result === null, "Geplande wedstrijd mag geen uitslag hebben.");
    }
  }
  if (season.status !== "draft") {
    const scheduled = buildDivisionSchedule({ ...season, status: "draft", fixtures: [] }).fixtures;
    requireThat(scheduled.length === season.fixtures.length && scheduled.every((fixture, index) => {
      const saved = season.fixtures[index];
      return saved.id === fixture.id && saved.divisionId === fixture.divisionId && saved.matchday === fixture.matchday && saved.dueOn === fixture.dueOn && saved.players[0] === fixture.players[0] && saved.players[1] === fixture.players[1];
    }), "Een gestart seizoen moet het volledige oorspronkelijke wedstrijdschema behouden.");
  }
}
export function validateDivisionScore(bestOf: number, score: [number, number]): 0 | 1 {
  const target = (bestOf + 1) / 2;
  requireThat(Array.isArray(score) && score.length === 2 && score.every(n => Number.isInteger(n) && n >= 0 && n <= target), "Vul een geldige legscore in.");
  requireThat((score[0] === target && score[1] < target) || (score[1] === target && score[0] < target), `Eén speler moet precies ${target} legs hebben gewonnen.`);
  return score[0] === target ? 0 : 1;
}
/** Circle scheduling: every pair once, no player double-booked within a matchday. */
export function buildDivisionSchedule(season: DivisionSeason): DivisionSeason {
  requireThat(season.status === "draft", "De indeling is vergrendeld na de seizoensstart."); validateDivisionSeason(season);
  const fixtures: DivisionFixture[] = [];
  for (const division of [...season.divisions].sort((a, b) => a.level - b.level)) {
    const members = season.members.filter(m => m.divisionId === division.id);
    requireThat(members.length >= 2, `Voeg minimaal twee spelers toe aan ${division.name}.`);
    const circle: Array<string | null> = members.map(m => m.id); if (circle.length % 2) circle.push(null);
    for (let day = 1; day < circle.length; day++) {
      for (let i = 0; i < circle.length / 2; i++) {
        let a = circle[i]; let b = circle[circle.length - 1 - i];
        if (a === null) [a, b] = [b, a];
        else if (b !== null && (day + i) % 2 === 0) [a, b] = [b, a];
        fixtures.push({ id: `${season.id}-${division.id}-d${day}-m${i + 1}`, divisionId: division.id, matchday: day,
          players: [a!, b], dueOn: addDivisionDays(season.startsOn, (day - 1) * 7 + 6), status: b === null ? "bye" : "scheduled", result: null });
      }
      circle.splice(1, 0, circle.pop()!);
    }
  }
  return { ...season, fixtures };
}
export function applyDivisionResult(season: DivisionSeason, fixtureId: string, input: DivisionResultInput, at = Date.now()): DivisionSeason {
  requireThat(season.status !== "draft", "Start het seizoen voordat je uitslagen vastlegt.");
  const fixture = season.fixtures.find(f => f.id === fixtureId); requireThat(fixture && fixture.players[1], "Wedstrijd niet gevonden of dit is een rustweek.");
  if (fixture.result || season.status === "completed") requireThat((input.reason ?? "").trim().length >= 5, "Geef een duidelijke reden voor de correctie.");
  const winner = validateDivisionScore(season.bestOf, input.score);
  const next: DivisionFixture = { ...fixture, status: "completed", result: { score: [...input.score], winnerId: fixture.players[winner]!, reason: (input.reason ?? "").trim().slice(0, 500), at } };
  return { ...season, status: "live", completedAt: null, completionReason: "", fixtures: season.fixtures.map(f => f.id === fixtureId ? next : f) };
}
export function getDivisionStandings(season: DivisionSeason, divisionId: string): DivisionStanding[] {
  const table = new Map(season.members.filter(m => m.divisionId === divisionId).map(m => [m.id, { memberId: m.id, name: m.name, rating: m.rating, played: 0, won: 0, lost: 0, legsFor: 0, legsAgainst: 0, legDifference: 0, points: 0, rank: 0 }]));
  const results = season.fixtures.filter(f => f.divisionId === divisionId && f.status === "completed" && f.result && f.players[1]);
  for (const fixture of results) for (const index of [0, 1] as const) {
    const row = table.get(fixture.players[index]!); if (!row) continue;
    row.played++; row.legsFor += fixture.result!.score[index]; row.legsAgainst += fixture.result!.score[index === 0 ? 1 : 0];
    if (fixture.result!.winnerId === row.memberId) { row.won++; row.points += 3; } else row.lost++;
    row.legDifference = row.legsFor - row.legsAgainst;
  }
  const baseCompare = (a: DivisionStanding, b: DivisionStanding) => b.points - a.points || b.legDifference - a.legDifference || b.legsFor - a.legsFor;
  const rows = [...table.values()].sort((a, b) => baseCompare(a, b) || a.name.localeCompare(b.name, "nl"));
  let index = 0;
  while (index < rows.length) {
    let end = index + 1; while (end < rows.length && baseCompare(rows[index], rows[end]) === 0) end++;
    if (end - index === 2) {
      const direct = results.find(f => f.players.includes(rows[index].memberId) && f.players.includes(rows[index + 1].memberId));
      if (direct) {
        if (direct.result!.winnerId === rows[index + 1].memberId) [rows[index], rows[index + 1]] = [rows[index + 1], rows[index]];
        rows[index].rank = index + 1; rows[index + 1].rank = index + 2;
      } else rows[index].rank = rows[index + 1].rank = index + 1;
    } else for (let i = index; i < end; i++) rows[i].rank = index + 1;
    index = end;
  }
  return rows;
}
/** Elo is a membership snapshot for display; table order exclusively follows league results. */
export function getPlayerDivision(seasons: DivisionSeason[], name: string) {
  for (const season of seasons.filter(s => s.status === "live")) {
    const member = season.members.find(m => m.name.toLowerCase() === name.toLowerCase());
    const division = member && season.divisions.find(d => d.id === member.divisionId);
    if (member && division) return { season, division, member };
  }
  return null;
}
export function getDivisionFixtureAccess(season: DivisionSeason, fixtureId: string, playerName: string) {
  const fixture = season.fixtures.find(f => f.id === fixtureId) ?? null;
  const players: [DivisionMember | null, DivisionMember | null] = [
    season.members.find(m => m.id === fixture?.players[0]) ?? null,
    season.members.find(m => m.id === fixture?.players[1]) ?? null,
  ];
  const member = players.find(p => p?.name.toLowerCase() === playerName.toLowerCase());
  let reason = "";
  if (!fixture) reason = "Wedstrijd niet gevonden.";
  else if (season.status !== "live") reason = "Deze divisiecompetitie is nog niet gestart of al afgesloten.";
  else if (fixture.status !== "scheduled") reason = fixture.status === "bye" ? "Dit is een rustweek." : "Deze wedstrijd is al gespeeld.";
  else if (!member) reason = "Alleen de twee ingedeelde spelers kunnen deze wedstrijd spelen. Toeschouwers zijn welkom.";
  else if (season.fixtures.some(f => f.status === "scheduled" && f.matchday < fixture.matchday && f.players.some(pid => pid !== null && fixture.players.includes(pid)))) reason = "Speel eerst de eerdere speeldag van beide spelers af.";
  return { canPlay: reason === "", canSpectate: Boolean(fixture && season.status !== "draft" && fixture.status !== "bye"), reason, fixture, players };
}
export function getDivisionMovements(season: DivisionSeason): { members: DivisionMember[]; movements: DivisionMovement[]; warnings: string[] } {
  const ordered = [...season.divisions].sort((a, b) => a.level - b.level);
  const movements: DivisionMovement[] = []; const warnings: string[] = [];
  for (let index = 0; index < ordered.length - 1; index++) {
    const upper = ordered[index]; const lower = ordered[index + 1];
    const upTable = getDivisionStandings(season, upper.id); const downTable = getDivisionStandings(season, lower.id);
    const count = Math.min(season.promoteCount, season.relegateCount, Math.floor(upTable.length / 2), Math.floor(downTable.length / 2));
    if (!count) continue;
    const upBoundary = upTable.length - count;
    const tied = upTable[upBoundary - 1]?.rank === upTable[upBoundary]?.rank || downTable[count - 1]?.rank === downTable[count]?.rank;
    if (tied) { warnings.push(`${upper.name} / ${lower.name}: gedeelde stand op de grens. Spelers blijven staan; deel het volgende conceptseizoen handmatig in na een beslissingswedstrijd.`); continue; }
    for (const row of upTable.slice(-count)) movements.push({ memberId: row.memberId, name: row.name, fromDivisionId: upper.id, toDivisionId: lower.id, direction: "down" });
    for (const row of downTable.slice(0, count)) movements.push({ memberId: row.memberId, name: row.name, fromDivisionId: lower.id, toDivisionId: upper.id, direction: "up" });
  }
  if (season.promoteCount !== season.relegateCount) warnings.push("Het kleinste aantal promotie- en degradatieplaatsen geldt per grens, zodat de divisies even groot blijven.");
  return { members: season.members.map(m => { const movement = movements.find(item => item.memberId === m.id); return movement ? { ...m, divisionId: movement.toDivisionId } : { ...m }; }), movements, warnings };
}
export function finishDivisionSeason(season: DivisionSeason, reason = "", at = Date.now()): DivisionSeason {
  requireThat(season.status === "live", "Alleen een lopend seizoen kan worden afgesloten.");
  const pending = season.fixtures.filter(f => f.status === "scheduled").length;
  requireThat(!pending || reason.trim().length >= 5, "Er zijn nog open wedstrijden. Geef een duidelijke reden om het seizoen toch af te sluiten.");
  return { ...season, status: "completed", completedAt: at, completionReason: reason.trim().slice(0, 500) };
}
