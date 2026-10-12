/** Tab-local prototype navigation, never real authentication or authorization. */
export const DEMO_SESSION_KEY = "dartspoint-demo-session-v1";
export const DEMO_PROFILE_SESSION_KEY = "dartspoint-demo-profile-v1";
export type DemoSessionProfile = { username: string; role: "player"; rating: 1500 };

export function readDemoSession(): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(DEMO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function startDemoSession(profile?: DemoSessionProfile): void {
  try {
    if (profile) window.sessionStorage.setItem(DEMO_PROFILE_SESSION_KEY, JSON.stringify({ username: profile.username, role: "player", rating: 1500 }));
    else window.sessionStorage.removeItem(DEMO_PROFILE_SESSION_KEY);
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "1");
  } catch {
    // Private browser modes may disable storage; the prototype remains usable.
  }
}

export function readDemoSessionProfile(): DemoSessionProfile | null {
  try {
    if (!readDemoSession()) return null;
    const value = JSON.parse(window.sessionStorage.getItem(DEMO_PROFILE_SESSION_KEY) ?? "null");
    return value && /^[A-Za-z0-9_-]{3,20}$/.test(value.username) && value.role === "player" && value.rating === 1500 ? { username: value.username, role: "player", rating: 1500 } : null;
  } catch { return null; }
}

export function endDemoSession(): void {
  try {
    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
    window.sessionStorage.removeItem(DEMO_PROFILE_SESSION_KEY);
  } catch {
    // Logging out of the prototype must also work when storage is unavailable.
  }
}
