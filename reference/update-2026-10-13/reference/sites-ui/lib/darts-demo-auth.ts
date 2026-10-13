import { players } from "@/lib/darts-data";

/** A local interaction prototype, never an authentication or authorization service. */
export const DEMO_OTP_TTL_MS = 10 * 60 * 1000;
export const DEMO_OTP_RESEND_MS = 60 * 1000;
export const DEMO_OTP_MAX_ATTEMPTS = 5;
export const DEMO_OTP_SEND_WINDOW_MS = 15 * 60 * 1000;
export const DEMO_OTP_MAX_SENDS = 5;
export const DEMO_AUTH_PROFILES_KEY = "dartspoint:demo-auth-profiles:v1";

export type DemoOtpChallenge = { code: string; issuedAt: number; expiresAt: number; attempts: number };
export type DemoAuthProfile = { emailFingerprint: string; username: string; role: "player"; rating: 1500; createdAt: number };
export type DemoOtpStatus = "verified" | "incorrect" | "invalid-format" | "expired" | "locked";

const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "moderator", "mod", "owner", "eigenaar", "support",
  "system", "dartspoint", "beheer", "beheerder", "helpdesk", "security", "dartspointteam",
]);

export function normalizeDemoEmail(value: string): string { return value.trim().toLowerCase(); }
export function isValidDemoEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export function sanitizeOtpInput(value: string): string { return value.replace(/\D/g, "").slice(0, 6); }

export function makeDemoOtpChallenge(now: number, code: string): DemoOtpChallenge {
  if (!/^\d{6}$/.test(code)) throw new Error("Demo OTP must contain six digits.");
  return { code, issuedAt: now, expiresAt: now + DEMO_OTP_TTL_MS, attempts: 0 };
}

export function verifyDemoOtp(challenge: DemoOtpChallenge, code: string, now: number): { status: DemoOtpStatus; challenge: DemoOtpChallenge } {
  if (now >= challenge.expiresAt) return { status: "expired", challenge };
  if (challenge.attempts >= DEMO_OTP_MAX_ATTEMPTS) return { status: "locked", challenge };
  if (!/^\d{6}$/.test(code)) return { status: "invalid-format", challenge };
  if (code === challenge.code) return { status: "verified", challenge };
  const attempted = { ...challenge, attempts: challenge.attempts + 1 };
  return { status: attempted.attempts >= DEMO_OTP_MAX_ATTEMPTS ? "locked" : "incorrect", challenge: attempted };
}

export function demoOtpSendWait(sentAt: number[], now: number): number {
  const recent = sentAt.filter(at => now - at < DEMO_OTP_SEND_WINDOW_MS);
  const cooldown = recent.length ? recent[recent.length - 1] + DEMO_OTP_RESEND_MS - now : 0;
  const window = recent.length >= DEMO_OTP_MAX_SENDS ? recent[recent.length - DEMO_OTP_MAX_SENDS] + DEMO_OTP_SEND_WINDOW_MS - now : 0;
  return Math.max(0, cooldown, window);
}

export function usernameProblem(value: string, profiles: DemoAuthProfile[], currentFingerprint = ""): string | null {
  const username = value.trim();
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(username)) return "Kies 3–20 tekens: letters A–Z, cijfers, een streepje of underscore.";
  const key = username.toLowerCase();
  if (RESERVED_USERNAMES.has(key)) return "Deze naam is gereserveerd. Kies een andere spelersnaam.";
  if (players.some(player => player.name.toLowerCase() === key) || profiles.some(profile => profile.emailFingerprint !== currentFingerprint && profile.username.toLowerCase() === key)) return "Deze spelersnaam is al in gebruik. Probeer een andere naam.";
  return null;
}

/** Only a digest is persisted, never the typed email or an OTP. This is not security. */
export async function demoEmailFingerprint(email: string): Promise<string> {
  const data = new TextEncoder().encode(`dartspoint-local-demo:${normalizeDemoEmail(email)}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function createDemoOtpCode(): string {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return String(value[0] % 1_000_000).padStart(6, "0");
}

export function readDemoAuthProfiles(): DemoAuthProfile[] {
  try {
    if (typeof window === "undefined") return [];
    const value: unknown = JSON.parse(window.localStorage.getItem(DEMO_AUTH_PROFILES_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is DemoAuthProfile => Boolean(entry && typeof entry === "object" && typeof entry.emailFingerprint === "string" && typeof entry.username === "string" && /^[a-f0-9]{64}$/.test(entry.emailFingerprint) && /^[A-Za-z0-9_-]{3,20}$/.test(entry.username) && entry.role === "player" && entry.rating === 1500 && Number.isFinite(entry.createdAt)));
  } catch { return []; }
}

export function saveDemoAuthProfile(profile: DemoAuthProfile): boolean {
  try {
    const profiles = readDemoAuthProfiles().filter(saved => saved.emailFingerprint !== profile.emailFingerprint);
    window.localStorage.setItem(DEMO_AUTH_PROFILES_KEY, JSON.stringify([...profiles, profile]));
    return true;
  } catch { return false; }
}
