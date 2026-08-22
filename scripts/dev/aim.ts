/**
 * Where does a point in Mirela's shop land on screen?
 *
 * Written to answer one question exactly rather than by eye: the wire beat wants her to
 * walk until the console panel hides her, and "hidden" is a screen fraction, not a world
 * position. Guessing it costs a rebuild per attempt and still ends in a character whose
 * shoulder is sticking out past the panel edge.
 */
import * as THREE from 'three';

const CAMERA = new THREE.Vector3(1.32, 1.46, 1.82);
const TARGET = new THREE.Vector3(-0.34, 1.06, -0.72);
const FOV = 46;
/** The console panel's left edge, as a fraction of width - measured off the capture. */
const PANEL_LEFT = 0.645;
const ASPECT = 16 / 9;

const view = new THREE.Matrix4().lookAt(CAMERA, TARGET, new THREE.Vector3(0, 1, 0));
const basis = new THREE.Matrix4().makeBasis(
  new THREE.Vector3().setFromMatrixColumn(view, 0),
  new THREE.Vector3().setFromMatrixColumn(view, 1),
  new THREE.Vector3().setFromMatrixColumn(view, 2)
);
const toView = basis.clone().invert();

function screen(p: THREE.Vector3): { x: number; y: number; depth: number } {
  const local = p.clone().sub(CAMERA).applyMatrix4(toView);
  const depth = -local.z;
  const halfH = Math.tan((FOV * Math.PI) / 360);
  const halfW = halfH * ASPECT;
  return { x: 0.5 + local.x / depth / halfW / 2, y: 0.5 - local.y / depth / halfH / 2, depth };
}

// Her head, roughly, so "hidden" means hidden rather than decapitated.
const HEAD = 1.55;
const start = new THREE.Vector3(-0.72, HEAD, -1.14);
const s = screen(start);
console.log(`standing:  x ${s.x.toFixed(2)}  depth ${s.depth.toFixed(2)}m`);

/*
 * She is rotated Math.PI * 0.4 about Y, so "forward" for her is that heading. Walk along it
 * and report where her head lands, so the first x past the panel edge can simply be read.
 */
/*
 * The bench is the constraint, not the panel.
 *
 * createWorkbench is 2.4 by 0.9 at a root of (0, 0, -0.5), so it occupies x -1.2..1.2 and
 * z -0.95..-0.05. She stands at z -1.14, which is 0.19m behind its back edge - so any path
 * that gains z walks her through it, which is what the first staging did.
 *
 * Scanned along her own z instead: straight right, behind the bench, until the panel hides
 * her. Body half-width is added so HIDDEN means all of her rather than her centre.
 */
const BENCH = { x0: -1.2, x1: 1.2, z0: -0.95, z1: -0.05 };
const HALF_BODY = 0.25;

for (let x = -0.4; x <= 3.0; x += 0.3) {
  const p = new THREE.Vector3(x, HEAD, start.z);
  const r = screen(p);
  const halfOnScreen = HALF_BODY / r.depth / (Math.tan((FOV * Math.PI) / 360) * ASPECT) / 2;
  const clearsBench = p.z < BENCH.z0 || p.z > BENCH.z1 || x < BENCH.x0 || x > BENCH.x1;
  const hidden = r.x - halfOnScreen > PANEL_LEFT;
  console.log(
    `  x ${x.toFixed(1).padStart(4)} -> screen ${r.x.toFixed(2)} +-${halfOnScreen.toFixed(2)}` +
      `  depth ${r.depth.toFixed(2)}m  ${hidden ? 'HIDDEN' : '      '} ${clearsBench ? '' : 'IN BENCH'}`
  );
}
