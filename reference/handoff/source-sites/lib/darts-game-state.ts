import type { DartHit } from "./darts-rules";
import { advanceMatchScoring, initialMatchScoring, restoreMatchScoring, type GameRules, type MatchScoringState } from "./darts-match-rules";
export { DEFAULT_GAME_RULES, normalizeGameRules, type GameRules } from "./darts-match-rules";
import type { MatchDartEvent } from "./darts-match-records";

export type Phase = "horizontal" | "vertical" | "flight" | "opponent" | "won";
export type BoardDart = { id: number; hit: DartHit };
export type PendingDart = BoardDart & { opponentName: string };
export type GameCore = MatchScoringState & {
  rules: GameRules;
  scores: [number, number]; legs: [number, number]; turn: 0 | 1;
  dartsLeft: number; phase: Phase; lastVisit: DartHit[]; lastResult: string;
  visitStart: number; freshVisit: boolean; resultTone: "normal" | "good" | "bust";
  winner: 0 | 1 | null; dartCount: [number, number]; pointsScored: [number, number];
  visitScores: [number | null, number | null]; visitBusts: [boolean, boolean];
  landedDarts: BoardDart[];
  id: string; startedAt: number; starter: 0 | 1; events: MatchDartEvent[];
  highestVisit: [number, number]; highestCheckout: [number, number];
  bustReason: string | null; celebration: "180" | "checkout" | null; forfeit: boolean;
};
export type GameState = GameCore & { history: GameCore[]; pendingDart: PendingDart | null };
export type GameAction =
  | { type: "reset"; starter?: 0 | 1; id?: string; at?: number; rules?: Partial<GameRules> }
  | { type: "restore"; state: GameState }
  | { type: "forfeit"; player: 0 | 1 }
  | { type: "undo" }
  | { type: "lock-x" }
  | { type: "launch"; dart: PendingDart }
  | { type: "land"; id: number; at?: number };

function initialCore(starter: 0 | 1 = 0, id = "83626", at = 0, customRules: Partial<GameRules> = {}): GameCore {
  const scoring = initialMatchScoring(starter, customRules);
  return { ...scoring, phase: starter === 0 ? "horizontal" : "opponent", lastVisit: [], lastResult: scoring.rules.doubleIn ? "Raak eerst een dubbel om je leg te openen." : "Stop je richting. Bepaal daarna de hoogte van je worp.", freshVisit: true, resultTone: "normal", dartCount: [0, 0], pointsScored: [0, 0], visitScores: [null, null], visitBusts: [false, false], landedDarts: [], id, startedAt: at, events: [], highestVisit: [0, 0], highestCheckout: [0, 0], bustReason: null, celebration: null, forfeit: false };
}

export function initialGameState(starter: 0 | 1 = 0, id = "83626", at = 0, rules: Partial<GameRules> = {}): GameState {
  return { ...initialCore(starter, id, at, rules), history: [], pendingDart: null };
}

export function dartsGameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === "reset") return initialGameState(action.starter, action.id, action.at, action.rules);
  if (action.type === "restore") return { ...restoreMatchScoring(action.state), history: action.state.history.map(item => restoreMatchScoring(item)) };
  if (action.type === "forfeit") {
    if (state.phase === "won") return state;
    const winner = (1 - action.player) as 0 | 1;
    return { ...state, winner, phase: "won", pendingDart: null, forfeit: true, lastResult: "Wedstrijd beëindigd door opgave.", celebration: null };
  }
  if (action.type === "undo") {
    // Cancelling a flight must never let its later animation callback score it.
    if (state.pendingDart) return { ...state, pendingDart: null, phase: state.turn === 0 ? "horizontal" : "opponent" };
    if (!state.history.length) return state;
    return { ...state.history[state.history.length - 1], history: state.history.slice(0, -1), pendingDart: null };
  }
  if (action.type === "lock-x") return state.phase === "horizontal" ? { ...state, phase: "vertical" } : state;
  if (action.type === "launch") {
    if (state.pendingDart || (state.phase !== "vertical" && state.phase !== "opponent")) return state;
    // Launch only changes the visual state. All match statistics stay settled.
    return { ...state, phase: "flight", pendingDart: action.dart, celebration: null };
  }
  if (action.type !== "land" || state.phase !== "flight" || state.pendingDart?.id !== action.id) return state;

  const { history, pendingDart, ...snapshot } = state;
  const nextHistory = state.turn === 0 ? [...history.slice(-11), { ...snapshot, phase: "horizontal" as const }] : history;
  const { hit, id, opponentName } = pendingDart;
  const current = restoreMatchScoring(state);
  const result = advanceMatchScoring(current, hit);
  const { legs, sets } = result.state;
  const dartCount: [number, number] = [...state.dartCount];
  const pointsScored: [number, number] = [...state.pointsScored];
  const visitScores: [number | null, number | null] = [...state.visitScores];
  const visitBusts: [boolean, boolean] = [...state.visitBusts];
  const lastVisit = [...(state.freshVisit ? [] : state.lastVisit), hit];
  const landedDarts = [...(state.freshVisit ? [] : state.landedDarts), { id, hit }];
  const name = state.turn === 0 ? "Nick" : opponentName;
  dartCount[state.turn] += 1;
  visitScores[state.turn] = result.bust ? 0 : state.visitStart - result.remaining;
  visitBusts[state.turn] = result.bust;
  pointsScored[state.turn] += result.bust ? -(state.visitStart - state.scores[state.turn]) : result.credited;

  const lastEvent = state.events.at(-1);
  const visit = lastEvent ? lastEvent.visit + (state.freshVisit ? 1 : 0) : 1;
  const events: MatchDartEvent[] = [...state.events, { id, player: state.turn, leg: current.totalLegs[0] + current.totalLegs[1] + 1, visit, hit, before: state.scores[state.turn], after: result.remaining, bust: result.bust, checkout: result.checkout, credited: result.credited, ignoredOnEntry: result.ignored, at: action.at ?? 0 }];
  const highestVisit: [number, number] = [...state.highestVisit];
  const highestCheckout: [number, number] = [...state.highestCheckout];
  const completedVisit = result.bust || result.checkout || state.dartsLeft === 1;
  if (completedVisit && !result.bust) highestVisit[state.turn] = Math.max(highestVisit[state.turn], state.visitStart - result.remaining);
  if (result.checkout) highestCheckout[state.turn] = Math.max(highestCheckout[state.turn], state.visitStart);
  const rawRemaining = result.rawRemaining;
  const bustReason = result.bust ? rawRemaining < 0 ? "Te veel punten — je score gaat terug naar het begin van deze beurt." : rawRemaining === 1 ? "1 over — je moet eindigen op een dubbel." : "Je eindigde zonder dubbel — probeer een dubbel of BULL." : null;
  const celebration = result.checkout ? "checkout" as const : completedVisit && !result.bust && state.visitStart - result.remaining === 180 ? "180" as const : null;
  const settled = { events, highestVisit, highestCheckout, bustReason, celebration };

  if (result.checkout) {
    const matchWon = result.state.winner !== null;
    const nextTurn = result.state.turn;
    return {
      ...state, ...result.state, ...settled, pendingDart: null, landedDarts, dartCount, pointsScored,
      visitScores: matchWon ? visitScores : [null, null], visitBusts: matchWon ? visitBusts : [false, false],
      history: nextHistory, lastVisit, freshVisit: true,
      phase: matchWon ? "won" : nextTurn === 0 ? "horizontal" : "opponent",
      lastResult: matchWon ? `${name} wint de wedstrijd!` : result.setWon ? `${name} wint de set · ${sets[0]}–${sets[1]}` : `${name} wint de leg · ${legs[0]}–${legs[1]}`,
      resultTone: "good",
    };
  }

  const endVisit = result.bust || state.dartsLeft === 1;
  const turn = result.state.turn;
  const visitTotal = state.visitStart - result.remaining;
  return {
    ...state, ...result.state, ...settled, pendingDart: null, landedDarts, dartCount, pointsScored, visitScores, visitBusts, turn, lastVisit, history: nextHistory,
    freshVisit: endVisit,
    phase: turn === 1 ? "opponent" : "horizontal",
    lastResult: result.bust ? `${name} · ${bustReason} Score terug naar ${state.visitStart}` : result.ignored ? `${name} · ${hit.label} — eerst een dubbel om te openen` : endVisit ? `${name} · ${visitTotal} punten in deze beurt` : `${name} · ${hit.label === "MIS" ? "Net mis. Volgende pijl!" : `${hit.label} — ${result.credited} punten${result.openedThisThrow ? " · leg geopend" : ""}`}`,
    resultTone: result.bust ? "bust" : result.credited >= 50 ? "good" : "normal",
  };
}
