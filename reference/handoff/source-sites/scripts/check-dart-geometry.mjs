import assert from "node:assert/strict";
import { BOARD_GEOMETRY, dartPoseAt, dartTipPosition, dartTransform, scoreDart } from "../lib/darts-rules.ts";

const numbers = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);
const hitAt = (radius, degrees = 0) => scoreDart(Math.sin(degrees * Math.PI / 180) * radius / 170, -Math.cos(degrees * Math.PI / 180) * radius / 170);

// Independent expected radii: the rendered board must keep these exact rings.
assert.deepEqual(BOARD_GEOMETRY, { size: 440, center: 220, bull: 6.35, outerBull: 15.9, trebleInner: 99, trebleOuter: 107, doubleInner: 162, doubleOuter: 170 });
let verified = 0;
for (const [index, number] of numbers.entries()) {
  for (const [radius, multiplier] of [[50, 1], [98.999, 1], [99.001, 3], [103, 3], [106.999, 3], [107.001, 1], [135, 1], [161.999, 1], [162.001, 2], [166, 2], [169.999, 2], [170.001, 0]]) {
    for (const offset of [-8.99, 0, 8.99]) {
      const hit = hitAt(radius, index * 18 + offset);
      const expected = multiplier === 0 ? "MIS" : `${multiplier === 3 ? "T" : multiplier === 2 ? "D" : ""}${number}`;
      assert.equal(hit.label, expected, `${radius} at ${index * 18 + offset} degrees`);
      assert.equal(hit.score, number * multiplier);
      assert.equal(hit.double, multiplier === 2);
      const pose = dartPoseAt(hit, 1);
      const tip = dartTipPosition(hit);
      close(pose.x, tip.x, "Final tip x");
      close(pose.y, tip.y, "Final tip y");

      // Evaluate the emitted native SVG transform on the actual local tip.
      // Rotation and scale cannot displace (0,0) before translation is applied.
      const match = /^translate\(([-\d.e+]+) ([-\d.e+]+)\) rotate\(([-\d.e+]+)\) scale\(([-\d.e+]+)\)$/.exec(dartTransform(pose));
      assert.ok(match, "Landing uses native translate/rotate/scale, not CSS fill-box");
      const [, tx, ty, degrees, scale] = match.map(Number);
      const radians = degrees * Math.PI / 180;
      const localTip = { x: 0, y: 0 };
      const drawnTip = { x: tx + scale * (Math.cos(radians) * localTip.x - Math.sin(radians) * localTip.y), y: ty + scale * (Math.sin(radians) * localTip.x + Math.cos(radians) * localTip.y) };
      close(drawnTip.x, tip.x, "Drawn tip x");
      close(drawnTip.y, tip.y, "Drawn tip y");
      const visualHit = scoreDart((drawnTip.x - 220) / 170, (drawnTip.y - 220) / 170);
      assert.equal(visualHit.label, hit.label, "Drawn tip and score agree at ring/sector edges");
      verified++;
    }
  }
}

for (const [radius, expected] of [[0, "BULL"], [6.349, "BULL"], [6.35, "BULL"], [6.351, "25"], [15.899, "25"], [15.9, "25"], [15.901, "20"], [99, "T20"], [107, "T20"], [162, "D20"], [170, "D20"]]) assert.equal(hitAt(radius).label, expected);

// Reproduce the reported failure: a single 20 just below the treble wire,
// drawn with the old fill-box origin, incorrectly appears in the treble.
const single = hitAt(98.9);
const finalPose = dartPoseAt(single, 1);
const oldTipY = finalPose.y + Math.sin(finalPose.rotation * Math.PI / 180) * .86 * 8;
assert.equal(single.label, "20");
assert.ok(220 - oldTipY > 99, "Old bounding-box origin visually crosses the T20 wire");
close(finalPose.y, 121.1, "Correct insertion point stays in single 20");

// End of flight and restored/settled pose must agree with no landing jump.
for (const hit of [hitAt(103), hitAt(166, 90), hitAt(170.5, 200), hitAt(0)]) {
  const settled = dartPoseAt(hit, 1);
  const beforeLanding = dartPoseAt(hit, 1 - 1e-12);
  close(beforeLanding.x, settled.x, "Continuous landing x");
  close(beforeLanding.y, settled.y, "Continuous landing y");
  close(beforeLanding.scale, settled.scale, "Continuous landing scale");
  assert.deepEqual(dartPoseAt(hit, 2), settled);
}
console.log(`Dart geometry checks passed: ${verified} sector/ring-edge hits, bull and double boundaries, exact native SVG tip placement, T20 regression and continuous landing.`);
