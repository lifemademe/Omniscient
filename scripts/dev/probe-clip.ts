/**
 * What passes through the transfer conveyor?
 *
 * Reported as a security gate and a crate intersecting the belt. Both are placed by hand in
 * different files, and the belt is a CatmullRom curve - so nothing about either placement
 * makes the collision visible at the call site. This samples the curve, works out the belt's
 * x-extent at the z of every candidate, and prints the overlap.
 *
 *     npx tsx scripts/dev/probe-clip.ts
 */
import * as THREE from 'three';

/** Straight from buildTransferConveyor. */
const POINTS = [
  new THREE.Vector3(10.2, 0.64, -20.7),
  new THREE.Vector3(11.1, 0.64, -18),
  new THREE.Vector3(13.3, 0.64, -15.5),
  new THREE.Vector3(15.4, 0.64, -13.3),
  new THREE.Vector3(17.25, 0.64, -10.15),
];
const CURVE = new THREE.CatmullRomCurve3(POINTS, false, 'centripetal');
/** Belt 1.45 wide, rails at +/-0.76 with their own 0.085. */
const BELT_HALF = 0.76 + 0.043;

/** The belt's x range wherever it crosses a given z, and the y band it occupies. */
function beltAt(z: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= 400; i++) {
    const p = CURVE.getPoint(i / 400);
    if (Math.abs(p.z - z) > 0.35) continue;
    lo = Math.min(lo, p.x - BELT_HALF);
    hi = Math.max(hi, p.x + BELT_HALF);
  }
  return lo === Infinity ? null : [lo, hi];
}

/** [name, centreX, width, z, yLow, yHigh] */
const CANDIDATES: Array<[string, number, number, number, number, number]> = [
  ['ReceivingSecurityGate-West', -13.5, 17.2, -14.45, 0.02, 4.4],
  ['ReceivingSecurityGate-East', 4.8, 16.4, -14.45, 0.02, 4.4],
  ['StorageWestSecurityGate-Rear', -12.2, 19.4, -14.15, 0.02, 4.4],
  ['StorageEastSecurityGate-Rear', 5.45, 15.1, -14.15, 0.02, 4.4],
  ['SortationSecurityGate-Rear', 19.75, 7.3, -14.25, 0.02, 4.4],
  /*
   * The vertical buffers. Their z band is -12.78..-11.53, which is inside the transfer
   * curve's run, and their first shelf carton hangs from y 0.78 - right through a belt deck
   * that tops out at 0.84. Sampled at the near edge, where the belt is furthest east.
   */
  ['VerticalBuffer-1', 18.65, 1.7, -11.53, 0.01, 4.31],
  ['VerticalBuffer-2', 21.85, 1.7, -11.53, 0.01, 4.31],
];

/** The belt deck sits about 0.545 to 0.84; anything spanning that at the same x collides. */
const BELT_Y: [number, number] = [0.5, 0.86];

console.log('--- what crosses the transfer conveyor ---');
let clashes = 0;
for (const [name, cx, width, z, yLow, yHigh] of CANDIDATES) {
  const belt = beltAt(z);
  if (!belt) {
    console.log(`  ${name.padEnd(30)} belt does not reach z ${z}`);
    continue;
  }
  const lo = cx - width / 2;
  const hi = cx + width / 2;
  const overlapX = Math.min(hi, belt[1]) - Math.max(lo, belt[0]);
  const overlapY = Math.min(yHigh, BELT_Y[1]) - Math.max(yLow, BELT_Y[0]);
  const clash = overlapX > 0 && overlapY > 0;
  if (clash) clashes += 1;
  console.log(
    `  ${name.padEnd(30)} x ${lo.toFixed(2)}..${hi.toFixed(2)}  belt ${belt[0].toFixed(2)}..${belt[1].toFixed(2)}  ` +
      (clash ? `THROUGH IT by ${overlapX.toFixed(2)}m` : `clear by ${(-overlapX).toFixed(2)}m`)
  );
}
console.log(clashes ? `\n${clashes} object(s) pass through the belt.` : '\nNothing passes through the belt.');
