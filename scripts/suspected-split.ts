/**
 * Does the SUSPECTED tier draw one box per crate, or one box per shelf?
 *
 * It drew one per shelf for as long as the tier has existed, and nothing caught it. The
 * failure is silent by construction: `localIslands` returns boxes, boxes render, and a
 * wrong count is a picture rather than an error. What it looked like on Mirela's wall was a
 * translucent pane 1.6m wide standing in front of the shelf it was supposed to be sitting
 * on - which contradicts the tier's own header ("the shelf reads as four separate volumes")
 * and destroys its argument, since "the unresolved sits inside the resolved" needs the
 * resolved thing to be visible.
 *
 * So the splitter is measured here rather than looked at. Every case below is driven
 * through the real function against real generator output.
 *
 *     npx tsx scripts/suspected-split.ts
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { localIslands } from '../src/omniscient/art/suspected.js';
import { createShelfStack, createWorkbench } from '../src/omniscient/geometry/props.js';
import { createCompressor, createTins } from '../src/omniscient/geometry/workshop.js';

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
}

/** A one-mesh node, which is the shape every prop in this game presents to the tier. */
function nodeOf(geometry: THREE.BufferGeometry): THREE.Object3D {
  const root = new THREE.Object3D();
  root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
  root.updateWorldMatrix(true, true);
  return root;
}

const f = (n: number): string => n.toFixed(2);
const sizes = (boxes: THREE.Box3[]): string =>
  boxes
    .map((b) => {
      const s = b.getSize(new THREE.Vector3());
      return `${f(s.x)}x${f(s.y)}x${f(s.z)}`;
    })
    .join('  ');

/* -------------------------------------------------------------------- one box, one island */

console.log('\na single box stays a single box');
{
  const boxes = localIslands(nodeOf(new THREE.BoxGeometry(0.3, 0.2, 0.25)));
  check('one island', boxes.length === 1, `got ${boxes.length}`);
  const size = boxes[0]?.getSize(new THREE.Vector3());
  check(
    'and it is the right size',
    Math.abs((size?.x ?? 0) - 0.3) < 1e-4 && Math.abs((size?.y ?? 0) - 0.2) < 1e-4,
    sizes(boxes)
  );
}

/* --------------------------------------------------- separated boxes come apart, touching ones do not */

console.log('\nseparated boxes split; touching boxes do not');
{
  const far: THREE.BufferGeometry[] = [];
  for (const x of [-1, 0, 1]) {
    const b = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    b.translate(x, 0, 0);
    far.push(b);
  }
  const boxes = localIslands(nodeOf(mergeGeometries(far, false)!));
  check('three apart give three islands', boxes.length === 3, `got ${boxes.length}: ${sizes(boxes)}`);
}
{
  /*
   * Two boxes overlapping by a centimetre. They share no vertices, so the union-find leaves
   * them separate and `mergeTouching` is the thing being tested here - a crate assembled
   * from two intersecting shells is one object, and a hairline of cyan down the middle of it
   * would be the machine asserting a seam nobody described.
   */
  const near: THREE.BufferGeometry[] = [];
  for (const x of [0, 0.19]) {
    const b = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    b.translate(x, 0, 0);
    near.push(b);
  }
  const boxes = localIslands(nodeOf(mergeGeometries(near, false)!));
  check('two overlapping give one island', boxes.length === 1, `got ${boxes.length}: ${sizes(boxes)}`);
}

/* ---------------------------------------------------------------------- the real offender */

console.log("\nMirela's shelf: crates, not a slab");
{
  const shelf = createShelfStack('mirela-shelf');
  const boxes = localIslands(nodeOf(shelf.fittings));
  console.log(`  ${boxes.length} volume(s): ${sizes(boxes)}`);

  check('more than one volume', boxes.length > 1, `got ${boxes.length}`);
  /*
   * The number that matters. `createShelfStack` puts 1-3 crates on each of three levels, so
   * the honest range is three to nine, and anything outside it means the splitter has either
   * fused levels together or come apart into triangles.
   */
  check('one per crate, within the generator range', boxes.length >= 3 && boxes.length <= 9);

  /*
   * The specific fault: a single hull spanned all three levels. The shelf is 1.6m wide and
   * the levels are 0.52m apart, so nothing correct can be a metre tall or a metre and a half
   * wide - and the old slab was both.
   */
  for (const box of boxes) {
    const size = box.getSize(new THREE.Vector3());
    check(`a volume ${f(size.x)}x${f(size.y)} is crate-sized`, size.x < 0.5 && size.y < 0.4);
  }

  // And they are on different levels, which is the thing a single hull hid.
  const heights = new Set(boxes.map((b) => Math.round(b.getCenter(new THREE.Vector3()).y * 10)));
  check('spread over more than one shelf', heights.size > 1, `${heights.size} distinct heights`);
}

/* -------------------------------------------------------- the cap, and props that are one thing */

console.log('\nother props in the room');
{
  const bench = createWorkbench();
  const boxes = localIslands(nodeOf(bench.fittings));
  // Four legs, nowhere near each other.
  check('the bench legs are four volumes', boxes.length === 4, `got ${boxes.length}`);
}
{
  const tins = createTins(
    [
      { at: new THREE.Vector3(0, 0, 0), radius: 0.05, height: 0.12 },
      { at: new THREE.Vector3(0.4, 0, 0), radius: 0.05, height: 0.12 },
    ],
    'split-test'
  );
  const boxes = localIslands(nodeOf(tins.body));
  check('two tins apart are two volumes', boxes.length === 2, `got ${boxes.length}`);
}
{
  /*
   * The compressor is one machine whose parts all touch, and it must not come apart into a
   * constellation of little boxes. This is the case the merge step exists for.
   */
  const boxes = localIslands(nodeOf(createCompressor().body));
  check('the compressor stays one machine', boxes.length === 1, `got ${boxes.length}: ${sizes(boxes)}`);
}
{
  /*
   * Above the cap the old behaviour returns - one box round everything. Coarse, never wrong,
   * and the guard that stops a pathological mesh becoming a hundred breathing wireframes.
   */
  const many: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 24; i++) {
    const b = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    b.translate(i * 0.5, 0, 0);
    many.push(b);
  }
  const boxes = localIslands(nodeOf(mergeGeometries(many, false)!));
  check('24 islands fall back to one hull', boxes.length === 1, `got ${boxes.length}`);
}

/* --------------------------------------------------------------------- nothing to bound */

console.log('\nand nothing to bound is still nothing');
check('an empty node gives no volumes', localIslands(new THREE.Object3D()).length === 0);

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
