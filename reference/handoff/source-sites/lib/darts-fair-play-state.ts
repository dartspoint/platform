import { scoreDart, type DartHit } from "./darts-rules";
import { advanceMatchScoring, initialMatchScoring, restoreMatchScoring, type GameRules } from "./darts-match-rules";
import type { FairPlayState } from "./darts-fair-play-client";

export function initialFairPlayState(starter: 0 | 1, rules: Partial<GameRules> = {}): FairPlayState {
  return { ...initialMatchScoring(starter, rules), sequence: 0, status: "playing", lastEvent: null };
}

export function restoreFairPlayState(state: FairPlayState): FairPlayState {
  return restoreMatchScoring(state);
}

export function validThrowCoordinates(x: unknown, y: unknown): x is number {
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 1.2 && Math.abs(y) <= 1.2;
}

/** Recompute the hit from coordinates; never accept client-supplied points. */
export function advanceFairPlayState(previous: FairPlayState, coordinates: Pick<DartHit, "x" | "y">): { state: FairPlayState; hit: DartHit } {
  const state = restoreFairPlayState(previous);
  if (state.status !== "playing") throw new Error("Deze wedstrijd is afgelopen.");
  if (!validThrowCoordinates(coordinates.x, coordinates.y)) throw new Error("Ongeldige worpcoördinaten.");
  const hit = scoreDart(coordinates.x, coordinates.y);
  const result = advanceMatchScoring(state, hit);
  const lastEvent = { sequence: state.sequence + 1, player: state.turn, hit, bust: result.bust, checkout: result.checkout, remaining: result.remaining, credited: result.credited, ignoredOnEntry: result.ignored };
  return { hit, state: { ...state, ...result.state, sequence: lastEvent.sequence, status: result.state.winner === null ? "playing" : "finished", lastEvent } };
}
