import type { DartHit } from "./darts-rules";
import type { GameRules, MatchScoringState } from "./darts-match-rules";

export type FairPlayState = MatchScoringState & {
  sequence: number;
  status: "playing" | "finished";
  lastEvent: { sequence: number; player: 0 | 1; hit: DartHit; bust: boolean; checkout: boolean; remaining: number; credited?: number; ignoredOnEntry?: boolean } | null;
};
export type FairPlaySession = {
  gameId: string;
  token: string;
  state: FairPlayState;
  /** This capability authorises a demo game, never a real player's rating. */
  eligibleForRating: false;
};
export type FairPlayThrowResult = {
  hit: DartHit;
  state: FairPlayState;
  sequence: number;
  replayed: boolean;
};

export class FairPlayError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); this.name = "FairPlayError"; }
}

async function fairPlayRequest<T>(body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("/api/fair-play", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store", signal: controller.signal,
    });
    const data = await response.json() as T & { error?: string; code?: string };
    if (!response.ok) throw new FairPlayError(data.error ?? "De wedstrijdcontrole is tijdelijk niet bereikbaar.", response.status, data.code ?? "server");
    return data;
  } finally { clearTimeout(timeout); }
}

export function startFairPlayGame(options: { opponent: string; mode: "ranked" | "casual"; starter?: 0 | 1; rules?: Partial<GameRules> }) {
  return fairPlayRequest<FairPlaySession>({ action: "start", ...options });
}

export function submitFairPlayThrow(session: Pick<FairPlaySession, "gameId" | "token">, dart: { sequence: number; x: number; y: number; elapsedMs: number }) {
  return fairPlayRequest<FairPlayThrowResult>({ action: "throw", gameId: session.gameId, token: session.token, ...dart });
}

export function requestFairPlayBot(session: Pick<FairPlaySession, "gameId" | "token">, dart: { sequence: number }) {
  return fairPlayRequest<FairPlayThrowResult>({ action: "bot", gameId: session.gameId, token: session.token, ...dart });
}

export function getFairPlayState(session: Pick<FairPlaySession, "gameId" | "token">) {
  return fairPlayRequest<{ state: FairPlayState }>({ action: "state", gameId: session.gameId, token: session.token });
}

export function forfeitFairPlayGame(session: Pick<FairPlaySession, "gameId" | "token">) {
  return fairPlayRequest<{ state: FairPlayState }>({ action: "forfeit", gameId: session.gameId, token: session.token });
}
