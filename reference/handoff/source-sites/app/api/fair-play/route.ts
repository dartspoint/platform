import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { fairPlayDarts, fairPlayGames } from "@/db/schema";
import { advanceFairPlayState, initialFairPlayState, restoreFairPlayState, validThrowCoordinates } from "@/lib/darts-fair-play-state";
import { normalizeGameRules, type GameRules } from "@/lib/darts-match-rules";
import { opponentTarget } from "@/lib/darts-rules";
import type { FairPlayState, FairPlayThrowResult } from "@/lib/darts-fair-play-client";

const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
const answer = (data: unknown, status = 200) => Response.json(data, { status, headers });
const failure = (error: string, code: string, status: number) => answer({ error, code }, status);
async function hash(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return failure("Deze aanvraag komt niet uit DartsPoint.", "origin", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return failure("JSON verwacht.", "content_type", 415);
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return failure("Aanvraag te groot.", "size", 413);
  let data: Record<string, unknown>;
  try {
    const body = await request.text();
    if (body.length > 4096) return failure("Aanvraag te groot.", "size", 413);
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return failure("Ongeldige aanvraag.", "body", 400);
    data = parsed as Record<string, unknown>;
  } catch { return failure("Ongeldige aanvraag.", "body", 400); }

  try {
    const db = getDb();
    const now = Date.now();
    if (data.action === "start") {
      let rules: GameRules;
      try { rules = normalizeGameRules(data.rules === undefined ? {} : data.rules as Partial<GameRules>); }
      catch { return failure("Ongeldige wedstrijdregels. Kies 301, 501 of 701 en een geldig aantal legs of sets.", "rules", 400); }
      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      const gameId = crypto.randomUUID();
      const starter = data.starter === 0 || data.starter === 1 ? data.starter : crypto.getRandomValues(new Uint8Array(1))[0] % 2 as 0 | 1;
      const state = initialFairPlayState(starter, rules);
      await db.insert(fairPlayGames).values({ id: gameId, tokenHash: await hash(token), state: JSON.stringify(state), sequence: 0, createdAt: now, lastThrowAt: 0, expiresAt: now + 24 * 60 * 60 * 1000 });
      return answer({ gameId, token, state, eligibleForRating: false });
    }

    if (typeof data.gameId !== "string" || typeof data.token !== "string" || data.gameId.length > 64 || data.token.length > 100) return failure("Wedstrijdsessie ontbreekt.", "session", 401);
    const game = await db.select().from(fairPlayGames).where(eq(fairPlayGames.id, data.gameId)).get();
    if (!game || game.tokenHash !== await hash(data.token) || game.expiresAt < now) return failure("Deze wedstrijdsessie is verlopen.", "session", 401);
    const current = restoreFairPlayState(JSON.parse(game.state) as FairPlayState);
    if (data.action === "state") return answer({ state: current });
    if (data.action === "forfeit") {
      if (current.status === "finished") return answer({ state: current });
      const state: FairPlayState = { ...current, status: "finished", winner: 1 };
      const changed = await db.update(fairPlayGames).set({ state: JSON.stringify(state) }).where(and(eq(fairPlayGames.id, game.id), eq(fairPlayGames.sequence, game.sequence), eq(fairPlayGames.state, game.state))).returning({ id: fairPlayGames.id });
      if (!changed.length) return failure("De wedstrijd is net gewijzigd. Haal de huidige stand opnieuw op.", "sequence", 409);
      return answer({ state });
    }
    if (data.action !== "throw" && data.action !== "bot") return failure("Onbekende actie.", "action", 400);
    if (typeof data.sequence !== "number" || !Number.isSafeInteger(data.sequence) || data.sequence < 1 || data.sequence > 20000) return failure("Ongeldig worpnummer.", "sequence", 400);

    const isBot = data.action === "bot";
    if (!isBot && !validThrowCoordinates(data.x, data.y)) return failure("Ongeldige worpcoördinaten.", "coordinates", 400);
    if (!isBot && (typeof data.elapsedMs !== "number" || !Number.isFinite(data.elapsedMs) || data.elapsedMs < 120 || data.elapsedMs > 120000)) return failure("De timing van deze worp is ongeldig. Probeer opnieuw.", "timing", 422);
    const fingerprint = await hash(JSON.stringify(isBot ? { action: "bot", sequence: data.sequence } : { action: "throw", sequence: data.sequence, x: data.x, y: data.y, elapsedMs: data.elapsedMs }));
    const receipt = async () => db.select().from(fairPlayDarts).where(and(eq(fairPlayDarts.gameId, game.id), eq(fairPlayDarts.sequence, data.sequence as number))).get();
    const prior = await receipt();
    if (prior) return prior.fingerprint === fingerprint ? answer({ ...(JSON.parse(prior.result) as FairPlayThrowResult), replayed: true }) : failure("Dit worpnummer is al gebruikt voor een andere worp.", "duplicate", 409);
    if (current.status === "finished") return failure("Deze wedstrijd is afgelopen.", "finished", 409);
    if (data.sequence !== game.sequence + 1) return failure("De volgorde van de worpen klopt niet. Haal de huidige stand opnieuw op.", "sequence", 409);
    if (current.turn !== (isBot ? 1 : 0)) return failure("Deze speler is niet aan de beurt.", "turn", 409);
    // Client time is only a plausibility check; server time also limits bursts.
    // This does not establish trusted human input or prevent automated aiming.
    if (game.lastThrowAt && now - game.lastThrowAt < 120) return failure("Wacht tot de vorige pijl is verwerkt.", "timing", 429);
    const coordinates = isBot ? opponentTarget(current.scores[1], current.rules.doubleIn && !current.opened[1]) : { x: data.x as number, y: data.y as number };
    const advanced = advanceFairPlayState(current, coordinates);
    const result: FairPlayThrowResult = { ...advanced, sequence: data.sequence, replayed: false };
    // D1 batches are transactional. Optimistic sequence + unique receipts make
    // retries safe and reject two competing requests for the same dart number.
    const results = await db.batch([
      db.update(fairPlayGames).set({ state: JSON.stringify(advanced.state), sequence: data.sequence, lastThrowAt: now }).where(and(eq(fairPlayGames.id, game.id), eq(fairPlayGames.sequence, game.sequence), eq(fairPlayGames.state, game.state))).returning({ id: fairPlayGames.id }),
      db.insert(fairPlayDarts).select(db.select({
        id: sql<string>`${crypto.randomUUID()}`.as("id"),
        gameId: sql<string>`${game.id}`.as("game_id"),
        sequence: sql<number>`${data.sequence}`.as("sequence"),
        fingerprint: sql<string>`${fingerprint}`.as("fingerprint"),
        result: sql<string>`${JSON.stringify(result)}`.as("result"),
        createdAt: sql<number>`${now}`.as("created_at"),
      }).from(fairPlayGames).where(and(eq(fairPlayGames.id, game.id), eq(fairPlayGames.sequence, data.sequence), eq(fairPlayGames.lastThrowAt, now), eq(fairPlayGames.state, JSON.stringify(advanced.state))))).onConflictDoNothing(),
    ]);
    if (!results[0].length) {
      const settled = await receipt();
      return settled?.fingerprint === fingerprint ? answer({ ...(JSON.parse(settled.result) as FairPlayThrowResult), replayed: true }) : failure("Deze worp is al verwerkt of de wedstrijd is gewijzigd.", "sequence", 409);
    }
    return answer(result);
  } catch {
    // No request bodies, capability tokens or database details in responses.
    return failure("De wedstrijdcontrole is tijdelijk niet bereikbaar. Je worp is niet bevestigd.", "unavailable", 503);
  }
}
