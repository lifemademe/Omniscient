/**
 * Do the hand-written shaders actually COMPILE?
 *
 * Written after shipping one that did not. There is no way to compile a shader without a
 * GPU, so this is a real WebGL context in a real browser doing a real draw, reporting the
 * verdict into the page where a screenshot can read it.
 *
 * Two subjects: the material injection (onBeforeCompile, used in ten files) and the
 * painterly post-process pass. The pass is the one that matters most - it is a full-screen
 * ShaderMaterial with a Kuwahara loop in it, and a failure there is a black screen rather
 * than a black object.
 */
import * as THREE from 'three';

import { applyPaintBanding } from '../../../src/omniscient/art/painterly.js';
import { FRAGMENT, PAINT_LOOKS, VERTEX } from '../../../src/omniscient/art/paintShader.js';

const out = document.getElementById('out') as HTMLElement;
const lines: string[] = [];

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(320, 240);
document.body.appendChild(renderer.domElement);

const errors: string[] = [];
const realError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  errors.push(args.map((a) => String(a)).join(' '));
  realError(...args);
};

// -- 1. the material injection --------------------------------------------------------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 100);
camera.position.set(0, 0, 3);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(2, 3, 4);
scene.add(key);
const banded = applyPaintBanding(new THREE.MeshStandardMaterial({ color: 0xa08060 }));
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), banded));
renderer.render(scene, camera);

const materialErrors = errors.length;
lines.push(`material injection : ${materialErrors === 0 ? 'COMPILES' : 'FAILED'}`);

/*
 * -- 2. the post-process pass --------------------------------------------------------------
 *
 * Rebuilt here rather than imported, because installPaint needs an engine pipeline that does
 * not exist outside the game. What is being proved is the GLSL, and the GLSL is the same
 * string either way - so this compiles the identical shader with the identical uniforms and
 * draws one full-screen quad with it.
 */
const passScene = new THREE.Scene();
const passCamera = new THREE.Camera();
const source = new THREE.WebGLRenderTarget(320, 240);

const material = new THREE.ShaderMaterial({
  vertexShader: VERTEX,
  fragmentShader: FRAGMENT,
  depthTest: false,
  depthWrite: false,
  uniforms: {
    tDiffuse: { value: source.texture },
    uResolution: { value: new THREE.Vector2(320, 240) },
    uRadius: { value: PAINT_LOOKS.painted.radius },
    uStrength: { value: PAINT_LOOKS.painted.strength },
    uInk: { value: PAINT_LOOKS.painted.ink },
    uTint: { value: PAINT_LOOKS.painted.tint },
    uTooth: { value: PAINT_LOOKS.painted.tooth },
    uEncode: { value: 1 },
  },
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
quad.frustumCulled = false;
passScene.add(quad);
renderer.setRenderTarget(null);
renderer.render(passScene, passCamera);

const passErrors = errors.length - materialErrors;
lines.push(`painterly pass     : ${passErrors === 0 ? 'COMPILES' : 'FAILED'}`);
lines.push('');
for (const e of errors.slice(0, 2)) lines.push(e.slice(0, 500));

const ok = errors.length === 0;
lines.unshift(ok ? 'RESULT: ALL SHADERS COMPILE' : 'RESULT: A SHADER FAILED');
out.textContent = lines.join('\n');
out.style.color = ok ? '#7fe08a' : '#ff6b52';
