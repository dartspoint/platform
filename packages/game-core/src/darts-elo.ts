/** Zero-sum Elo formula shared by legacy match policy 1 and leg policy 2. */
export const ELO_START = 1500;
export const ELO_K = 32;
export const PLACEMENT_MATCHES = 10;
export const PLACEMENT_OPPONENTS = 5;

export type RatingStatus = "white" | "red" | "amber" | "green";
export type RatingProgress = { rating: number; rankedPlayed: number; opponents: readonly string[] };

function checkRating(rating: number) {
  if (!Number.isFinite(rating)) throw new RangeError("Een rating moet een eindig getal zijn.");
}

export function expectedRatingChange(a: number, b: number): { win: number; loss: number } {
  checkRating(a);
  checkRating(b);
  const expected = 1 / (1 + 10 ** ((b - a) / 400));
  return { win: ELO_K * (1 - expected), loss: -ELO_K * expected };
}

export function calculateElo(a: number, b: number, winner: 0 | 1): { a: number; b: number; deltaA: number; deltaB: number; expectedA: number } {
  checkRating(a);
  checkRating(b);
  if (winner !== 0 && winner !== 1) throw new RangeError("De winnaar moet speler 0 of 1 zijn.");
  const expectedA = 1 / (1 + 10 ** ((b - a) / 400));
  const deltaA = ELO_K * ((winner === 0 ? 1 : 0) - expectedA);
  // Both changes use the original ratings. Never round stored ratings.
  const deltaB = -deltaA;
  return { a: a + deltaA, b: b + deltaB, deltaA, deltaB, expectedA };
}

export function isProvisional({ rankedPlayed, opponents }: Omit<RatingProgress, "rating">): boolean {
  return rankedPlayed < PLACEMENT_MATCHES || new Set(opponents).size < PLACEMENT_OPPONENTS;
}

export function ratingStatus(profile: RatingProgress): RatingStatus {
  if (isProvisional(profile)) return "white";
  // Bands describe the visible rating, preventing a red [1450] at 1449.6.
  const displayed = Math.round(profile.rating);
  return displayed < 1450 ? "red" : displayed >= 1550 ? "green" : "amber";
}
