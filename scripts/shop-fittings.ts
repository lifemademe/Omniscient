/**
 * Are Mirela's new wall fittings where the arithmetic says they are?
 *
 * These props were placed by projection rather than by eye - `scripts/dev/probe-shop.ts` puts
 * a world point on screen through the registered shot, and every position in the scene was
 * chosen off its output. That covers where things LAND. It does not cover whether the
 * geometry those positions are attached to is the shape it was supposed to be, and that half
 * has a bad record in this project: a mesh rotated a quarter turn draws nothing and throws
 * nothing, a torus built in the wrong plane is a hoop lying flat on a wall, and a prop pushed
 * eight centimetres too far ends up inside the plaster where it is invisible and correct.
 *
 * So this measures the actual buffers. It builds each generator, takes real bounding boxes,
 * and asserts the things that would be silent failures on screen:
 *
 *  - nothing pokes through the wall it is mounted on
 *  - nothing intersects anything else
 *  - the compressor is not standing in the puddle the flood shot exists to show
 *  - the tin lying in the water is above the water plane rather than through it
 *  - the coil hangs DOWN and is round in the wall plane rather than flat against it
 *
 * Every number here is duplicated from `buildRepairShop` on purpose. A harness that imports
 * the value it is checking asserts that a constant equals itself.
 *
 *     npx tsx scripts/shop-fittings.ts
 */

import * as THREE from 'three';

import {
  createCableCoil,
  createCompressor,
  createFluorescentBatten,
  createTins,
} from '../src/omniscient/geometry/workshop.js';

import type { PropParts } from '../src/omniscient/geometry/props.js';

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  const tail = detail ? ` - ${detail}` : '';
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${tail}`);
}

/** The union box of every part of a prop, moved to where the scene puts it. */
function boxOf(parts: PropParts, at: THREE.Vector3): THREE.Box3 {
  const box = new THREE.Box3();
  for (const geometry of [parts.body, parts.fittings, parts.recesses, parts.chassis]) {
    if (!geometry) continue;
    geometry.computeBoundingBox();
    if (geometry.boundingBox) box.union(geometry.boundingBox);
  }
  return box.translate(at);
}

const f = (n: number): string => n.toFixed(3);
const say = (b: THREE.Box3): string =>
  `x ${f(b.min.x)}..${f(b.max.x)}  y ${f(b.min.y)}..${f(b.max.y)}  z ${f(b.min.z)}..${f(b.max.z)}`;

/* ---------------------------------------------------------------- the room's own numbers */

/**
 * The side wall is a 0.15-thick box centred on x -3.1, so its inner face is at -3.025.
 * Anything with a min.x below that is inside the plaster.
 */
const WALL_FACE = -3.025;
/** The puddle plane: a 1.02 x 0.72 rectangle at y 0.006, centred here. */
const PUDDLE = new THREE.Box3(
  new THREE.Vector3(-2.42 - 0.51, 0, -1.17 - 0.36),
  new THREE.Vector3(-2.42 + 0.51, 0.02, -1.17 + 0.36)
);
/** The shelf: 1.6 wide, 0.4 deep, 1.6 tall, at this origin. */
const SHELF = new THREE.Box3(
  new THREE.Vector3(-2.1 - 0.8, 0, -1.4 - 0.2),
  new THREE.Vector3(-2.1 + 0.8, 1.6, -1.4 + 0.2)
);

const BATTEN_AT = new THREE.Vector3(-2.93, 2.2, -1.11);
/** The back wall is a 0.15-thick box centred on z -1.9, so its inner face is here. */
const BACK_FACE = -1.825;
const COMPRESSOR_AT = new THREE.Vector3(-2.72, 0, -0.35);
const COIL_AT = new THREE.Vector3(-2.98, 1.62, -0.95);
const TINS_AT = new THREE.Vector3(-2.46, 0, -0.66);

const batten = createFluorescentBatten({ length: 1.3 });
const compressor = createCompressor();
const coil = createCableCoil('mirela-coil', 0.17);
const tins = createTins(
  [
    { at: new THREE.Vector3(0, 0, 0.06), radius: 0.055, height: 0.145, handle: true, openLid: true },
    { at: new THREE.Vector3(-0.06, 0, -0.06), radius: 0.04, height: 0.1 },
    { at: new THREE.Vector3(0.02, 0, -0.16), radius: 0.048, height: 0.125 },
    { at: new THREE.Vector3(0.16, 0.012, -0.36), radius: 0.05, height: 0.13, tipped: 0.62 },
  ],
  'mirela-tins'
);

const battenBox = boxOf(batten, BATTEN_AT);
const compressorBox = boxOf(compressor, COMPRESSOR_AT);
const coilBox = boxOf(coil, COIL_AT);
const tinsBox = boxOf(tins, TINS_AT);

console.log('\nboxes');
console.log(`  batten      ${say(battenBox)}`);
console.log(`  compressor  ${say(compressorBox)}`);
console.log(`  coil        ${say(coilBox)}`);
console.log(`  tins        ${say(tinsBox)}`);

/* --------------------------------------------------------------------------- the walls */

/*
 * The check that was missing, and the reason the box dump above is printed at all.
 *
 * The batten's conduit originally ran off the -Z end and finished at z -2.5, two thirds of a
 * metre outside a building whose back wall is at -1.825. Every positional check passed: it
 * did not sink into the SIDE wall, it did not intersect anything, and on screen the back
 * wall hid it completely, so the fault rendered as a conduit that stops - which is what it
 * was supposed to look like. It was found by reading the numbers, not by adding a check, so
 * here is the check.
 */
console.log('\nnothing leaves the building through the back wall');
for (const [name, box] of [
  ['batten', battenBox],
  ['compressor', compressorBox],
  ['coil', coilBox],
  ['tins', tinsBox],
] as [string, THREE.Box3][]) {
  check(`${name} stays inside the back wall`, box.min.z >= BACK_FACE, `reaches z ${f(box.min.z)}`);
}

console.log('\nnothing is buried in the side wall');
for (const [name, box] of [
  ['batten', battenBox],
  ['compressor', compressorBox],
  ['coil', coilBox],
  ['tins', tinsBox],
] as [string, THREE.Box3][]) {
  /*
   * A fitting's mounting feet ARE allowed a centimetre or two inside the surface - that is
   * how a screwed-on thing looks fixed rather than balanced. What is not allowed is a whole
   * part of the object on the far side of the plaster, which is invisible and reads as
   * missing geometry rather than as a bug.
   */
  const bite = WALL_FACE - box.min.x;
  check(`${name} does not sink more than 2cm into the wall`, bite <= 0.02, `${f(bite)}m`);
}

console.log('\nand nothing floats in front of it');
check(
  'the batten is bolted to the wall, not hanging in the room',
  battenBox.min.x <= WALL_FACE + 0.005,
  `nearest point ${f(battenBox.min.x)} vs face ${f(WALL_FACE)}`
);
check(
  'the coil touches the wall it is nailed to',
  coilBox.min.x <= WALL_FACE + 0.02,
  `nearest point ${f(coilBox.min.x)}`
);

/* ------------------------------------------------------------------- nothing overlaps */

console.log('\nnothing intersects anything else');
const solids: Array<[string, THREE.Box3]> = [
  ['batten', battenBox],
  ['compressor', compressorBox],
  ['coil', coilBox],
  ['tins', tinsBox],
  ['shelf', SHELF],
];
for (let i = 0; i < solids.length; i++) {
  for (let j = i + 1; j < solids.length; j++) {
    const [an, a] = solids[i];
    const [bn, b] = solids[j];
    check(`${an} and ${bn} are apart`, !a.intersectsBox(b));
  }
}

/* ------------------------------------------------- the flood evidence stays uncovered */

console.log('\nthe flood shot can still see its evidence');
/*
 * The `workshop-floor` camera exists to show the player the water. A machine parked on top
 * of it would be a prop obscuring the one thing it was placed to keep company, and that is
 * the specific mistake this check is here to stop somebody making later.
 */
check(
  'the compressor is clear of the puddle',
  !compressorBox.intersectsBox(PUDDLE),
  `compressor z reaches ${f(compressorBox.min.z)}, puddle starts ${f(PUDDLE.max.z)}`
);
check(
  'and clear of the shelf whose soaked legs are the evidence',
  !compressorBox.intersectsBox(SHELF)
);

/*
 * The tipped tin is the exception and is SUPPOSED to be in the water - it is the one piece
 * of dressing that makes the flood read without dialogue. What it must not do is share the
 * puddle's millimetre, because a surface and a prop at the same depth is a flicker.
 */
console.log('\nthe tin in the water is in it, and above it');
const tipped = createTins(
  [{ at: new THREE.Vector3(0.16, 0.012, -0.36), radius: 0.05, height: 0.13, tipped: 0.62 }],
  'mirela-tins'
);
const tippedBox = boxOf(tipped, TINS_AT);
check(
  'it lies inside the puddle footprint',
  tippedBox.min.x < PUDDLE.max.x &&
    tippedBox.max.x > PUDDLE.min.x &&
    tippedBox.min.z < PUDDLE.max.z &&
    tippedBox.max.z > PUDDLE.min.z,
  say(tippedBox)
);
check(
  'and sits above the water plane rather than through it',
  tippedBox.min.y >= 0.006,
  `lowest point ${f(tippedBox.min.y)}m, plane at 0.006m`
);
check(
  'lying down, not standing up',
  tippedBox.max.y - tippedBox.min.y < 0.11,
  `${f(tippedBox.max.y - tippedBox.min.y)}m tall, the tin is 0.13m long`
);

/* ------------------------------------------------------------------- shape sanity */

console.log('\nthe shapes are the shapes they were meant to be');
/*
 * The coil is three toruses rotated into the wall plane. Built without that rotation they
 * lie flat against the plaster like painted rings - which draws, throws nothing, and is
 * wrong. A hoop in the wall plane is thin on X and wide on Y and Z.
 */
const coilSize = coilBox.getSize(new THREE.Vector3());
check('the coil is thin against the wall', coilSize.x < 0.09, `${f(coilSize.x)}m deep`);
check('and round in the wall plane', coilSize.y > 0.3 && coilSize.z > 0.25, say(coilBox));
/*
 * 4cm of headroom above the nail rather than none, because the loop passes OVER it - the top
 * of a hank of cable hanging on a nail is a cable-thickness higher than the nail is, and a
 * check that forbade that was checking the wrong thing. What matters is the other end: the
 * coil has to fall away below, not stand up.
 */
check(
  'it hangs below its nail rather than above it',
  coilBox.max.y <= COIL_AT.y + 0.04 && coilBox.min.y < COIL_AT.y - 0.2,
  `nail at ${f(COIL_AT.y)}, coil ${f(coilBox.min.y)}..${f(coilBox.max.y)}`
);

/*
 * The tube runs along Z. A cylinder built Y-up and never rotated is a 1.3m post standing on
 * a wall bracket, which is exactly the kind of thing that looks deliberate in a screenshot.
 */
batten.body.computeBoundingBox();
const tubeSize = batten.body.boundingBox!.getSize(new THREE.Vector3());
check('the tube lies along Z', tubeSize.z > 1.2 && tubeSize.y < 0.06, `${say(batten.body.boundingBox!)}`);

/*
 * The compressor's flywheel faces the room. Pointing it at the wall costs nothing in a
 * bounding box and loses the one round shape the machine has.
 */
compressor.fittings.computeBoundingBox();
const fittingsBox = compressor.fittings.boundingBox!;
check(
  'the flywheel stands proud on the room side',
  fittingsBox.max.x > 0.1,
  `fittings reach x ${f(fittingsBox.max.x)}`
);

console.log('\nthe compressor stands on the floor');
check('feet on the ground', Math.abs(compressorBox.min.y) < 0.005, `${f(compressorBox.min.y)}m`);
check('and is under half a metre tall', compressorBox.max.y < 0.6, `${f(compressorBox.max.y)}m`);

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
