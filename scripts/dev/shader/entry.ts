/**
 * Does the painterly injection actually COMPILE?
 *
 * Written immediately after shipping one that did not. `applyPaintBanding` splices GLSL
 * into every MeshStandardMaterial in the game through onBeforeCompile, and the failure mode
 * of getting that wrong is not an exception - it is a room lit by nothing, reported as a
 * black screenshot, with the real message buried in a console nobody is reading.
 *
 * There is no way to compile a shader without a GPU, so this is a real WebGL context in a
 * real browser doing a real draw. It renders one frame and writes the verdict into the page
 * where a screenshot can read it.
 */
import * as THREE from 'three';

import { applyPaintBanding } from '../../../src/omniscient/art/painterly.js';

const out = document.getElementById('out') as HTMLElement;
const lines: string[] = [];

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(320, 240);
document.body.appendChild(renderer.domElement);

// Every warning and error three emits about programs goes through console.error.
const errors: string[] = [];
const realError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  errors.push(args.map((a) => String(a)).join(' '));
  realError(...args);
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 100);
camera.position.set(0, 0, 3);

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(2, 3, 4);
scene.add(key);

const material = applyPaintBanding(new THREE.MeshStandardMaterial({ color: 0xa08060 }));
const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
scene.add(mesh);

renderer.render(scene, camera);
renderer.render(scene, camera);

/*
 * `diagnostics` is set by three when a program fails to link and is not on the public type,
 * because it is not part of the public contract - it is set only in debug builds. It is
 * still the most direct answer to the question this file asks, so it is read through a
 * narrow cast rather than not read at all.
 */
const program = renderer.info.programs?.[0] as { diagnostics?: unknown } | undefined;
lines.push(`programs compiled: ${String(renderer.info.programs?.length ?? 0)}`);
lines.push(`diagnostics: ${program?.diagnostics ? 'PRESENT' : 'none'}`);
lines.push(`console.error count: ${String(errors.length)}`);
for (const e of errors.slice(0, 3)) lines.push(`  ${e.slice(0, 300)}`);

// The one that matters. A program with diagnostics is a program that did not link.
const ok = errors.length === 0 && !program?.diagnostics;
lines.unshift(ok ? 'RESULT: SHADER COMPILES' : 'RESULT: SHADER FAILED');
out.textContent = lines.join('\n');
out.style.color = ok ? '#7fe08a' : '#ff6b52';
