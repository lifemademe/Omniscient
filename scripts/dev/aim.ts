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
const heading = Math.PI * 0.4;
const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
console.log(`forward:   (${forward.x.toFixed(2)}, ${forward.z.toFixed(2)})`);
for (let d = 0.4; d <= 3.2; d += 0.4) {
  const p = start.clone().addScaledVector(forward, d);
  const r = screen(p);
  const hidden = r.x > PANEL_LEFT ? 'HIDDEN' : '';
  console.log(
    `  +${d.toFixed(1)}m -> world (${p.x.toFixed(2)}, ${p.z.toFixed(2)})  screen x ${r.x.toFixed(2)}  depth ${r.depth.toFixed(2)}m ${hidden}`
  );
}
