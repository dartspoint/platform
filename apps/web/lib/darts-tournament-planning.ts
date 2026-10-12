import { eligibilityReasons, progressTournament, type Tournament, type TournamentMatch } from "./darts-tournament-model";

/** Read-only blockers, shared by manual assignment, auto planner and participant entry. */
export function getMatchPlanningReasons(tournament: Tournament, match: TournamentMatch, now = Date.now()): string[] {
  const reasons: string[] = [];
  if (tournament.status !== "live") reasons.push("Het toernooi is niet live");
  if (!["ready", "playing"].includes(match.status) || !match.players.every(Boolean)) reasons.push("Wacht op voorgaande wedstrijden");
  if (match.players[0] && match.players[0] === match.players[1]) reasons.push("Een speler kan niet tegen zichzelf spelen");
  for (const id of match.players) {
    if (!id) continue;
    const player = tournament.participants.find(p => p.id === id);
    if (!player || !["confirmed", "checkedin"].includes(player.status)) { reasons.push("Deelnemer niet toegelaten"); continue; }
    if (eligibilityReasons(tournament, player).length) reasons.push(`${player.name}: voldoet niet aan deelnamevoorwaarden`);
    if (tournament.settings.requireCheckIn && player.status !== "checkedin") reasons.push(`${player.name}: check-in ontbreekt`);
    if (!player.ready) reasons.push(`${player.name}: nog niet klaar`);
    if (tournament.matches.some(other => other.id !== match.id && other.boardId !== null && ["ready", "playing"].includes(other.status) && other.players.includes(id))) reasons.push(`${player.name}: al aan een ander bord`);
    if (match.status !== "playing") {
      const lastAt = Math.max(0, ...tournament.matches.filter(other => other.id !== match.id && other.status === "completed" && other.result?.kind === "played" && other.players.includes(id)).map(other => other.result!.at));
      const remaining = Math.ceil((lastAt + tournament.settings.restSeconds * 1000 - now) / 1000);
      if (lastAt && remaining > 0) reasons.push(`${player.name}: nog ${remaining}s rust`);
    }
  }
  return [...new Set(reasons)];
}
export function planTournamentBoards(value: Tournament, now = Date.now()): Tournament {
  const tournament = progressTournament(value);
  const matches = tournament.matches; const boards = new Set<number>(); const players = new Set<string>();
  // Running matches have first claim; queued assignments keep their place when still valid.
  const assigned = [...matches].sort((a, b) => Number(b.status === "playing") - Number(a.status === "playing"));
  for (const match of assigned) {
    if (match.boardId === null) continue;
    const valid = tournament.status === "live" && ["ready", "playing"].includes(match.status) && match.boardId >= 1 && match.boardId <= tournament.settings.boardCount && !boards.has(match.boardId) && !match.players.some(p => p && players.has(p)) && !getMatchPlanningReasons(tournament, match, now).length;
    if (!valid) { match.boardId = null; match.assignedAt = null; match.startedAt = null; if (match.status === "playing") match.status = "ready"; }
    else { boards.add(match.boardId); match.players.forEach(p => { if (p) players.add(p); }); }
  }
  if (tournament.status !== "live" || tournament.settings.scheduling !== "automatic") return tournament;
  // The source graph gives depth, so newly available lower-bracket matches cannot starve forever.
  const depths = new Map<string, number>();
  const depth = (match: TournamentMatch): number => { if (depths.has(match.id)) return depths.get(match.id)!; const d = Math.max(-1, ...match.sources.map(s => s ? depth(matches.find(m => m.id === s.matchId)!) : -1)) + 1; depths.set(match.id, d); return d; };
  const waiting = matches.filter(m => m.status === "ready" && m.boardId === null).sort((a, b) => depth(a) - depth(b) || a.round - b.round || a.index - b.index || a.id.localeCompare(b.id));
  for (const match of waiting) {
    if (boards.size >= tournament.settings.boardCount) break;
    if (getMatchPlanningReasons(tournament, match, now).length || match.players.some(p => p && players.has(p))) continue;
    let board = 1; while (boards.has(board)) board++;
    match.boardId = board; match.assignedAt = now; boards.add(board); match.players.forEach(p => { if (p) players.add(p); });
  }
  return tournament;
}
export function assignTournamentBoardPure(value: Tournament, matchId: string, boardId: number | null, now = Date.now()): Tournament {
  const tournament = progressTournament(value); const match = tournament.matches.find(m => m.id === matchId);
  if (!match || match.status !== "ready") throw new Error("Alleen een startklare wedstrijd kan worden ingedeeld.");
  if (boardId === null) { match.boardId = null; match.assignedAt = null; return tournament; }
  if (!Number.isInteger(boardId) || boardId < 1 || boardId > tournament.settings.boardCount) throw new Error("Kies een geldig bord.");
  const reasons = getMatchPlanningReasons(tournament, match, now); if (reasons.length) throw new Error(reasons.join(" · "));
  if (tournament.matches.some(m => m.id !== matchId && m.boardId === boardId && ["ready", "playing"].includes(m.status))) throw new Error("Dit bord is al bezet.");
  match.boardId = boardId; match.assignedAt = now; return tournament;
}
export function startTournamentMatchPure(value: Tournament, matchId: string, now = Date.now()): Tournament {
  const tournament = progressTournament(value); const match = tournament.matches.find(m => m.id === matchId);
  if (!match || match.status !== "ready" || match.boardId === null) throw new Error("De wedstrijd moet eerst aan een bord zijn toegewezen.");
  const reasons = getMatchPlanningReasons(tournament, match, now); if (reasons.length) throw new Error(reasons.join(" · "));
  match.status = "playing"; match.startedAt = now; return tournament;
}
export function getTournamentMatchAccess(tournament: Tournament, matchId: string, name: string, now = Date.now()): { canWatch: true; canPlay: boolean; reason: string; participantId: string | null } {
  const participant = tournament.participants.find(p => p.name.toLowerCase() === name.toLowerCase() && ["confirmed", "checkedin"].includes(p.status));
  const match = tournament.matches.find(m => m.id === matchId);
  if (!participant || !match?.players.includes(participant.id)) return { canWatch: true, canPlay: false, participantId: participant?.id ?? null, reason: "Alleen de ingedeelde deelnemers spelen; iedereen kan toekijken." };
  const reasons = getMatchPlanningReasons(tournament, match, now);
  if (match.boardId === null) reasons.unshift("Nog geen bord toegewezen");
  return { canWatch: true, canPlay: !reasons.length, participantId: participant.id, reason: reasons.join(" · ") };
}
