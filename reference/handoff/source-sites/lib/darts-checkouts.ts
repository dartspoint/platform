export type CheckoutRoute = readonly string[];

type Target = {
  label: string;
  points: number;
  kind: "single" | "double" | "triple" | "outer-bull" | "bull";
};

type Candidate = {
  targets: readonly Target[];
  preference: number;
  finishPreference: number;
};

const DOUBLE_PREFERENCE = [20, 16, 8, 18, 12, 10, 6, 4, 2, 14, 15, 11, 9, 7, 5, 3, 1, 17, 19, 13];
const FINISHES: readonly Target[] = [
  ...DOUBLE_PREFERENCE.map((number) => ({ label: `D${number}`, points: number * 2, kind: "double" as const })),
  { label: "BULL", points: 50, kind: "bull" },
];
const FINISH_BY_SCORE = new Map(FINISHES.map((target) => [target.points, target]));
const SETUPS: readonly Target[] = [
  ...Array.from({ length: 20 }, (_, index) => {
    const number = 20 - index;
    return [
      { label: `T${number}`, points: number * 3, kind: "triple" as const },
      { label: String(number), points: number, kind: "single" as const },
      { label: `D${number}`, points: number * 2, kind: "double" as const },
    ];
  }).flat(),
  { label: "25", points: 25, kind: "outer-bull" },
  { label: "BULL", points: 50, kind: "bull" },
];

function setupPreference(target: Target): number {
  if (target.kind === "single") return (20 - target.points) * 0.08;
  if (target.kind === "triple") return (20 - target.points / 3) * 1.5;
  if (target.kind === "outer-bull") return 16;
  if (target.kind === "bull") return 36;
  // A single or treble is usually a more forgiving setup than a double.
  return 48;
}

function finishPreference(target: Target): number {
  return target.kind === "bull" ? 26 : DOUBLE_PREFERENCE.indexOf(target.points / 2);
}

function candidateFor(setups: readonly Target[], finish: Target): Candidate {
  // Put the large treble first. Swapping the same setup scores is not another option.
  const ordered = [...setups].sort((left, right) => right.points - left.points || setupPreference(left) - setupPreference(right));
  const finishRank = finishPreference(finish);
  return {
    targets: [...ordered, finish],
    preference: finishRank * 4 + ordered.reduce((total, target) => total + setupPreference(target), 0),
    finishPreference: finishRank,
  };
}

/**
 * Exact double-out routes using at most the darts still available in this visit.
 * Labels match scoreDart: plain numbers are singles, 25 is the outer bull,
 * and BULL is the inner bull (50 points and a valid finishing double).
 */
export function getCheckoutRoutes(score: number, dartsLeft: number, limit = 4): readonly CheckoutRoute[] {
  if (!Number.isInteger(score) || score < 2 || score > 170 ||
      !Number.isInteger(dartsLeft) || dartsLeft < 1 || dartsLeft > 3 ||
      !Number.isInteger(limit) || limit < 1) return [];

  const direct = FINISH_BY_SCORE.get(score);
  if (direct) return [[direct.label]];
  if (dartsLeft === 1) return [];

  const unique = new Map<string, Candidate>();
  const add = (setups: readonly Target[], finish: Target) => {
    const candidate = candidateFor(setups, finish);
    // Also discard harder ways to make the identical setup score, e.g. D6 vs 12.
    const key = `${candidate.targets.slice(0, -1).map((target) => target.points).join(",")}/${finish.label}`;
    const previous = unique.get(key);
    if (!previous || candidate.preference < previous.preference) unique.set(key, candidate);
  };

  for (const first of SETUPS) {
    const finish = FINISH_BY_SCORE.get(score - first.points);
    if (finish) add([first], finish);
    if (dartsLeft === 3) {
      for (const second of SETUPS) {
        const last = FINISH_BY_SCORE.get(score - first.points - second.points);
        if (last) add([first, second], last);
      }
    }
  }

  const candidates = [...unique.values()].sort((left, right) =>
    left.targets.length - right.targets.length || left.preference - right.preference ||
    right.targets[0].points - left.targets[0].points ||
    left.targets.map((target) => target.label).join(" ").localeCompare(right.targets.map((target) => target.label).join(" ")));
  if (!candidates.length) return [];

  const shortest = candidates[0].targets.length;
  const bestShortFinish = Math.min(...candidates.filter((candidate) => candidate.targets.length === shortest).map((candidate) => candidate.finishPreference));
  return candidates.filter((candidate) => {
    if (candidate.targets.length === shortest) return true;
    // An extra dart is useful when it trades a bull/awkward double for a better
    // double, not when it merely splits a simple single into two smaller scores.
    return candidate.finishPreference < bestShortFinish && candidate.targets.slice(0, -1).some((target) => target.kind === "triple");
  }).slice(0, limit).map((candidate) => candidate.targets.map((target) => target.label));
}
