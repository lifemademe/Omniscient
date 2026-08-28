/**
 * Rain on a windscreen, and the wiper that takes it away.
 *
 * ## Why the wiper is half of this file
 *
 * Beads on glass are easy and they are not what reads. What reads is the CYCLE: the glass
 * fogging up with water over a couple of seconds, a blade going through it, and the whole
 * thing starting again. Rain that simply sits there is a texture. Rain that a wiper keeps
 * losing the argument with is weather, and weather is what mission-08-district.ts promised
 * when it wrote "the moment the wireframe resolves into rain on a windscreen".
 *
 * So the drops and the sweep are one system. `RainGlass.wipe()` is called by the same
 * per-frame code that swings the blade, and the accumulation restarts behind it.
 *
 * ## Why it is painted and not simulated
 *
 * The same argument `glass.ts` makes for the CRT sheen, and more so: this is on screen for
 * a few seconds at the end of a mission, through a camera that arrives and stops. A drop
 * simulation would be indistinguishable from a good static field with a fade on it, and it
 * would be indistinguishable at sixty frames a second rather than at build time.
 *
 * Two layers rather than one, because drops and runs behave differently. Beads sit where
 * they land and grow; runs slide down and streak. One texture doing both averages them into
 * neither.
 */

import * as THREE from 'three';

import { seedFrom } from '../core/rng.js';

/** Deterministic hash, so the same windscreen has the same rain every run. */
function hash(seed: number, i: number): number {
  const n = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function canvas(size: number): { ctx: CanvasRenderingContext2D; element: HTMLCanvasElement } | null {
  if (typeof document === 'undefined') return null;
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  const ctx = element.getContext('2d');
  return ctx ? { ctx, element } : null;
}

/**
 * A field of beads.
 *
 * Radial gradients rather than flat discs, because a water drop on glass is a lens: bright
 * at the edge where it bends the light behind it and near-empty in the middle. A flat disc
 * reads as a spot of dirt, which is the same shape and the wrong material.
 */
function beadTexture(seed: number, count: number): THREE.Texture | null {
  const made = canvas(512);
  if (!made) return null;
  const { ctx, element } = made;
  ctx.clearRect(0, 0, 512, 512);

  for (let i = 0; i < count; i++) {
    const x = hash(seed, i * 3) * 512;
    const y = hash(seed, i * 3 + 1) * 512;
    // Mostly small, a few large. An even spread of sizes looks like a pattern.
    const r = 0.8 + Math.pow(hash(seed, i * 3 + 2), 3) * 3.2;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, 'rgba(255,255,255,0.10)');
    gradient.addColorStop(0.62, 'rgba(255,255,255,0.05)');
    gradient.addColorStop(0.88, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(element);
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Runs: drops that gave up sitting still.
 *
 * Drawn as tapered vertical streaks with a bead at the bottom, which is the shape water
 * makes going down glass - the trail is where it has been and the head is where it is.
 */
function runTexture(seed: number, count: number): THREE.Texture | null {
  const made = canvas(512);
  if (!made) return null;
  const { ctx, element } = made;
  ctx.clearRect(0, 0, 512, 512);

  for (let i = 0; i < count; i++) {
    const x = hash(seed + 7, i * 3) * 512;
    const y = hash(seed + 7, i * 3 + 1) * 512;
    const length = 12 + hash(seed + 7, i * 3 + 2) * 35;
    const width = 0.7 + hash(seed + 13, i) * 0.8;

    const trail = ctx.createLinearGradient(x, y - length, x, y);
    trail.addColorStop(0, 'rgba(255,255,255,0)');
    trail.addColorStop(1, 'rgba(255,255,255,0.55)');
    ctx.fillStyle = trail;
    ctx.fillRect(x - width / 2, y - length, width, length);

    const head = ctx.createRadialGradient(x, y, 0, x, y, width * 1.9);
    head.addColorStop(0, 'rgba(255,255,255,0.7)');
    head.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(x, y, width * 1.9, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(element);
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export interface RainGlass {
  /** Two surfaces to hang just in front of the windscreen, nearest last. */
  layers: THREE.Mesh[];
  /** Advance the weather. Call every frame with the frame time. */
  update: (deltaTime: number) => void;
  /** A blade just went through. Clear what had gathered. */
  wipe: () => void;
  /** Show or hide the whole thing with the rest of the car. */
  setVisible: (visible: boolean) => void;
}

/**
 * Build the rain for one windscreen.
 *
 * `geometry` should be the windscreen itself - the layers are copies of it, nudged towards
 * the eye so they sit on the glass rather than in it. Returns null with no DOM, which is
 * how every canvas-backed art helper in this project behaves under a harness.
 */
export function createRainGlass(geometry: THREE.BufferGeometry, seedText = 'district-07-rain'): RainGlass {
  const seed = seedFrom(seedText);
  const beads = beadTexture(seed, 110);
  const runs = runTexture(seed, 14);

  /*
   * Additive, and only just.
   *
   * Water on glass at night does not darken anything - it picks up whatever is behind it
   * and throws it back at you slightly out of place. Additive blending with a low opacity
   * gets that for nothing, and it means the drops brighten over the city lights and stay
   * invisible over the black between them, which is exactly where real ones disappear.
   */
  const material = (map: THREE.Texture | null): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({
      map: map ?? undefined,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color('#9fd8c8'),
    });

  const beadMat = material(beads);
  const runMat = material(runs);

  const layer = (mat: THREE.Material, nudge: number): THREE.Mesh => {
    const inset = geometry.clone();
    // Keep weather inside the clear aperture, away from pillar and dashboard overlaps.
    inset.computeBoundingBox();
    const centre = inset.boundingBox!.getCenter(new THREE.Vector3());
    inset.translate(-centre.x, -centre.y, -centre.z);
    inset.scale(0.80, 0.82, 0.82);
    inset.translate(centre.x, centre.y, centre.z);
    const mesh = new THREE.Mesh(inset, mat);
    mesh.name = 'RainLayer';
    mesh.position.z += nudge;
    mesh.visible = false;
    mesh.renderOrder = 3;
    return mesh;
  };

  const beadLayer = layer(beadMat, 0.004);
  const runLayer = layer(runMat, 0.008);

  let gathered = 0;
  let visible = false;

  return {
    layers: [beadLayer, runLayer],
    update: (deltaTime: number) => {
      if (!visible) return;
      /*
       * Gathers fast and tops out below full.
       *
       * Glass in rain is wet within a second - the slow part is not the wetting, it is the
       * blade being two seconds away. Low contrast leaves the road visible through
       * it, which matters more here than the rain does: this shot exists so the player sees
       * the little green boxes turn out to be people.
       */
      gathered = Math.min(1, gathered + deltaTime * 0.85);
      beadMat.opacity = gathered * 0.16;
      runMat.opacity = gathered * 0.09;

      // The runs slide. Slowly, and only downwards - water on a moving windscreen is being
      // pushed as much as it is falling, so this is nothing like gravity and should not be.
      if (runs) runs.offset.y += deltaTime * 0.05;
      // The beads drift back with the airflow, which is what makes the car feel like it is
      // moving even though nothing else in the frame is.
      if (beads) beads.offset.y += deltaTime * 0.012;
    },
    wipe: () => {
      gathered = 0;
      beadMat.opacity = 0;
      runMat.opacity = 0;
      // A new field behind the blade, so the same drops do not come back in the same places.
      if (beads) beads.offset.x += 0.37;
      if (runs) runs.offset.x += 0.23;
    },
    setVisible: (next: boolean) => {
      visible = next;
      beadLayer.visible = next;
      runLayer.visible = next;
      if (!next) gathered = 0;
    },
  };
}
