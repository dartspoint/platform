import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DEFAULT_TOURNAMENT_SETTINGS, applyTournamentResult, buildTournamentBracket, checkInIsOpen, eligibilityReasons, registrationIsOpen, seedPositions, tournamentLosses, normalizeTournament, validateTournamentSettings } from "../lib/darts-tournament-model.ts";

function tournament(count, settings = {}) {
  return { id: `test-${count}`, name: "Testcup", description: "", status: "checkin", published: true,
    settings: { ...DEFAULT_TOURNAMENT_SETTINGS, maxPlayers: count > 32 ? 64 : count > 16 ? 32 : count > 8 ? 16 : 8, ...settings },
    participants: Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `Speler${i + 1}`, rating: 2000 - i * 10, played: 100, role: "player", status: "checkedin", rulesAccepted: true, approved: true, seed: i + 1, joinedAt: i })),
    matches: [], championId: null, createdAt: 0, updatedAt: 0 };
}
let seven = buildTournamentBracket(tournament(7));
assert.equal(seven.matches.length, 7);
assert.equal(seven.matches.filter(m => m.round === 0 && m.result?.kind === "bye").length, 1);
assert.equal(seven.matches.find(m => m.round === 0 && m.result?.kind === "bye").winnerId, "p1");
assert.equal(seven.matches.find(m => m.round === 1 && m.index === 0).status, "pending", "Unresolved feeder must not turn into a bye");
assert.equal(seven.championId, null);
assert.deepEqual(seedPositions(8), [1, 8, 4, 5, 2, 7, 3, 6]);
assert.equal(new Set(seedPositions(64)).size, 64);

let full = { ...buildTournamentBracket(tournament(32)), status: "live" };
assert.equal(full.matches.length, 31);
assert.equal(full.matches.filter(m => m.status === "ready").length, 16);
const firstId = full.matches[0].id;
for (const score of [[2, 2], [3, 0], [1, 0], [-1, 2], [2.5, 0], [NaN, 2]]) assert.throws(() => applyTournamentResult(full, firstId, { score }));
assert.throws(() => applyTournamentResult(full, full.matches.at(-1).id, { score: [3, 0] }));
while (full.status !== "completed") {
  const match = full.matches.find(m => m.status === "ready"); assert.ok(match, "Bracket cannot become stuck");
  full = applyTournamentResult(full, match.id, { score: [(match.bestOf + 1) / 2, 0] });
}
assert.equal(full.championId, "p1");
assert.equal(full.matches.filter(m => m.status === "completed").length, 31);
assert.equal(full.matches.at(-1).bestOf, 5);
assert.throws(() => applyTournamentResult(full, firstId, { score: [0, 2] }), /reden/);
const corrected = applyTournamentResult(full, firstId, { score: [0, 2], reason: "Score omgedraaid na controle" });
assert.equal(corrected.status, "live"); assert.equal(corrected.championId, null);
assert.equal(corrected.matches[0].winnerId, "p32");
assert.equal(corrected.matches.find(m => m.round === 1 && m.index === 0).result, null);
assert.equal(corrected.matches.find(m => m.round === 1 && m.index === 1).status, "completed", "Unrelated branch stays intact");
assert.equal(corrected.matches.at(-1).status, "pending");
const sameWinner = applyTournamentResult(full, firstId, { score: [2, 1], reason: "Legscore hersteld" });
assert.equal(sameWinner.championId, null, "Even same-winner corrections invalidate dependent results");
const firstReady = corrected.matches.find(m => m.status === "ready");
assert.throws(() => applyTournamentResult(corrected, firstReady.id, { score: [0, 0], kind: "walkover", winnerId: firstReady.players[0] }), /reden/);
const walkover = applyTournamentResult(corrected, firstReady.id, { score: [0, 0], kind: "walkover", winnerId: firstReady.players[1], reason: "No-show na wachttijd" });
assert.equal(walkover.matches.find(m => m.id === firstReady.id).winnerId, firstReady.players[1]);
assert.equal(walkover.matches.find(m => m.id === firstReady.id).result.kind, "walkover");
assert.throws(() => buildTournamentBracket(full), /Reset/);
assert.throws(() => buildTournamentBracket(tournament(1)), /minimaal/);
assert.throws(() => validateTournamentSettings({ ...DEFAULT_TOURNAMENT_SETTINGS, bestOf: 4 }), /oneven/);
assert.throws(() => validateTournamentSettings({ ...DEFAULT_TOURNAMENT_SETTINGS, registrationOpens: "2026-10-13T12:00:00Z", registrationCloses: "2026-10-12T12:00:00Z" }), /openen/);
const gated = tournament(8, { minRating: 1600, minMatches: 20, vipOnly: true, approvalRequired: true });
assert.equal(eligibilityReasons(gated, { ...gated.participants[0], rating: 1400, played: 2, approved: false, rulesAccepted: false }).length, 5);
const windows = { ...tournament(8, { registrationOpens: "2026-10-11T12:00:00Z", registrationCloses: "2026-10-11T20:00:00Z", checkInOpens: "2026-10-11T19:00:00Z", checkInCloses: "2026-10-11T20:30:00Z" }), status: "registration" };
assert.equal(registrationIsOpen(windows, Date.parse("2026-10-11T11:59:59Z")), false);
assert.equal(registrationIsOpen(windows, Date.parse("2026-10-11T19:00:00Z")), true);
assert.equal(registrationIsOpen(windows, Date.parse("2026-10-11T20:00:00Z")), false);
assert.equal(checkInIsOpen(windows, Date.parse("2026-10-11T19:00:00Z")), true);
assert.equal(checkInIsOpen(windows, Date.parse("2026-10-11T20:30:00Z")), false);
const manual = tournament(4, { seeding: "manual" }); manual.participants[0].seed = 4; manual.participants[3].seed = 1;
assert.deepEqual(buildTournamentBracket(manual).matches[0].players, ["p4", "p1"]);
assert.notDeepEqual(buildTournamentBracket(tournament(8, { seeding: "random" }), () => 0).matches[0].players, ["p1", "p8"]);

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/lib/darts-")) return nextResolve(new URL(`../lib/${specifier.slice(6)}.ts`, import.meta.url).href, context);
  if (context.parentURL?.includes("/lib/darts-") && specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const values = new Map(); globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, addEventListener() {} };
globalThis.localStorage = globalThis.window.localStorage;
const store = await import("../lib/darts-tournament-store.ts");
assert.equal(store.getTournamentState().tournaments.length, 4);
const initialDemo = store.getTournamentState().tournaments.find(t => t.id === "cup-dartspoint-double-chance");
const initialNick = initialDemo.participants.find(p => p.name === "Nick");
assert.equal(tournamentLosses(initialDemo)[initialNick.id], 1);
assert.ok(initialDemo.matches.some(m => m.bracket === "losers" && m.status === "ready" && m.boardId === 2 && m.players.includes(initialNick.id)), "Nick can immediately play his second-chance demo on board 2");
let created = store.createTournament({ name: "Storecup", settings: { requireCheckIn: false, requireRules: true } });
store.setTournamentStatus(created.id, "registration"); store.setTournamentPublished(created.id, true);
store.addTournamentParticipant(created.id, { name: "Nick", rulesAccepted: true }, { selfService: true });
assert.throws(() => store.addTournamentParticipant(created.id, { name: "nick", rulesAccepted: true }), /al op/);
assert.throws(() => store.addTournamentParticipant(created.id, { name: "Mila", rulesAccepted: false }, { selfService: true }), /geaccepteerd/);
store.addTournamentParticipant(created.id, { name: "Mila", rulesAccepted: true }, { selfService: true });
const nickEntry = store.getTournamentState().tournaments.find(t => t.id === created.id).participants.find(p => p.name === "Nick");
store.updateTournamentParticipant(created.id, nickEntry.id, { status: "withdrawn" }, { selfService: true });
const rejoined = store.addTournamentParticipant(created.id, { name: "Nick", rulesAccepted: true }, { selfService: true });
assert.equal(rejoined.participants.length, 2); assert.equal(rejoined.participants.find(p => p.name === "Nick").id, nickEntry.id);
created = store.generateTournamentBracket(created.id); store.startTournament(created.id);
assert.throws(() => store.updateTournament(created.id, { settings: { startScore: 301 } }), /vergrendeld/);
assert.throws(() => store.addTournamentParticipant(created.id, { name: "Sophie" }), /vergrendeld/);
assert.throws(() => store.resetTournamentBracket(created.id, ""), /reden/);
store.resetTournamentBracket(created.id, "Nieuwe starttijd afgesproken");
assert.equal(store.getTournamentState().tournaments.find(t => t.id === created.id).matches.length, 0);
const copy = store.cloneTournament(created.id); assert.equal(copy.status, "draft"); assert.equal(copy.participants.length, 0);
store.deleteTournament(copy.id); assert.equal(store.getTournamentState().tournaments.some(t => t.id === copy.id), false);
const reloaded = await import("../lib/darts-tournament-store.ts?reload=1");
assert.equal(reloaded.getTournamentState().tournaments.find(t => t.id === created.id).participants.length, 2);
assert.ok(reloaded.getTournamentState().audit.some(a => a.action === "Bracket gereset"));
let waitCup = store.createTournament({ name: "Wachtlijstcup", settings: { maxPlayers: 8, requireRules: true, requireCheckIn: false } });
store.setTournamentStatus(waitCup.id, "registration"); store.setTournamentPublished(waitCup.id, true);
for (let n = 1; n <= 9; n++) waitCup = store.addTournamentParticipant(waitCup.id, { name: `Wachtspeler${n}`, rulesAccepted: true }, { selfService: true });
assert.equal(waitCup.participants.filter(p => p.status === "confirmed").length, 8);
const ninth = waitCup.participants[8]; assert.equal(ninth.status, "waiting");
assert.throws(() => store.updateTournamentParticipant(waitCup.id, ninth.id, { status: "confirmed" }), /vol/);
store.updateTournamentParticipant(waitCup.id, waitCup.participants[0].id, { status: "withdrawn" });
waitCup = store.updateTournamentParticipant(waitCup.id, ninth.id, { status: "confirmed" });
assert.equal(waitCup.participants[8].status, "confirmed");
assert.equal(waitCup.participants.filter(p => p.status === "confirmed").length, 8);
const operations = await import("../lib/darts-admin-operations.ts");
operations.updateAdminMemberRole("Rookie", "vip");
const vipCup = store.createTournament({ name: "Huidige VIP", settings: { vipOnly: true, requireRules: true } });
store.setTournamentStatus(vipCup.id, "registration"); store.setTournamentPublished(vipCup.id, true);
assert.equal(store.addTournamentParticipant(vipCup.id, { name: "Rookie", rulesAccepted: true }, { selfService: true }).participants[0].role, "vip");
const adminSettings = await import("../lib/darts-admin-settings.ts");
adminSettings.updateAdminSettings({ game: { startScore: 701, finish: "single", bestOfLegs: 7, finalBestOfLegs: 9, turnSeconds: 45, reconnectSeconds: 120, spectators: false, checkoutHints: false }, entry: { maxPlayers: 32, minRating: 1450, minMatches: 10, checkInMinutes: 30, approval: true, vipOnly: true } });
const inherited = store.createTournament({ name: "Overgenomen instellingen" });
assert.equal(inherited.settings.startScore, 701); assert.equal(inherited.settings.doubleOut, false);
assert.equal(inherited.settings.bestOf, 7); assert.equal(inherited.settings.finalBestOf, 9);
assert.equal(inherited.settings.turnSeconds, 45); assert.equal(inherited.settings.reconnectSeconds, 120);
assert.equal(inherited.settings.spectators, true); assert.equal(inherited.settings.checkoutHints, false);
assert.equal(inherited.settings.maxPlayers, 32); assert.equal(inherited.settings.minRating, 1450);
assert.equal(inherited.settings.minMatches, 10); assert.equal(inherited.settings.checkInMinutes, 30);
assert.equal(inherited.settings.approvalRequired, true); assert.equal(inherited.settings.vipOnly, true);
const overridden = store.createTournament({ name: "Toernooikeuze", settings: { startScore: 301, turnSeconds: 60, checkInMinutes: 10 } });
assert.equal(overridden.settings.startScore, 301); assert.equal(overridden.settings.turnSeconds, 60); assert.equal(overridden.settings.checkInMinutes, 10);
assert.equal(overridden.settings.spectators, true);
adminSettings.updateAdminSettings({ game: { turnSeconds: 30 } });
assert.equal(store.getTournamentState().tournaments.find(t => t.id === inherited.id).settings.turnSeconds, 45, "Existing tournament keeps its captured settings");
const fallbackWindow = { ...inherited, status: "checkin", published: true, settings: { ...inherited.settings, startsAt: "2026-10-12T20:00:00Z" } };
assert.equal(checkInIsOpen(fallbackWindow, Date.parse("2026-10-12T19:29:59Z")), false);
assert.equal(checkInIsOpen(fallbackWindow, Date.parse("2026-10-12T19:30:00Z")), true);
assert.equal(checkInIsOpen(fallbackWindow, Date.parse("2026-10-12T20:00:00Z")), false);
console.log("Legacy tournament checks passed: seeded/random/manual brackets, 7-player byes, 32-player progression/champion, score validity, walkovers, safe result corrections, eligibility/windows, immutable started settings, duplicates, audit, durable restore, inherited admin settings and automatic check-in window.");

// Double elimination: enumerate every outcome for small fields, including non-power-of-two byes.
let terminalCount = 0;
function checkLossInvariant(t) {
  const losses = tournamentLosses(t);
  assert.ok(Object.values(losses).every(n => n <= 2), "No participant can lose more than twice");
  for (const m of t.matches) if (m.status === "ready" || m.status === "playing") {
    assert.notEqual(m.players[0], m.players[1], "A participant cannot meet themselves");
    assert.ok(m.players.every(id => losses[id] < 2), "Eliminated participants cannot return");
  }
  return losses;
}
function enumerate(t) {
  const losses = checkLossInvariant(t);
  if (t.status === "completed") {
    terminalCount++; assert.ok(t.championId); assert.ok(losses[t.championId] <= 1);
    for (const p of t.participants) if (p.id !== t.championId) assert.equal(losses[p.id], 2, "Every non-champion must lose exactly twice");
    const played = t.matches.filter(m => m.result && m.result.kind !== "bye").length;
    assert.ok([t.participants.length * 2 - 2, t.participants.length * 2 - 1].includes(played));
    return;
  }
  const match = t.matches.find(m => m.status === "ready"); assert.ok(match, "DE cannot deadlock");
  for (const side of [0, 1]) enumerate(applyTournamentResult(t, match.id, { score: side ? [0, (match.bestOf + 1) / 2] : [(match.bestOf + 1) / 2, 0] }, 1000));
}
for (const count of [2, 3, 4]) enumerate({ ...buildTournamentBracket(tournament(count, { format: "double-elimination", restSeconds: 0 })), status: "live" });
assert.ok(terminalCount >= 50);
for (const count of [4, 7, 8, 15, 16, 63, 64]) for (const resetWinner of [-1, 0, 1]) {
  let cup = { ...buildTournamentBracket(tournament(count, { format: "double-elimination" })), status: "live" };
  while (cup.status !== "completed") {
    checkLossInvariant(cup);
    const match = cup.matches.find(m => m.status === "ready"); assert.ok(match);
    const side = match.bracket === "grand-final" ? Number(resetWinner >= 0) : match.bracket === "reset" ? resetWinner : match.index % 2;
    cup = applyTournamentResult(cup, match.id, { score: side ? [0, (match.bestOf + 1) / 2] : [(match.bestOf + 1) / 2, 0] }, 1000);
  }
  const losses = checkLossInvariant(cup);
  assert.equal(cup.matches.find(m => m.bracket === "reset").status, resetWinner < 0 ? "skipped" : "completed");
  for (const p of cup.participants) assert.equal(losses[p.id], p.id === cup.championId ? resetWinner < 0 ? 0 : 1 : 2);
  const firstPlayed = cup.matches.find(m => m.bracket === "winners" && m.result?.kind === "played");
  const reversed = applyTournamentResult(cup, firstPlayed.id, { score: [...firstPlayed.result.score].reverse(), reason: "Controle van de uitslag" });
  assert.equal(reversed.championId, null); assert.equal(reversed.status, "live");
  const affected = new Set([firstPlayed.id]); let grow = true;
  while (grow) { grow = false; for (const m of cup.matches) if (!affected.has(m.id) && m.sources.some(s => s && affected.has(s.matchId))) { affected.add(m.id); grow = true; } }
  for (const m of reversed.matches) if (affected.has(m.id) && m.id !== firstPlayed.id) { assert.ok(m.result === null || m.result.kind === "bye"); assert.equal(m.boardId, null); }
  const gf = cup.matches.find(m => m.bracket === "grand-final");
  const correctedGrand = applyTournamentResult(cup, gf.id, { score: resetWinner < 0 ? [0, (gf.bestOf + 1) / 2] : [(gf.bestOf + 1) / 2, 0], reason: "Finale gecontroleerd" });
  assert.equal(correctedGrand.matches.find(m => m.bracket === "reset").status, resetWinner < 0 ? "ready" : "skipped");
  assert.equal(correctedGrand.status, resetWinner < 0 ? "live" : "completed");
}

const planning = await import("../lib/darts-tournament-planning.ts");
let planned = planning.planTournamentBoards({ ...buildTournamentBracket(tournament(8, { boardCount: 2, restSeconds: 60 })), status: "live" }, 100_000);
const assignments = planned.matches.filter(m => m.boardId !== null);
assert.equal(assignments.length, 2); assert.equal(new Set(assignments.map(m => m.boardId)).size, 2);
assert.equal(new Set(assignments.flatMap(m => m.players)).size, 4);
const scheduledFirst = assignments[0]; const scheduledSecond = assignments[1];
assert.equal(planning.getTournamentMatchAccess(planned, scheduledFirst.id, "Visitor", 100_000).canWatch, true);
assert.equal(planning.getTournamentMatchAccess(planned, scheduledFirst.id, "Visitor", 100_000).canPlay, false);
const actualPlayer = planned.participants.find(p => p.id === scheduledFirst.players[0]);
assert.equal(planning.getTournamentMatchAccess(planned, scheduledFirst.id, actualPlayer.name, 100_000).canPlay, true);
planned = planning.startTournamentMatchPure(planned, scheduledFirst.id, 100_000);
assert.equal(planned.matches.find(m => m.id === scheduledFirst.id).status, "playing");
assert.throws(() => planning.assignTournamentBoardPure(planned, scheduledSecond.id, scheduledFirst.boardId, 100_000), /bezet/);
planned = planning.planTournamentBoards(applyTournamentResult(planned, scheduledFirst.id, { score: [2, 0] }, 101_000), 101_000);
assert.equal(planned.matches.find(m => m.id === scheduledFirst.id).boardId, null);
assert.equal(planned.matches.filter(m => m.boardId !== null).length, 2, "Freed board is reassigned to a ready independent match");
for (const m of planned.matches.filter(m => m.round === 0 && m.status === "ready")) planned = applyTournamentResult(planned, m.id, { score: [2, 0] }, 102_000);
planned = planning.planTournamentBoards(planned, 103_000);
assert.equal(planned.matches.filter(m => m.boardId !== null).length, 0, "Rest period blocks next matches");
planned = planning.planTournamentBoards(planned, 163_000);
assert.equal(planned.matches.filter(m => m.boardId !== null).length, 2);
const pausing = planned.matches.find(m => m.boardId !== null);
planned.participants = planned.participants.map(p => p.id === pausing.players[0] ? { ...p, ready: false } : p);
planned = planning.planTournamentBoards(planned, 163_000);
assert.equal(planned.matches.find(m => m.id === pausing.id).boardId, null);
assert.ok(planning.getMatchPlanningReasons(planned, planned.matches.find(m => m.id === pausing.id), 163_000).some(s => s.includes("niet klaar")));
let manualPlanning = { ...buildTournamentBracket(tournament(4, { scheduling: "manual", boardCount: 1, restSeconds: 0 })), status: "live" };
manualPlanning = planning.planTournamentBoards(manualPlanning, 100_000); assert.equal(manualPlanning.matches.filter(m => m.boardId !== null).length, 0);
manualPlanning = planning.assignTournamentBoardPure(manualPlanning, manualPlanning.matches[0].id, 1, 100_000);
assert.throws(() => planning.assignTournamentBoardPure(manualPlanning, manualPlanning.matches[1].id, 1, 100_000), /bezet/);
const corruptConcurrent = normalizeTournament(manualPlanning); corruptConcurrent.matches[1].players[0] = corruptConcurrent.matches[0].players[0];
assert.throws(() => planning.assignTournamentBoardPure(corruptConcurrent, corruptConcurrent.matches[1].id, 1, 100_000), /ander bord/);
const notCheckedIn = normalizeTournament(manualPlanning); notCheckedIn.participants[0].status = "confirmed";
assert.ok(planning.getMatchPlanningReasons(notCheckedIn, notCheckedIn.matches[0], 100_000).some(s => s.includes("check-in")));

// Legacy save migration keeps the winner/score, adds only graph, organizer, ready and planner metadata.
const legacy = JSON.parse(JSON.stringify(full));
delete legacy.settings.boardCount; delete legacy.settings.scheduling; delete legacy.settings.restSeconds;
for (const p of legacy.participants) delete p.ready;
for (const m of legacy.matches) for (const key of ["bracket", "sources", "boardId", "assignedAt", "startedAt", "loserId"]) delete m[key];
const migrated = normalizeTournament(legacy); assert.equal(migrated.championId, full.championId);
assert.equal(migrated.matches[0].result.score[0], full.matches[0].result.score[0]);
assert.equal(migrated.organizer, "DartsPoint"); assert.equal(migrated.settings.spectators, true);
assert.equal(migrated.participants[0].ready, true); assert.equal(migrated.matches[16].sources[0].matchId, migrated.matches[0].id);
console.log(`Double-elimination and board checks passed: ${terminalCount} exhaustive small-field outcomes, 4/8/16/64 fields and byes, both GF paths/reset, graph corrections, player exclusivity, rest/readiness/check-in gates, manual/automatic boards, participant-only access and legacy migration.`);

const seededDouble = store.getTournamentState().tournaments.find(t => t.id === "cup-dartspoint-double-chance");
const initialBoard = seededDouble.matches.find(m => m.boardId !== null && m.status === "ready");
const roomPlayer = seededDouble.participants.find(p => p.id === initialBoard.players[0]);
assert.throws(() => store.startTournamentMatch(seededDouble.id, initialBoard.id, { actorName: "Visitor" }), /deelnemers/);
assert.throws(() => store.setTournamentReady(seededDouble.id, roomPlayer.id, false, { actorName: "Visitor" }), /eigen/);
store.setTournamentReady(seededDouble.id, roomPlayer.id, false, { actorName: roomPlayer.name });
assert.equal(store.getTournamentState().tournaments.find(t => t.id === seededDouble.id).matches.find(m => m.id === initialBoard.id).boardId, null);
store.setTournamentReady(seededDouble.id, roomPlayer.id, true, { actorName: roomPlayer.name });
// Auto scheduling can reserve the free board for a different waiting match; manually choose a free board for this one if necessary.
let currentDemo = store.getTournamentState().tournaments.find(t => t.id === seededDouble.id);
const demoReady = currentDemo.matches.find(m => m.boardId !== null && m.status === "ready");
const demoPlayer = currentDemo.participants.find(p => p.id === demoReady.players[0]);
store.startTournamentMatch(seededDouble.id, demoReady.id, { actorName: demoPlayer.name });
assert.throws(() => store.setTournamentReady(seededDouble.id, demoPlayer.id, false), /actieve/);
assert.throws(() => store.recordParticipantTournamentResult(seededDouble.id, demoReady.id, { score: [2, 0] }, "Visitor"), /deelnemers/);
store.recordParticipantTournamentResult(seededDouble.id, demoReady.id, { score: [(demoReady.bestOf + 1) / 2, 0] }, demoPlayer.name);
assert.equal(store.getTournamentState().tournaments.find(t => t.id === seededDouble.id).matches.find(m => m.id === demoReady.id).boardId, null);
const saveAgain = await import("../lib/darts-tournament-store.ts?doubleRestore=1");
assert.equal(saveAgain.getTournamentState().tournaments.find(t => t.id === seededDouble.id).matches.find(m => m.id === demoReady.id).status, "completed");
assert.equal(saveAgain.getTournamentState().tournaments.filter(t => t.id === seededDouble.id).length, 1);
console.log("Tournament room store checks passed: self readiness, viewer denial, start/result ownership, active-match pause protection, board release and DE persistence.");

function concurrencyCup(name) {
  let cup = store.createTournament({ name, settings: { maxPlayers: 4, minRating: 0, minMatches: 0, vipOnly: false, approvalRequired: false, requireRules: false, requireCheckIn: false, restSeconds: 0 } });
  store.addTournamentParticipant(cup.id, { name: "ConcurrentA" }); store.addTournamentParticipant(cup.id, { name: "ConcurrentB" });
  store.setTournamentStatus(cup.id, "registration"); store.generateTournamentBracket(cup.id); cup = store.startTournament(cup.id);
  return { cup, match: cup.matches.find(m => m.status === "ready" && m.boardId !== null) };
}
const concurrentOne = concurrencyCup("Exclusiviteit A"); const concurrentTwo = concurrencyCup("Exclusiviteit B");
store.startTournamentMatch(concurrentOne.cup.id, concurrentOne.match.id);
assert.throws(() => store.startTournamentMatch(concurrentTwo.cup.id, concurrentTwo.match.id), /speelt al/);
store.recordTournamentResult(concurrentOne.cup.id, concurrentOne.match.id, { score: [(concurrentOne.match.bestOf + 1) / 2, 0] });
assert.equal(store.startTournamentMatch(concurrentTwo.cup.id, concurrentTwo.match.id).matches.find(m => m.id === concurrentTwo.match.id).status, "playing");
console.log("Cross-tournament start exclusivity passed.");
