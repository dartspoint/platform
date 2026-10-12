export const DART_NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;

/** One coordinate system for the painted rings, hit testing and dart tips. */
export const BOARD_GEOMETRY = {
  size: 440, center: 220, bull: 6.35, outerBull: 15.9,
  trebleInner: 99, trebleOuter: 107, doubleInner: 162, doubleOuter: 170,
} as const;

export type DartHit = {
  x: number;
  y: number;
  score: number;
  label: string;
  double: boolean;
};

export function dartTipPosition(hit: Pick<DartHit, "x" | "y">) {
  return { x: BOARD_GEOMETRY.center + hit.x * BOARD_GEOMETRY.doubleOuter, y: BOARD_GEOMETRY.center + hit.y * BOARD_GEOMETRY.doubleOuter };
}

export type DartPose = { x: number; y: number; scale: number; rotation: number; opacity: number };

/** The local SVG tip is (0, 0); every pose rotates/scales around that point. */
export function dartPoseAt(hit: Pick<DartHit, "x" | "y">, progress: number): DartPose {
  const { x, y } = dartTipPosition(hit);
  const startX = BOARD_GEOMETRY.center + hit.x * 12;
  const startY = BOARD_GEOMETRY.size + 16;
  const angle = Math.atan2(x - startX, startY - y) * 180 / Math.PI;
  const end = { x, y, scale: .86, rotation: angle * .55 - 10, opacity: 1 };
  if (progress >= 1) return end;
  const start = { x: startX, y: startY, scale: 3.4, rotation: angle, opacity: 0 };
  const middle = { x: startX + (x - startX) * .55, y: startY + (y - startY) * .55 - 20, scale: 1.8, rotation: angle - 4, opacity: 1 };
  const [from, to, t] = progress <= .4
    ? [start, middle, Math.max(0, progress) / .4] as const
    : [middle, end, (progress - .4) / .6] as const;
  const mix = (a: number, b: number) => a + (b - a) * t;
  return { x: mix(from.x, to.x), y: mix(from.y, to.y), scale: mix(from.scale, to.scale), rotation: mix(from.rotation, to.rotation), opacity: mix(from.opacity, to.opacity) };
}

/** Native SVG transforms never use a path's bounding box as their origin. */
export function dartTransform(pose: DartPose) {
  return `translate(${pose.x} ${pose.y}) rotate(${pose.rotation}) scale(${pose.scale})`;
}

/** Coordinates use the outside edge of the double ring as radius 1. */
export function scoreDart(x: number, y: number): DartHit {
  const r = Math.hypot(x, y);
  if (r > 1) return { x, y, score: 0, label: "MIS", double: false };
  if (r <= BOARD_GEOMETRY.bull / BOARD_GEOMETRY.doubleOuter) return { x, y, score: 50, label: "BULL", double: true };
  if (r <= BOARD_GEOMETRY.outerBull / BOARD_GEOMETRY.doubleOuter) return { x, y, score: 25, label: "25", double: false };
  const degrees = (Math.atan2(x, -y) * 180 / Math.PI + 360 + 9) % 360;
  const number = DART_NUMBERS[Math.floor(degrees / 18)];
  const multiplier = r >= BOARD_GEOMETRY.doubleInner / BOARD_GEOMETRY.doubleOuter ? 2 : r >= BOARD_GEOMETRY.trebleInner / BOARD_GEOMETRY.doubleOuter && r <= BOARD_GEOMETRY.trebleOuter / BOARD_GEOMETRY.doubleOuter ? 3 : 1;
  return { x, y, score: number * multiplier, label: multiplier === 1 ? String(number) : `${multiplier === 2 ? "D" : "T"}${number}`, double: multiplier === 2 };
}

export function applyDart(remaining: number, visitStart: number, hit: DartHit) {
  const next = remaining - hit.score;
  const bust = next < 0 || next === 1 || (next === 0 && !hit.double);
  return { remaining: bust ? visitStart : next, bust, checkout: next === 0 && hit.double };
}

export function opponentTarget(remaining: number, needsDoubleIn = false): DartHit {
  if (needsDoubleIn) {
    const theta = (Math.random() - .5) * .13;
    const radius = .975 + (Math.random() - .5) * .065;
    return scoreDart(Math.sin(theta) * radius, -Math.cos(theta) * radius);
  }
  if (remaining === 50 && Math.random() > .35) return scoreDart((Math.random() - .5) * .06, (Math.random() - .5) * .06);
  if (remaining <= 40 && remaining % 2 === 0) {
    const index = DART_NUMBERS.indexOf(remaining / 2 as typeof DART_NUMBERS[number]);
    const theta = index * Math.PI / 10 + (Math.random() - .5) * .13;
    const radius = .975 + (Math.random() - .5) * .065;
    return scoreDart(Math.sin(theta) * radius, -Math.cos(theta) * radius);
  }
  if (remaining < 62) {
    const wanted = Math.min(20, remaining % 2 === 1 ? 19 : remaining - 40);
    const index = DART_NUMBERS.indexOf(Math.max(1, wanted) as typeof DART_NUMBERS[number]);
    const theta = Math.max(0, index) * Math.PI / 10 + (Math.random() - .5) * .15;
    return scoreDart(Math.sin(theta) * .48, -Math.cos(theta) * .48);
  }
  return scoreDart((Math.random() - .5) * .18, -.606 + (Math.random() - .5) * .18);
}
