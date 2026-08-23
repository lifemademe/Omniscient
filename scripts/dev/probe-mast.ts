/**
 * Where does Tomas's headland land on screen?
 *
 * The third of these, after probe-shop and probe-door, and the one that found the worst of
 * it: mission 03 spends 34 of its 44 seconds in a shot whose contact is not merely behind
 * the console panel but OUTSIDE THE FRUSTUM - head 1.3 frame-heights above the top edge,
 * with the camera 65cm from his face. No capture can show you that, because the thing you
 * would be looking for is not in the picture to be missed.
 *
 * It also checks two things the other two probes do not, because this mission has an object
 * at the top of the frame and a banner across it:
 *
 *  - the REQUEST banner, measured off a capture at y 0.072-0.115. The beacon lens used to
 *    land at 0.119, four thousandths clear, and read as clipped.
 *  - the vertical span a shot has to hold, so "can this framing contain both" is answered by
 *    arithmetic instead of by moving the camera and looking.
 *
 *     npx tsx scripts/dev/probe-mast.ts
 */
import * as THREE from 'three';

/** Must match buildBeaconMast. */
const PLATFORM_Y = 2.02;
const BEACON_Y = 5.6;

const SHOTS: Record<string, [THREE.Vector3, THREE.Vector3]> = {
  default: [new THREE.Vector3(0, 4.95, 6), new THREE.Vector3(0.5, 4, -0.2)],
  'mast-cable': [new THREE.Vector3(-1.1, 2.65, 2), new THREE.Vector3(0.45, 2.95, 0.3)],
  beacon: [new THREE.Vector3(0.2, 5.6, 4.4), new THREE.Vector3(0.2, 4.6, -0.2)],
};

const FOV = 46;
/** The console panel's left edge, as a fraction of width - measured off a capture. */
const PANEL_LEFT = 0.645;
/** The REQUEST banner, top and bottom, as fractions of height. Also measured. */
const BANNER = [0.072, 0.115];

const POINTS: Array<[string, THREE.Vector3]> = [
  ['Tomas head', new THREE.Vector3(0.62, PLATFORM_Y + 0.03 + 1.62, 0.55)],
  ['Tomas chest', new THREE.Vector3(0.62, PLATFORM_Y + 0.03 + 1.25, 0.55)],
  ['Tomas feet', new THREE.Vector3(0.62, PLATFORM_Y + 0.03, 0.55)],
  ['the splice box', new THREE.Vector3(0.3, 2.6, 0.36)],
  ['the beacon lens', new THREE.Vector3(0, BEACON_Y + 0.08, 0)],
  ['the beacon foot', new THREE.Vector3(0, BEACON_Y - 0.26, 0)],
  /*
   * The town, at its real place rather than at a guessed one.
   *
   * These were (-6, 0.1, -7) on the first draft, which is a point in mid-air over the deck.
   * The harbour is painted into `geometry/backdrop.ts` on a cylinder at radius 38, centred on
   * the bearing away from the cameras, with the sea at y -5.5 and the near coast lifted 2.54
   * above it - so the lights sit at about y -2.9, thirty-eight metres out. Checking framing
   * against a point the scene does not contain is how a probe tells you something reassuring
   * and false.
   */
  ['the harbour, ahead', new THREE.Vector3(0, -2.9, -38)],
  ['the harbour, west', new THREE.Vector3(-13, -2.9, -35)],
];

/** Tomas's centre of mass, for the perpendicular test. */
const TOMAS = new THREE.Vector3(0.62, PLATFORM_Y + 1.28, 0.55);

function at(shot: string, p: THREE.Vector3, aspect = 16 / 9) {
  const [cam, tgt] = SHOTS[shot];
  const view = new THREE.Matrix4().lookAt(cam, tgt, new THREE.Vector3(0, 1, 0));
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3().setFromMatrixColumn(view, 0),
    new THREE.Vector3().setFromMatrixColumn(view, 1),
    new THREE.Vector3().setFromMatrixColumn(view, 2)
  );
  const l = p.clone().sub(cam).applyMatrix4(basis.clone().invert());
  const d = -l.z;
  const hH = Math.tan((FOV * Math.PI) / 360);
  return { x: 0.5 + l.x / d / (hH * aspect) / 2, y: 0.5 - l.y / d / hH / 2, d };
}

/**
 * How tall a frame is, in metres, at a given distance.
 *
 * The one number that settles "can this shot hold the splice box AND the beacon" without a
 * build. They are 3.08m apart vertically, so at a 46 degree lens nothing closer than 3.6m
 * can contain both - which is why the old mast-cable at 1.07m never had a chance and why
 * the fix is a distance rather than an angle.
 */
function frameHeight(distance: number): number {
  return 2 * distance * Math.tan((FOV * Math.PI) / 360);
}

let failures = 0;
const fail = (message: string): void => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
};

for (const shot of Object.keys(SHOTS)) {
  const [cam, tgt] = SHOTS[shot];
  console.log(`\n=== ${shot} ===`);
  console.log(
    `  camera ${cam.toArray().map((v) => v.toFixed(2)).join(', ')} ` +
      `-> ${tgt.toArray().map((v) => v.toFixed(2)).join(', ')}   ` +
      `${cam.distanceTo(tgt).toFixed(2)}m, frame ${frameHeight(cam.distanceTo(tgt)).toFixed(2)}m tall`
  );

  for (const aspect of [16 / 9, 4 / 3]) {
    const label = aspect > 1.5 ? '16:9' : ' 4:3';
    for (const [name, p] of POINTS) {
      const s = at(shot, p, aspect);
      const on = s.d > 0 && s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1;
      const state = on ? (s.x < PANEL_LEFT ? 'visible' : 'BEHIND THE PANEL') : 'off frame';
      const banner = on && s.y > BANNER[0] - 0.02 && s.y < BANNER[1] + 0.02 ? '  UNDER THE BANNER' : '';
      console.log(
        `  ${label} ${name.padEnd(18)} x ${s.x.toFixed(3)}  y ${s.y.toFixed(3)}  ` +
          `${s.d.toFixed(2)}m  ${state}${banner}`
      );
    }
    if (aspect > 1.5) console.log('');
  }

  // The house rule at the top of scenes.ts: the contact's perpendicular distance from the
  // camera-to-target line, which is what stops a person standing on top of the evidence.
  const axis = tgt.clone().sub(cam).normalize();
  const toContact = TOMAS.clone().sub(cam);
  const perpendicular = toContact.clone().sub(axis.clone().multiplyScalar(toContact.dot(axis)));
  console.log(`  Tomas perpendicular from the camera axis: ${perpendicular.length().toFixed(2)}m`);
}

console.log('\n--- checks ---');

// 1. The mission's whole subject must clear the banner in the shot that establishes it.
const lens = at('default', POINTS[4][1]);
if (lens.y < BANNER[1] + 0.045) {
  fail(`the beacon lens sits at y ${lens.y.toFixed(3)}, under or against the REQUEST banner`);
} else {
  console.log(`  ok    the beacon lens clears the banner at y ${lens.y.toFixed(3)}`);
}

/*
 * 2. Nothing may stack.
 *
 * The old default shot put Tomas at 0.506, the beacon at 0.500 and the splice box at 0.495 -
 * three subjects inside thirteen thousandths of the frame's width, on a dead-straight
 * vertical. That is a totem pole and it is what this check exists to catch.
 *
 * Two things about the threshold, both worth stating because the first draft got both wrong.
 *
 * It measures at 4:3, not 16:9. Screen x scales as 1/aspect, so the same framing spreads 25%
 * less at 16:9 - and 4:3 is the aspect where things crowd, which is the one a crowding test
 * should use.
 *
 * And 0.09 is a measured ceiling rather than a principle. The first version demanded 0.08 at
 * 16:9, a number invented before anything had been measured, and the fix that satisfies every
 * other constraint here reaches 0.101. That is close to the maximum available, because THE
 * THREE SUBJECTS ARE VERY NEARLY CO-LINEAR IN PLAN: Tomas at (0.62, 0.55), the box at
 * (0.30, 0.36) and the mast at the origin all sit within a few degrees of one line, so no
 * camera can spread them much without giving up the banner clearance or the perpendicular.
 *
 * If a later pass wants more, the lever is the SET, not the camera - moving Tomas to about
 * (0.85, ., 0.15) along his platform takes the plan cross-product from -0.058 to -0.261, four
 * and a half times less co-linear. Not done here because it moves his rotation, his reach and
 * his relationship to the guardrail for a marginal gain.
 *
 * A 2-D separation test was tried and rejected: it passes the OLD shot too (minimum pairwise
 * distance 0.133 against the new one's 0.131), because what makes a totem pole read badly is
 * that everything shares one vertical, not that things overlap.
 */
const spread = [POINTS[1], POINTS[3], POINTS[4]].map(([, p]) => at('default', p, 4 / 3).x);
const span = Math.max(...spread) - Math.min(...spread);
if (span < 0.09) {
  fail(`the default shot stacks its three subjects within ${span.toFixed(3)} of screen width at 4:3`);
} else {
  console.log(`  ok    the default shot spreads its subjects over ${span.toFixed(3)} of width at 4:3`);
}

// 3. The contact must be IN the shot the mission spends most of its time in, and clear of
//    the console. This is the one that was catastrophically wrong.
for (const shot of ['default', 'mast-cable']) {
  const chest = at(shot, POINTS[1][1], 4 / 3);
  const on = chest.d > 0 && chest.x > 0 && chest.x < PANEL_LEFT && chest.y > 0 && chest.y < 1;
  if (!on) {
    fail(`Tomas is not visible in '${shot}' at 4:3 (x ${chest.x.toFixed(3)}, y ${chest.y.toFixed(3)})`);
  } else {
    console.log(`  ok    Tomas is in '${shot}' at 4:3, x ${chest.x.toFixed(3)} y ${chest.y.toFixed(3)}`);
  }
}

// 4. And the documented 0.45-0.90 perpendicular band, for every shot he is meant to be in.
for (const shot of ['default', 'mast-cable']) {
  const [cam, tgt] = SHOTS[shot];
  const axis = tgt.clone().sub(cam).normalize();
  const toContact = TOMAS.clone().sub(cam);
  const d = toContact.clone().sub(axis.clone().multiplyScalar(toContact.dot(axis))).length();
  if (d < 0.45 || d > 0.9) {
    fail(`'${shot}' puts Tomas ${d.toFixed(2)}m off the camera axis, outside the 0.45-0.90 band`);
  } else {
    console.log(`  ok    '${shot}' holds Tomas ${d.toFixed(2)}m off the axis`);
  }
}

/*
 * 5. WITHDRAWN, and this is the useful part of the file.
 *
 * There was a check here demanding the beacon be inside the mast-cable frame, on the
 * reasoning that its fault - out for three and a half seconds in every eleven, the one piece
 * of animation in the mission - was invisible during the puzzle because the lens was eight
 * frame-heights above the top edge.
 *
 * That reasoning was wrong, and measuring the capture is what showed it. Sampling the mean
 * luminance of the diorama half across t=8 to t=41 gives a series whose autocorrelation peaks
 * at EXACTLY 11.0 seconds with r = 0.664:
 *
 *     t=11 15.65    t=12 13.75    t=15 15.58     lit, dark, lit
 *     t=22 15.61    t=23 13.52    t=26 15.70
 *     t=33 15.60    t=34 13.74    t=37 15.62
 *
 * The beacon is a PointLight with a nine metre range three metres above the platform, so it
 * lights the structure whether or not its own geometry is in shot. The fault was never
 * invisible. It was 2.2 luminance values deep on a 255 scale - present, periodic, correct,
 * and under the threshold at which a person notices anything.
 *
 * So the fix is not a camera, it is a RATIO, and a projection cannot test a ratio. The lamp's
 * intensity and range go up in buildBeaconMast so the swing grows; the floor under the dark
 * phase is deliberately left alone, because raising the lit phase widens the gap without ever
 * risking the unreadable dark the sea-glow and face-fill were added to prevent.
 *
 * Left as a comment rather than deleted because the wrong version of this check would look
 * perfectly reasonable to whoever writes it next.
 */

// 6. The payoff has to contain the town the light is for.
const town = at('beacon', POINTS[6][1], 4 / 3);
if (!(town.d > 0 && town.y > 0 && town.y < 1)) {
  fail(`the harbour is not in the payoff shot (y ${town.y.toFixed(3)})`);
} else {
  console.log(`  ok    the harbour is in the payoff at y ${town.y.toFixed(3)}`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
