import { normalizeGameRules, type GameRules } from "./darts-game-state";

export type MatchSetup = { rules: GameRules; ranked: boolean };
export const MATCH_SETUP_KEY = "dartspoint-match-setup-v1";
export const MATCH_AUTO_START_KEY = "dartspoint-match-auto-start-v1";
export const DEFAULT_MATCH_SETUP: MatchSetup = {
  rules: { startScore: 501, doubleIn: false, doubleOut: true, format: "legs", bestOf: 3, bestOfSets: 3 },
  ranked: false,
};

export function normalizeMatchSetup(input?: { rules?: Partial<GameRules>; ranked?: boolean } | null): MatchSetup {
  return { rules: normalizeGameRules(input?.rules || DEFAULT_MATCH_SETUP.rules), ranked: input?.ranked === true };
}

/** Read a user's invitation preferences; never replaces a running match. */
export function readMatchSetup(): MatchSetup {
  if (typeof window === "undefined") return normalizeMatchSetup();
  try {
    const raw = sessionStorage.getItem(MATCH_SETUP_KEY);
    const setup = raw ? JSON.parse(raw) : null;
    return normalizeMatchSetup(setup || { ranked: sessionStorage.getItem("dartspoint-match-mode-v1") === "ranked-demo" });
  } catch { return normalizeMatchSetup(); }
}

/** Explicit invitation acceptance starts a new local demo and preserves its rules. */
export function selectMatchSetup(opponent: string, input: MatchSetup): MatchSetup {
  const setup = normalizeMatchSetup(input);
  if (typeof window !== "undefined") {
    sessionStorage.setItem(MATCH_SETUP_KEY, JSON.stringify(setup));
    sessionStorage.setItem("dartspoint-opponent-v1", opponent);
    sessionStorage.setItem("dartspoint-match-mode-v1", setup.ranked ? "ranked-demo" : "casual");
    sessionStorage.setItem("dartspoint-new-match-v1", "1");
    sessionStorage.setItem(MATCH_AUTO_START_KEY, "1");
    sessionStorage.removeItem("dartspoint-spectate-v1");
    sessionStorage.removeItem("dartspoint-open-room-v1");
  }
  return setup;
}

export function matchRulesLabel(rules: GameRules): string {
  return `${rules.startScore} · ${rules.doubleIn ? "Dubbel in, " : ""}${rules.doubleOut ? "dubbel uit" : "enkel uit"}`;
}

export function matchFormatLabel(rules: GameRules): string {
  return rules.format === "sets"
    ? `Best of ${rules.bestOfSets} sets · best of ${rules.bestOf} legs per set`
    : `Best of ${rules.bestOf} ${rules.bestOf === 1 ? "leg" : "legs"}`;
}
