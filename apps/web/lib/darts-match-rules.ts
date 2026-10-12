import { applyDart, type DartHit } from "./darts-rules";

export type GameRules = {
  startScore: 301 | 501 | 701;
  doubleIn: boolean;
  doubleOut: boolean;
  /** Best of legs in a legs match, or best of legs within each set. */
  bestOf: number;
  format: "legs" | "sets";
  bestOfSets: number;
};
export const DEFAULT_GAME_RULES: GameRules = { startScore: 501, doubleIn: false, doubleOut: true, bestOf: 3, format: "legs", bestOfSets: 3 };

/** Shared validation for setup, local gameplay and server-created matches. */
export function normalizeGameRules(input: Partial<GameRules> = {}): GameRules {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Ongeldige wedstrijdregels.");
  const rules = { ...DEFAULT_GAME_RULES, ...input, doubleIn: input.doubleIn === undefined ? input.startScore === 301 : input.doubleIn };
  if (![301, 501, 701].includes(rules.startScore)
    || typeof rules.doubleIn !== "boolean" || typeof rules.doubleOut !== "boolean"
    || !["legs", "sets"].includes(rules.format)
    || !Number.isInteger(rules.bestOf) || rules.bestOf < 1 || rules.bestOf > 21 || rules.bestOf % 2 !== 1
    || !Number.isInteger(rules.bestOfSets) || rules.bestOfSets < 1 || rules.bestOfSets > 7 || rules.bestOfSets % 2 !== 1) throw new Error("Ongeldige wedstrijdregels.");
  return rules;
}

export type MatchScoringState = {
  rules: GameRules;
  scores: [number, number];
  /** In sets format these are legs in the current set. */
  legs: [number, number];
  sets: [number, number];
  totalLegs: [number, number];
  opened: [boolean, boolean];
  turn: 0 | 1;
  dartsLeft: number;
  visitStart: number;
  visitOpened: boolean;
  starter: 0 | 1;
  winner: 0 | 1 | null;
};

export function initialMatchScoring(starter: 0 | 1 = 0, input: Partial<GameRules> = {}): MatchScoringState {
  const rules = normalizeGameRules(input);
  return { rules, scores: [rules.startScore, rules.startScore], legs: [0, 0], sets: [0, 0], totalLegs: [0, 0], opened: [!rules.doubleIn, !rules.doubleIn], turn: starter, dartsLeft: 3, visitStart: rules.startScore, visitOpened: !rules.doubleIn, starter, winner: null };
}

/** Old stored games always used straight-in; do not change their rules on reload. */
export function restoreMatchScoring<T extends Partial<MatchScoringState>>(state: T): T & MatchScoringState {
  const rules = normalizeGameRules({ ...state.rules, doubleIn: state.rules?.doubleIn ?? false });
  const base = initialMatchScoring(state.starter ?? 0, rules);
  return { ...base, ...state, rules, sets: state.sets ?? [0, 0], totalLegs: state.totalLegs ?? [...(state.legs ?? [0, 0])], opened: state.opened ?? [!rules.doubleIn, !rules.doubleIn], visitOpened: state.visitOpened ?? !rules.doubleIn };
}

/** All match progression is shared: browser animation and server cannot differ. */
export function advanceMatchScoring(previous: MatchScoringState, hit: DartHit) {
  const state = restoreMatchScoring(previous);
  const { rules, turn: player } = state;
  const opened: [boolean, boolean] = [...state.opened];
  const ignored = rules.doubleIn && !opened[player] && !hit.double;
  const openedThisThrow = rules.doubleIn && !opened[player] && hit.double;
  if (openedThisThrow) opened[player] = true;
  const credited = ignored ? 0 : hit.score;
  const effectiveHit = ignored ? { ...hit, score: 0 } : hit;
  const rawRemaining = state.scores[player] - credited;
  const result = ignored ? { remaining: state.scores[player], bust: false, checkout: false }
    : rules.doubleOut ? applyDart(state.scores[player], state.visitStart, effectiveHit)
      : { remaining: rawRemaining < 0 ? state.visitStart : rawRemaining, bust: rawRemaining < 0, checkout: rawRemaining === 0 };
  const scores: [number, number] = [...state.scores];
  const legs: [number, number] = [...state.legs];
  const sets: [number, number] = [...state.sets];
  const totalLegs: [number, number] = [...state.totalLegs];
  scores[player] = result.remaining;
  if (result.bust) opened[player] = state.visitOpened;
  let setWon = false;
  let next: MatchScoringState;
  if (result.checkout) {
    legs[player] += 1;
    totalLegs[player] += 1;
    const legsWon = legs[player] >= (rules.bestOf + 1) / 2;
    setWon = rules.format === "sets" && legsWon;
    if (setWon) sets[player] += 1;
    const matchWon = rules.format === "sets" ? sets[player] >= (rules.bestOfSets + 1) / 2 : legsWon;
    if (setWon && !matchWon) { legs[0] = 0; legs[1] = 0; }
    const nextStarter = rules.format === "sets"
      ? (state.starter + sets[0] + sets[1] + legs[0] + legs[1]) % 2
      : (state.starter + totalLegs[0] + totalLegs[1]) % 2;
    next = { ...state, scores: matchWon ? scores : [rules.startScore, rules.startScore], legs, sets, totalLegs,
      opened: matchWon ? opened : [!rules.doubleIn, !rules.doubleIn], turn: matchWon ? player : nextStarter as 0 | 1,
      dartsLeft: 3, visitStart: rules.startScore, visitOpened: !rules.doubleIn, winner: matchWon ? player : null };
  } else {
    const endVisit = result.bust || state.dartsLeft === 1;
    const turn = (endVisit ? 1 - player : player) as 0 | 1;
    next = { ...state, scores, opened, turn, dartsLeft: endVisit ? 3 : state.dartsLeft - 1,
      visitStart: endVisit ? scores[turn] : state.visitStart, visitOpened: endVisit ? opened[turn] : state.visitOpened };
  }
  return { state: next, ...result, credited, ignored, openedThisThrow, setWon, rawRemaining };
}
