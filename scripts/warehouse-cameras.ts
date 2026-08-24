/**
 * Do the warehouse's fixed cameras show anything a person could recognise?
 *
 * Reported as "the camera positions of the warehouse doors don't show anything recognisable",
 * and the reason turned out to be one number repeated six times. Measured, the three door
 * cameras looked DOWN at between 49 and 57 degrees:
 *
 *     service-a  height 7.4  standoff 4.06m  pitch 57.2deg
 *     service-b  height 7.5  standoff 5.60m  pitch 48.8deg
 *     service-c  height 7.4  standoff 4.06m  pitch 57.2deg
 *
 * A camera seven and a half metres up and four metres away is not surveillance, it is a
 * ceiling hatch. At 57 degrees you see the top of somebody's head, their shoulders, and a
 * patch of floor - no face, no door, no posture, nothing that tells you who is there or what
 * they are doing. Every real fixed camera at a doorway sits about three and a half metres up
 * and five to twelve metres back, looking down between twelve and twenty-five degrees, and
 * the reason is exactly this: that is the range where a standing person still reads as a
 * standing person.
 *
 * ## What this checks
 *
 * Pitch, standoff, mounting height, and - the one that actually matters - whether the person
 * the camera exists to show is inside the frame with room around them. The last is a
 * projection, the same arithmetic as `probe-mast.ts`, because "is the subject in shot" is not
 * a question an eye should be asked when a lens has an answer.
 *
 * It also checks the camera is OUTSIDE the shell for a door camera. A camera at x -24.0 when
 * the wall is at -24.2 is inside the building looking at the back of a wall, and that failure
 * looks identical to a badly aimed one from a capture.
 *
 *     npx tsx scripts/warehouse-cameras.ts
 */
import * as THREE from 'three';

import { WAREHOUSE_DOORS, WAREHOUSE_DOOR_IDS } from '../src/omniscient/warehouse/WarehouseServiceDoors.js';
import { WAREHOUSE_LAYOUT } from '../src/omniscient/warehouse/WarehouseLayout.js';

/** A mounted camera, not a drone. Below this it is a tripod; above it, a roof light. */
const HEIGHT = [2.8, 5.2] as const;
/**
 * Degrees below horizontal.
 *
 * Twelve is about the shallowest a camera can sit and still see the ground in front of a
 * door; past twenty-six a standing person starts foreshortening into a hat.
 */
const PITCH = [12, 26] as const;
/** Metres from the camera to what it is aimed at. Closer crops a person; further loses them. */
const STANDOFF = [4.5, 15] as const;

/** Roughly a head above a standing person, for the in-frame test. */
const HEAD = 1.75;

let failures = 0;
const fail = (message: string): void => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
};

function project(
  cam: THREE.Vector3,
  tgt: THREE.Vector3,
  fov: number,
  point: THREE.Vector3,
  aspect = 16 / 9
) {
  const view = new THREE.Matrix4().lookAt(cam, tgt, new THREE.Vector3(0, 1, 0));
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3().setFromMatrixColumn(view, 0),
    new THREE.Vector3().setFromMatrixColumn(view, 1),
    new THREE.Vector3().setFromMatrixColumn(view, 2)
  );
  const l = point.clone().sub(cam).applyMatrix4(basis.clone().invert());
  const d = -l.z;
  const hH = Math.tan((fov * Math.PI) / 360);
  return { x: 0.5 + l.x / d / (hH * aspect) / 2, y: 0.5 - l.y / d / hH / 2, d };
}

/**
 * The console panel covers the right of the screen in every warehouse view, exactly as it
 * does in a contact view. A subject at x 0.7 is technically in frame and practically behind
 * a telephone.
 */
const PANEL_LEFT = 0.645;

function check(label: string, cam: THREE.Vector3, tgt: THREE.Vector3, fov: number, subject: THREE.Vector3): void {
  const standoff = Math.hypot(cam.x - tgt.x, cam.z - tgt.z);
  const drop = cam.y - tgt.y;
  const pitch = (Math.atan2(drop, standoff) * 180) / Math.PI;
  const distance = cam.distanceTo(tgt);

  console.log(
    `  ${label.padEnd(22)} height ${cam.y.toFixed(1)}m  standoff ${standoff.toFixed(1)}m  ` +
      `pitch ${pitch.toFixed(1)}deg  fov ${fov}`
  );

  if (cam.y < HEIGHT[0] || cam.y > HEIGHT[1]) {
    fail(`${label}: mounted at ${cam.y.toFixed(1)}m, outside ${HEIGHT[0]}-${HEIGHT[1]}m`);
  }
  if (pitch < PITCH[0] || pitch > PITCH[1]) {
    fail(`${label}: looks down ${pitch.toFixed(1)}deg, outside ${PITCH[0]}-${PITCH[1]}deg`);
  }
  if (distance < STANDOFF[0] || distance > STANDOFF[1]) {
    fail(`${label}: subject ${distance.toFixed(1)}m away, outside ${STANDOFF[0]}-${STANDOFF[1]}m`);
  }

  // The person, feet and head, at both aspect ratios.
  for (const aspect of [16 / 9, 4 / 3]) {
    const feet = project(cam, tgt, fov, subject, aspect);
    const head = project(cam, tgt, fov, subject.clone().setY(subject.y + HEAD), aspect);
    const name = aspect > 1.5 ? '16:9' : '4:3';
    if (feet.d <= 0 || head.d <= 0) {
      fail(`${label}: the subject is behind the camera at ${name}`);
      continue;
    }
    if (head.y < 0.04 || feet.y > 0.97) {
      fail(
        `${label}: the subject is cropped at ${name} - head y ${head.y.toFixed(2)}, ` +
          `feet y ${feet.y.toFixed(2)}`
      );
    }
    if (feet.x < 0.05 || feet.x > PANEL_LEFT) {
      fail(`${label}: the subject sits at x ${feet.x.toFixed(2)} at ${name}, off frame or behind the panel`);
    }
    // A figure that fills a twentieth of the frame is a smudge; one that fills three
    // quarters of it is a shoulder.
    const share = feet.y - head.y;
    if (share < 0.14 || share > 0.78) {
      fail(`${label}: the subject is ${(share * 100).toFixed(0)}% of frame height at ${name}`);
    }
  }
}

console.log('--- door cameras: can you see who is at the door? ---');
for (const id of WAREHOUSE_DOOR_IDS) {
  const door = WAREHOUSE_DOORS[id];
  check(`${id} door`, door.camera.position, door.camera.target, door.camera.fov, door.visitorPosition);
}

/*
 * The pursuit cameras watch a run rather than a spot, so the subject tested is the MIDDLE of
 * the route. A camera framed on the start sees somebody leave; framed on the end, it sees
 * them arrive and nothing before it.
 */
console.log('\n--- pursuit cameras: can you see them run? ---');
for (const id of WAREHOUSE_DOOR_IDS) {
  const { pursuit } = WAREHOUSE_DOORS[id];
  const middle = pursuit.suspectStart.clone().lerp(pursuit.suspectEnd, 0.5);
  const run = pursuit.suspectStart.distanceTo(pursuit.suspectEnd);
  console.log(`  ${id} runs ${run.toFixed(0)}m`);
  check(`${id} pursuit`, pursuit.camera.position, pursuit.camera.target, pursuit.camera.fov, middle);
}

/*
 * And every door camera has to be OUTSIDE the shell it is bolted to.
 *
 * The visitor stands outside; a camera inside the wall is aimed at the inside face of a
 * building, which renders as a dark rectangle and reads exactly like a mis-aimed camera.
 */
console.log('\n--- mounting ---');
const { wallX, frontZ } = WAREHOUSE_LAYOUT.shell;
for (const id of WAREHOUSE_DOOR_IDS) {
  const door = WAREHOUSE_DOORS[id];
  const p = door.camera.position;
  const outside =
    door.place === 'WEST' ? p.x < -wallX : door.place === 'EAST' ? p.x > wallX : p.z > frontZ;
  if (!outside) fail(`${id}: the camera is inside the shell (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  else console.log(`  ok    ${id} is mounted outside the ${door.place.toLowerCase()} wall`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
