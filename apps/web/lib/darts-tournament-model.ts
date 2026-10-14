import type { HeroImage } from "./darts-hero-image";
export type TournamentStatus = "draft" | "registration" | "checkin" | "live" | "completed" | "cancelled";
export type ParticipantStatus = "waiting" | "confirmed" | "checkedin" | "withdrawn";
export type TournamentSettings = {
  format: "knockout" | "double-elimination"; boardCount: number; scheduling: "automatic" | "manual"; restSeconds: number; maxPlayers: 4 | 8 | 16 | 32 | 64; startScore: 301 | 501 | 701;
  doubleOut: boolean; bestOf: number; finalBestOf: number; turnSeconds: number; reconnectSeconds: number; spectators: boolean; checkoutHints: boolean; checkInMinutes: number; seeding: "elo" | "random" | "manual";
  registrationOpens: string; registrationCloses: string; checkInOpens: string; checkInCloses: string; startsAt: string;
  minRating: number; maxRating: number; minMatches: number; vipOnly: boolean; approvalRequired: boolean;
  requireRules: boolean; requireCheckIn: boolean; room: string; ranked: boolean;
};
export type TournamentParticipant = {
  id: string; name: string; rating: number; played: number; role: "owner" | "admin" | "vip" | "player";
  status: ParticipantStatus; ready: boolean; rulesAccepted: boolean; approved: boolean; seed: number; joinedAt: number;
};
export type TournamentResult = { kind: "played" | "walkover" | "bye"; score: [number, number]; reason: string; at: number };
export type MatchSource = { matchId: string; outcome: "winner" | "loser" };
export type TournamentMatch = {
  bracket: "winners" | "losers" | "grand-final" | "reset"; sources: [MatchSource | null, MatchSource | null];
  loserId: string | null; boardId: number | null; assignedAt: number | null; startedAt: number | null;
  id: string; round: number; index: number; players: [string | null, string | null];
  status: "pending" | "ready" | "playing" | "completed" | "skipped"; winnerId: string | null; result: TournamentResult | null; bestOf: number;
};
export type Tournament = {
  id: string; name: string; description: string; organizer: "DartsPoint"; status: TournamentStatus; published: boolean;
  settings: TournamentSettings; participants: TournamentParticipant[]; matches: TournamentMatch[];
  championId: string | null; createdAt: number; updatedAt: number; hero?: HeroImage; heroVersion?: number;
};
export type TournamentInput = Partial<Pick<Tournament, "name" | "description" | "published" | "hero">> & { settings?: Partial<TournamentSettings>; expectedHeroVersion?: number };
export type TournamentResultInput = { score: [number, number]; kind?: "played" | "walkover"; winnerId?: string; reason?: string };
export const DEFAULT_TOURNAMENT_SETTINGS: TournamentSettings = {
  format: "knockout", boardCount: 4, scheduling: "automatic", restSeconds: 30, maxPlayers: 8, startScore: 501, doubleOut: true, bestOf: 3, finalBestOf: 5, turnSeconds: 30, reconnectSeconds: 90, spectators: true, checkoutHints: true, checkInMinutes: 15, seeding: "elo",
  registrationOpens: "", registrationCloses: "", checkInOpens: "", checkInCloses: "", startsAt: "",
  minRating: 0, maxRating: 3000, minMatches: 0, vipOnly: false, approvalRequired: false,
  requireRules: true, requireCheckIn: true, room: "Toernooikamer", ranked: false,
};
function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function validateTournamentSettings(settings: TournamentSettings) {
  for (const flag of [settings.doubleOut, settings.vipOnly, settings.approvalRequired, settings.requireRules, settings.requireCheckIn, settings.ranked, settings.spectators, settings.checkoutHints]) requireThat(typeof flag === "boolean", "Een spel- of deelnameoptie is ongeldig.");
  for (const [value, min, max, label] of [[settings.turnSeconds, 10, 120, "Beurttijd"], [settings.reconnectSeconds, 15, 600, "Hersteltijd"], [settings.checkInMinutes, 5, 120, "Check-inperiode"]] as const) requireThat(Number.isInteger(value) && value >= min && value <= max, `${label}: kies een heel getal tussen ${min} en ${max}.`);
  requireThat(["knockout", "double-elimination"].includes(settings.format), "Kies knock-out of double elimination.");
  requireThat(Number.isInteger(settings.boardCount) && settings.boardCount >= 1 && settings.boardCount <= 16, "Kies 1 tot en met 16 borden.");
  requireThat(["automatic", "manual"].includes(settings.scheduling), "Kies automatische of handmatige bordplanning.");
  requireThat(Number.isInteger(settings.restSeconds) && settings.restSeconds >= 0 && settings.restSeconds <= 900, "Rusttijd moet tussen 0 en 900 seconden liggen.");
  requireThat([4, 8, 16, 32, 64].includes(settings.maxPlayers), "Kies maximaal 4, 8, 16, 32 of 64 deelnemers.");
  requireThat([301, 501, 701].includes(settings.startScore), "Kies 301, 501 of 701.");
  for (const count of [settings.bestOf, settings.finalBestOf]) requireThat(Number.isInteger(count) && count >= 1 && count <= 21 && count % 2 === 1, "Best of moet een oneven aantal tussen 1 en 21 zijn.");
  requireThat(["elo", "random", "manual"].includes(settings.seeding), "Ongeldige plaatsingsmethode.");
  requireThat(Number.isFinite(settings.minRating) && Number.isFinite(settings.maxRating) && settings.minRating >= 0 && settings.maxRating <= 5000 && settings.minRating <= settings.maxRating, "Controleer de minimale en maximale DP-rating.");
  requireThat(Number.isInteger(settings.minMatches) && settings.minMatches >= 0 && settings.minMatches <= 10000, "Het minimale aantal wedstrijden is ongeldig.");
  requireThat(typeof settings.room === "string" && settings.room.trim().length > 0 && settings.room.length <= 80, "Vul een kamernaam van maximaal 80 tekens in.");
  const dates = [settings.registrationOpens, settings.registrationCloses, settings.checkInOpens, settings.checkInCloses, settings.startsAt];
  for (const date of dates) requireThat(typeof date === "string" && (!date || Number.isFinite(Date.parse(date))), "Een datum of tijd is ongeldig.");
  const before = (a: string, b: string, label: string) => requireThat(!a || !b || Date.parse(a) <= Date.parse(b), label);
  before(settings.registrationOpens, settings.registrationCloses, "Registratie moet openen vóór deze sluit.");
  before(settings.checkInOpens, settings.checkInCloses, "Check-in moet openen vóór deze sluit.");
  before(settings.registrationCloses, settings.startsAt, "Registratie moet sluiten vóór het toernooi begint.");
  before(settings.checkInCloses, settings.startsAt, "Check-in moet sluiten vóór het toernooi begint.");
}
export function eligibilityReasons(tournament: Tournament, participant: TournamentParticipant) {
  const s = tournament.settings; const reasons: string[] = [];
  if (participant.rating < s.minRating) reasons.push(`Minimaal ${s.minRating} DP`);
  if (participant.rating > s.maxRating) reasons.push(`Maximaal ${s.maxRating} DP`);
  if (participant.played < s.minMatches) reasons.push(`Minimaal ${s.minMatches} gespeelde wedstrijden`);
  if (s.vipOnly && !["vip", "owner", "admin"].includes(participant.role)) reasons.push("Alleen VIP-leden en teamleden");
  if (s.requireRules && !participant.rulesAccepted) reasons.push("Spelregels nog niet geaccepteerd");
  if (s.approvalRequired && !participant.approved) reasons.push("Goedkeuring door beheer nodig");
  return reasons;
}
export function registrationIsOpen(tournament: Tournament, now = Date.now()) {
  const s = tournament.settings;
  return tournament.published && tournament.status === "registration" && (!s.registrationOpens || now >= Date.parse(s.registrationOpens)) && (!s.registrationCloses || now < Date.parse(s.registrationCloses));
}
export function checkInIsOpen(tournament: Tournament, now = Date.now()) {
  const s = tournament.settings;
  const opens = s.checkInOpens ? Date.parse(s.checkInOpens) : s.startsAt ? Date.parse(s.startsAt) - s.checkInMinutes * 60_000 : null;
  const closes = s.checkInCloses ? Date.parse(s.checkInCloses) : s.startsAt ? Date.parse(s.startsAt) : null;
  return tournament.published && ["registration", "checkin"].includes(tournament.status) && (opens === null || now >= opens) && (closes === null || now < closes);
}
export function eligibleParticipants(tournament: Tournament) {
  return tournament.participants.filter(p => ["confirmed", "checkedin"].includes(p.status) && !eligibilityReasons(tournament, p).length && (!tournament.settings.requireCheckIn || p.status === "checkedin"));
}
/** Standard seeded positions keep the strongest seeds in separate halves/quarters. */
export function seedPositions(size: number): number[] {
  requireThat([2, 4, 8, 16, 32, 64].includes(size), "Ongeldige bracketgrootte.");
  let order = [1, 2];
  while (order.length < size) { const nextSize = order.length * 2; order = order.flatMap(seed => [seed, nextSize + 1 - seed]); }
  return order;
}
/** Add graph/planning metadata to earlier single-elimination saves without discarding results. */
export function normalizeTournament(tournament: Tournament): Tournament {
  const settings = { ...DEFAULT_TOURNAMENT_SETTINGS, ...tournament.settings, spectators: true };
  const matches = tournament.matches.map(m => ({ ...m,
    bracket: m.bracket ?? "winners", sources: m.sources ?? (m.round === 0 ? [null, null] : [0, 1].map(side => ({ matchId: tournament.matches.find(previous => previous.round === m.round - 1 && previous.index === m.index * 2 + side)?.id ?? "missing", outcome: "winner" }))),
    loserId: m.loserId ?? (m.result && m.result.kind !== "bye" && m.winnerId ? m.players.find(p => p !== m.winnerId) ?? null : null),
    boardId: m.boardId ?? null, assignedAt: m.assignedAt ?? null, startedAt: m.startedAt ?? null,
    players: [...m.players], result: m.result ? { ...m.result, score: [...m.result.score] } : null,
  } as TournamentMatch));
  return { ...tournament, organizer: "DartsPoint", settings, matches, participants: tournament.participants.map(p => ({ ...p, ready: p.ready ?? (p.status === "checkedin" || !settings.requireCheckIn && p.status === "confirmed") })) };
}
function clearMatch(match: TournamentMatch) {
  match.result = null; match.winnerId = null; match.loserId = null; match.boardId = null; match.assignedAt = null; match.startedAt = null;
}
/** Source edges are evaluated topologically: an unresolved source is never a bye. */
export function progressTournament(value: Tournament): Tournament {
  const tournament = normalizeTournament(value); const matches = tournament.matches;
  const visited = new Set<string>(); const visiting = new Set<string>(); const byId = new Map(matches.map(m => [m.id, m]));
  function visit(match: TournamentMatch) {
    if (visited.has(match.id)) return;
    requireThat(!visiting.has(match.id), "Het bracket bevat een ongeldige kringverwijzing."); visiting.add(match.id);
    let resolved = true; const players = [...match.players] as [string | null, string | null];
    match.sources.forEach((source, side) => {
      if (!source) return;
      const parent = byId.get(source.matchId); requireThat(parent, "Een voorgaande wedstrijd ontbreekt."); visit(parent);
      if (!["completed", "skipped"].includes(parent.status)) resolved = false;
      players[side] = source.outcome === "winner" ? parent.winnerId : parent.loserId;
    });
    if (players.some((id, i) => id !== match.players[i])) clearMatch(match);
    match.players = players;
    if (match.bracket === "reset") {
      const grandFinal = matches.find(m => m.bracket === "grand-final");
      if (!grandFinal || grandFinal.status !== "completed") resolved = false;
      else if (grandFinal.winnerId === grandFinal.players[0]) {
        clearMatch(match); match.status = "skipped"; match.players = [null, null];
        visiting.delete(match.id); visited.add(match.id); return;
      }
    }
    if (!resolved) { clearMatch(match); match.status = "pending"; }
    else if (!players[0] || !players[1]) {
      clearMatch(match); match.status = "completed"; match.winnerId = players[0] || players[1];
      match.result = { kind: "bye", score: [0, 0], reason: match.winnerId ? "Vrijgeloot" : "Lege bracketpositie", at: 0 };
    } else if (match.result && match.result.kind !== "bye") {
      match.status = "completed"; match.winnerId = match.result.score[0] > match.result.score[1] ? players[0] : players[1];
      match.loserId = players.find(p => p !== match.winnerId) ?? null; match.boardId = null; match.assignedAt = null;
    } else {
      match.result = null; match.winnerId = null; match.loserId = null;
      if (match.status !== "playing") match.status = "ready";
    }
    visiting.delete(match.id); visited.add(match.id);
  }
  matches.forEach(visit);
  let championId: string | null = null;
  if (tournament.settings.format === "double-elimination") {
    const grand = matches.find(m => m.bracket === "grand-final"); const reset = matches.find(m => m.bracket === "reset");
    if (grand?.status === "completed" && grand.winnerId === grand.players[0]) championId = grand.winnerId;
    else if (reset?.status === "completed") championId = reset.winnerId;
  } else { const final = matches.filter(m => m.bracket === "winners").at(-1); if (final?.status === "completed") championId = final.winnerId; }
  return { ...tournament, matches, championId, status: championId && ["live", "completed"].includes(tournament.status) ? "completed" : tournament.status === "completed" ? "live" : tournament.status };
}
export function buildTournamentBracket(value: Tournament, random: () => number = Math.random): Tournament {
  const tournament = normalizeTournament(value);
  requireThat(!["live", "completed", "cancelled"].includes(tournament.status), "Reset het bracket met een reden voordat je opnieuw indeelt.");
  validateTournamentSettings(tournament.settings);
  const entrants = eligibleParticipants(tournament);
  requireThat(entrants.length >= 2, "Er zijn minimaal twee toegelaten en ingecheckte deelnemers nodig.");
  requireThat(entrants.length <= tournament.settings.maxPlayers, "Er zijn te veel deelnemers voor dit toernooi.");
  if (tournament.settings.seeding === "elo") entrants.sort((a, b) => b.rating - a.rating || a.joinedAt - b.joinedAt);
  else if (tournament.settings.seeding === "manual") entrants.sort((a, b) => a.seed - b.seed || a.joinedAt - b.joinedAt);
  else for (let i = entrants.length - 1; i > 0; i--) { const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1)))); [entrants[i], entrants[j]] = [entrants[j], entrants[i]]; }
  const size = Math.max(4, 2 ** Math.ceil(Math.log2(entrants.length))); const rounds = Math.log2(size);
  const order = seedPositions(size).map(seed => entrants[seed - 1]?.id ?? null); const matches: TournamentMatch[] = [];
  const winnerId = (round: number, index: number) => `${tournament.id}-r${round}-m${index}`;
  const loserId = (round: number, index: number) => `${tournament.id}-l${round}-m${index}`;
  const source = (matchId: string, outcome: "winner" | "loser" = "winner"): MatchSource => ({ matchId, outcome });
  function add(id: string, bracket: TournamentMatch["bracket"], round: number, index: number, sources: TournamentMatch["sources"], players: TournamentMatch["players"] = [null, null]) {
    matches.push({ id, bracket, round, index, sources, players, status: "pending", winnerId: null, loserId: null, result: null, boardId: null, assignedAt: null, startedAt: null,
      bestOf: bracket === "grand-final" || bracket === "reset" || tournament.settings.format === "knockout" && bracket === "winners" && round === rounds - 1 ? tournament.settings.finalBestOf : tournament.settings.bestOf });
  }
  for (let round = 0; round < rounds; round++) for (let index = 0; index < size / 2 ** (round + 1); index++) add(winnerId(round, index), "winners", round, index,
    round === 0 ? [null, null] : [source(winnerId(round - 1, index * 2)), source(winnerId(round - 1, index * 2 + 1))], round === 0 ? [order[index * 2], order[index * 2 + 1]] : [null, null]);
  if (tournament.settings.format === "double-elimination") {
    for (let index = 0; index < size / 4; index++) add(loserId(0, index), "losers", 0, index, [source(winnerId(0, index * 2), "loser"), source(winnerId(0, index * 2 + 1), "loser")]);
    for (let wr = 1; wr < rounds; wr++) {
      const count = size / 2 ** (wr + 1); const mergeRound = wr * 2 - 1;
      for (let index = 0; index < count; index++) add(loserId(mergeRound, index), "losers", mergeRound, index, [source(loserId(mergeRound - 1, index)), source(winnerId(wr, count - 1 - index), "loser")]);
      if (wr < rounds - 1) for (let index = 0; index < count / 2; index++) add(loserId(mergeRound + 1, index), "losers", mergeRound + 1, index, [source(loserId(mergeRound, index * 2)), source(loserId(mergeRound, index * 2 + 1))]);
    }
    add(`${tournament.id}-grand-final`, "grand-final", 0, 0, [source(winnerId(rounds - 1, 0)), source(loserId(rounds * 2 - 3, 0))]);
    add(`${tournament.id}-reset`, "reset", 0, 0, [source(`${tournament.id}-grand-final`), source(`${tournament.id}-grand-final`, "loser")]);
  }
  const participants = tournament.participants.map(p => ({ ...p, seed: entrants.findIndex(e => e.id === p.id) >= 0 ? entrants.findIndex(e => e.id === p.id) + 1 : p.seed }));
  return progressTournament({ ...tournament, participants, matches, championId: null });
}
export function tournamentLosses(tournament: Tournament): Record<string, number> {
  const losses = Object.fromEntries(tournament.participants.map(p => [p.id, 0]));
  for (const match of tournament.matches) if (match.result && match.result.kind !== "bye" && match.loserId) losses[match.loserId] = (losses[match.loserId] ?? 0) + 1;
  return losses;
}
export function applyTournamentResult(value: Tournament, matchId: string, input: TournamentResultInput, now = Date.now()): Tournament {
  const tournament = normalizeTournament(value);
  requireThat(["live", "completed"].includes(tournament.status), "Start het toernooi voordat je een uitslag invoert.");
  const matches = tournament.matches; const match = matches.find(m => m.id === matchId);
  requireThat(match && ["ready", "playing", "completed"].includes(match.status) && match.players.every(Boolean), "Deze wedstrijd heeft nog geen twee deelnemers.");
  requireThat(!match.result || match.result.kind === "bye" || Boolean(input.reason?.trim()), "Vul een reden in voor deze uitslagcorrectie.");
  const kind = input.kind ?? "played"; const target = (match.bestOf + 1) / 2;
  requireThat(kind === "played" || kind === "walkover", "Ongeldig uitslagtype."); let score = input.score;
  if (kind === "walkover") {
    requireThat(Boolean(input.reason?.trim()), "Vul de reden voor de walk-over in.");
    requireThat(input.winnerId && match.players.includes(input.winnerId), "Kies de winnaar van de walk-over.");
    score = input.winnerId === match.players[0] ? [target, 0] : [0, target];
  }
  requireThat(Array.isArray(score) && score.length === 2 && score.every(n => Number.isInteger(n) && n >= 0 && n <= target), "De legscore is ongeldig.");
  requireThat((score[0] === target && score[1] < target) || (score[1] === target && score[0] < target), `De winnaar moet precies ${target} legs hebben; de verliezer minder.`);
  match.result = { kind, score: [...score] as [number, number], reason: input.reason?.trim().slice(0, 500) ?? "", at: now };
  const invalid = new Set([matchId]); let changed = true;
  while (changed) { changed = false; for (const downstream of matches) if (!invalid.has(downstream.id) && downstream.sources.some(s => s && invalid.has(s.matchId))) { invalid.add(downstream.id); clearMatch(downstream); downstream.status = "pending"; changed = true; } }
  return progressTournament({ ...tournament, matches, championId: null, updatedAt: now });
}
