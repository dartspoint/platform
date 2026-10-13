import type { DartHit } from "./darts-rules";

export const PRACTICE_STORAGE_KEY = "dartspoint-practice-v1";
export const PRACTICE_CHANGED_EVENT = "dartspoint-practice-changed";

export type PracticeProgress = {
  version: 1;
  dartsThrown: number;
  pointsScored: number;
  highestVisit: number;
  highestCheckout: number;
  oneEighties: number;
  finishes: number;
  distinctDoubles: string[];
  tutorialCompleted: boolean;
  weeks: Record<string, string[]>;
};

export function emptyPracticeProgress(): PracticeProgress {
  return { version: 1, dartsThrown: 0, pointsScored: 0, highestVisit: 0, highestCheckout: 0, oneEighties: 0, finishes: 0, distinctDoubles: [], tutorialCompleted: false, weeks: {} };
}

/** ISO weeks use the Amsterdam calendar day, including at the Sunday boundary. */
export function practiceWeek(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (kind: string) => Number(parts.find(part => part.type === kind)?.value);
  const thursday = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
  const day = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - day);
  const year = thursday.getUTCFullYear();
  const week = Math.ceil((((thursday.getTime() - Date.UTC(year, 0, 1)) / 86400000) + 1) / 7);
  return { id: `${year}-W${String(week).padStart(2, "0")}`, number: week, year };
}

export function practiceChallenge(date = new Date()) {
  const week = practiceWeek(date);
  const doubles = [20, 16, 10, 8, 4, 18, 12, 6, 14, 2, 15, 5, 3, 1, 19, 17, 13, 11, 9, 7];
  const start = ((week.number - 1) * 5) % doubles.length;
  return { ...week, targets: doubles.slice(start, start + 5).map(number => `D${number}`) };
}

export function readPracticeProgress(): PracticeProgress {
  const empty = emptyPracticeProgress();
  if (typeof window === "undefined") return empty;
  try {
    const saved = JSON.parse(localStorage.getItem(PRACTICE_STORAGE_KEY) || "null");
    if (!saved || saved.version !== 1) return empty;
    const natural = (key: string) => typeof saved[key] === "number" && Number.isFinite(saved[key]) && saved[key] >= 0 ? saved[key] : 0;
    const doubles = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((label): label is string => typeof label === "string" && /^D([1-9]|1[0-9]|20)$/.test(label)))] : [];
    return { version: 1, dartsThrown: natural("dartsThrown"), pointsScored: natural("pointsScored"), highestVisit: Math.min(180, natural("highestVisit")), highestCheckout: Math.min(170, natural("highestCheckout")), oneEighties: natural("oneEighties"), finishes: natural("finishes"), distinctDoubles: doubles(saved.distinctDoubles), tutorialCompleted: saved.tutorialCompleted === true, weeks: saved.weeks && typeof saved.weeks === "object" && !Array.isArray(saved.weeks) ? Object.fromEntries(Object.entries(saved.weeks).filter(([week]) => /^\d{4}-W\d{2}$/.test(week)).map(([week, targets]) => [week, doubles(targets)])) : {} };
  } catch { return empty; }
}

let memoryProgress: PracticeProgress | undefined;
const serverProgress = emptyPracticeProgress();

function savePracticeProgress(progress: PracticeProgress) {
  memoryProgress = progress;
  if (typeof window !== "undefined") {
    try { localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(progress)); } catch { /* A private browser can still retain progress until the page closes. */ }
    window.dispatchEvent(new CustomEvent(PRACTICE_CHANGED_EVENT, { detail: progress }));
  }
  return progress;
}

export function currentPracticeProgress() {
  if (typeof window === "undefined") return serverProgress;
  return memoryProgress ??= readPracticeProgress();
}

export function serverPracticeProgress() { return serverProgress; }
export function refreshPracticeProgress() { memoryProgress = readPracticeProgress(); }

export function completePracticeTutorial() {
  return savePracticeProgress({ ...currentPracticeProgress(), tutorialCompleted: true });
}

/** Called once after a real simulated dart lands; never for a target selection. */
export function recordPracticeHit(hit: DartHit, details: { visitTotal?: number; visitComplete?: boolean; checkout?: number; date?: Date } = {}) {
  const previous = currentPracticeProgress();
  const challenge = practiceChallenge(details.date);
  const numberedDouble = /^D([1-9]|1[0-9]|20)$/.test(hit.label);
  const targets = previous.weeks[challenge.id] ?? [];
  const next: PracticeProgress = {
    ...previous,
    dartsThrown: previous.dartsThrown + 1,
    pointsScored: previous.pointsScored + hit.score,
    highestVisit: Math.max(previous.highestVisit, details.visitTotal ?? 0),
    highestCheckout: Math.max(previous.highestCheckout, details.checkout ?? 0),
    oneEighties: previous.oneEighties + (details.visitComplete && details.visitTotal === 180 ? 1 : 0),
    finishes: previous.finishes + (details.checkout ? 1 : 0),
    distinctDoubles: numberedDouble ? [...new Set([...previous.distinctDoubles, hit.label])] : previous.distinctDoubles,
    weeks: { ...previous.weeks, [challenge.id]: numberedDouble && challenge.targets.includes(hit.label) ? [...new Set([...targets, hit.label])] : targets },
  };
  return savePracticeProgress(next);
}

export function practiceBadges(progress: PracticeProgress) {
  return [
    { id: "first-flight", title: "Eerste vlucht", description: "Rond de introductie met vijf pijlen af.", progress: progress.tutorialCompleted ? 1 : 0, total: 1, unlocked: progress.tutorialCompleted },
    { id: "first-finish", title: "Double trouble", description: "Gooi je eerste oefenfinish uit op een dubbel.", progress: Math.min(1, progress.finishes), total: 1, unlocked: progress.finishes > 0 },
    { id: "maximum", title: "One hundred & eighty", description: "Raak drie keer T20 in dezelfde oefenbeurt.", progress: Math.min(1, progress.oneEighties), total: 1, unlocked: progress.oneEighties > 0 },
    { id: "double-collector", title: "Dubbelverzamelaar", description: "Raak tien verschillende genummerde dubbels.", progress: Math.min(10, progress.distinctDoubles.length), total: 10, unlocked: progress.distinctDoubles.length >= 10 },
    { id: "centurion", title: "In het ritme", description: "Gooi honderd pijlen op het oefenbord.", progress: Math.min(100, progress.dartsThrown), total: 100, unlocked: progress.dartsThrown >= 100 },
  ];
}
