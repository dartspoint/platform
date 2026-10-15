// 15 October 2026, 20:00 in Europe/Amsterdam (CEST, UTC+02:00).
export const OPENING_AT = Date.parse('2026-10-15T20:00:00+02:00');

export function openingStatus(serverNow = Date.now()) {
  return {serverNow, opensAt: OPENING_AT, open: serverNow >= OPENING_AT};
}
