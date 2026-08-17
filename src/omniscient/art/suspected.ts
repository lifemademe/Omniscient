/**
 * Tier 1 - SUSPECTED. The machine thinks something is there. See ART_DIRECTION §1.
 *
 * ## Why this tier is the whole argument
 *
 * A flat white box on Mirela's shelf was the single most-reported fault in this game, and
 * every attempt to fix it as a *material* problem failed, because it was never one. The box
 * was untextured, unlit and unexplained, and the eye read it as work somebody had not
 * finished. No amount of roughness map fixes that.
 *
 * The direction's answer is that the box is not unfinished, it is UNKNOWN - she never said
 * what was in it - and the job is to make that legible rather than to make it detailed. So
 * the tier does not render the prop at all. It renders the machine's guess AT the prop: the
 * volume it occupies, drawn as a dark solid with its edges lit, moving slightly, because a
 * guess should not sit as still as a fact.
 *
 * That is a statement rather than an absence. It reads instantly, at any distance, and it
 * turns the game's largest category of unfinished-looking asset into deliberate ones.
 *
 * ## Why the bounding volume and not the mesh
 *
 * A recognisable silhouette is a claim of knowledge. If the shelf's boxes keep their own
 * corners and chamfers while representing something nobody has described, the picture is
 * lying about what the machine has been told - and the player learns to ignore the tier,
 * because it looks the same as the one above it. The box has to be a BOX.
 *
 * ## How the real prop is silenced
 *
 * By hiding the mesh, which sounds obvious and was the second thing tried.
 *
 * The first was a material swap - give every mesh a material with `visible: false`, which
 * three checks per draw without touching the graph. It is a sound technique, it silenced
 * nothing, and it took a build painted magenta to find out why: MeshNode's material setter
 * routes through an async `loadGenericMaterial`, and any load still in flight lands after
 * and puts the real material back. Assignments to a material are not durable on this
 * engine unless you know nothing is loading. `visible` has no such setter and survives.
 *
 * The reason the swap was reached for first still stands as a caution: under
 * COLLAPSE_MESH_COMPONENT a MeshNode draws as ITSELF rather than through a child, so a prop
 * root is simultaneously the mesh and the parent, and hiding it would hide everything hung
 * off it - including the proxy meant to replace it. That flag is currently off, so the
 * drawn object is a leaf child and hiding it is safe; the guard below checks rather than
 * assumes, because a room silently losing an object is not a failure anybody would spot.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { createRng, type Rng } from '../core/rng.js';

import { renderTargetOf } from './certainty.js';
import { decorMesh } from './mesh.js';
import { ACCENT } from './palette.js';

/**
 * The unlit fill.
 *
 * ART_DIRECTION §1 says near-black, and #050b0e was tried and is wrong in the room it has
 * to live in. This game's interiors sit around value 40 with a lot of shadow, so a volume
 * darker than the darkest wall does not read as an object at all - it reads as a HOLE, a
 * piece of the world that failed to load, which is the exact impression the tier exists to
 * dispel. Slightly lifted and slightly cool, it sits in the dark end of the room's own
 * range instead of below it, and the wall behind stays faintly visible through it.
 */
const FILL_COLOUR = '#0a141a';

/** Drift, in metres. ART_DIRECTION §1 asks for ±2cm, which at room scale is a shimmer. */
const DRIFT = 0.02;
/** Hertz. Slow enough to read as uncertainty rather than as an animation. */
const DRIFT_RATE = 0.15;
/**
 * Opacity travels between these. Never reaching 1 is the point.
 *
 * Pulled down from the 0.55-0.8 the direction asks for, for the same reason the colour was
 * lifted: at 0.8 the volume is effectively solid and punches a hole in the room. Letting
 * the wall read faintly through it turns a void into a MARKED REGION, which is what the
 * machine is actually doing - drawing a box round the part of the room it cannot resolve,
 * not deleting it.
 */
const BREATHE_LOW = 0.42;
const BREATHE_HIGH = 0.62;
/** Deliberately not a multiple of DRIFT_RATE, so the two never fall into step. */
const BREATHE_RATE = 0.23;

/** Seconds the sweep takes. ART_DIRECTION §3 asks for 0.6 and 0.6 is right. */
const RESOLVE_SECONDS = 0.6;

export interface Suspicion {
  /** True once the sweep has started. The prop is on its way to being known. */
  readonly resolving: boolean;
  /**
   * Play the sweep, then put the real prop back. ART_DIRECTION §3.
   *
   * `stagger` delays the start, so a beat that promotes three things at once does not fire
   * three identical animations on the same frame - which reads as a glitch rather than as
   * three separate facts arriving.
   */
  resolve(stagger?: number): void;
  /** Advance drift, breath or sweep. Returns false once this is finished with. */
  update(deltaTime: number): boolean;
  /** Put the real prop back immediately, with no sweep. Safe to call twice. */
  dispose(): void;
}

/**
 * The subtree's extent, in the root's own space.
 *
 * `Box3.setFromObject` is the obvious call and returns an empty box here: it looks for
 * `geometry` on each object it traverses, and the geometry of a collapsed MeshNode lives
 * behind a getter on a mesh that is not in the graph. Same failure as everything else in
 * this project that reached for a node and got the wrong object - see the note on
 * `renderTargetOf`.
 */
function localBounds(root: THREE.Object3D): THREE.Box3 | null {
  root.updateWorldMatrix(true, true);

  const toLocal = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const box = new THREE.Box3();
  const scratch = new THREE.Box3();
  const transform = new THREE.Matrix4();
  let found = false;

  root.traverse((object) => {
    const geometry = renderTargetOf(object)?.geometry;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;

    transform.multiplyMatrices(toLocal, object.matrixWorld);
    box.union(scratch.copy(geometry.boundingBox).applyMatrix4(transform));
    found = true;
  });

  return found && !box.isEmpty() ? box : null;
}

/** The bottom rectangle alone, in the box's local space. The sweep rides this. */
function baseEdges(size: THREE.Vector3): THREE.BufferGeometry {
  const x = size.x / 2;
  const y = -size.y / 2;
  const z = size.z / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -x, y, -z, x, y, -z,
        x, y, -z, x, y, z,
        x, y, z, -x, y, z,
        -x, y, z, -x, y, -z,
      ],
      3
    )
  );
  return geometry;
}

/** Twelve edges as a line list. Cheaper than EdgesGeometry and exact for a box. */
function boxEdges(size: THREE.Vector3): THREE.BufferGeometry {
  const x = size.x / 2;
  const y = size.y / 2;
  const z = size.z / 2;
  const points: number[] = [];

  const segment = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): void => {
    points.push(ax, ay, az, bx, by, bz);
  };

  for (const sy of [-y, y]) {
    segment(-x, sy, -z, x, sy, -z);
    segment(x, sy, -z, x, sy, z);
    segment(x, sy, z, -x, sy, z);
    segment(-x, sy, z, -x, sy, -z);
  }
  for (const [sx, sz] of [
    [-x, -z],
    [x, -z],
    [x, z],
    [-x, z],
  ] as const) {
    segment(sx, -y, sz, sx, y, sz);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

/**
 * Replace a prop with the machine's guess at it.
 *
 * Returns null when the subtree has no geometry to bound - a light, an empty anchor node,
 * a prop registered for its actions alone. Those are not things the machine is uncertain
 * about, they are not things at all, and wrapping them in a glowing box would invent an
 * object the room does not contain.
 */
export function createSuspicion(root: THREE.Object3D, seed: number): Suspicion | null {
  const bounds = localBounds(root);
  if (!bounds) return null;

  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  /*
   * A minimum, because a flat prop - a rag, a paper, a floor seam - bounds to a plane, and
   * a plane has no volume to suggest. Two centimetres is enough for the wireframe to read
   * as a box seen edge-on rather than as a single line lying on the bench.
   */
  size.set(Math.max(size.x, 0.02), Math.max(size.y, 0.02), Math.max(size.z, 0.02));

  /*
   * Silence the real prop.
   *
   * Deduplicated, because the traverse sees each drawn mesh twice: once as the MeshNode
   * that owns it and once as the mesh itself, which is a child in the graph while the
   * collapse flag is off. Without the set the second visit would record the already-hidden
   * state as the thing to restore, and the prop would never come back.
   */
  const hidden: THREE.Mesh[] = [];
  const seen = new Set<THREE.Mesh>();
  root.traverse((object) => {
    const mesh = renderTargetOf(object);
    if (!mesh || seen.has(mesh)) return;
    /*
     * Only a leaf. If the drawn object has children, it is a collapsed MeshNode acting as
     * both mesh and parent, and hiding it would take the proxy down with it.
     */
    if (mesh.children.length > 0) return;
    seen.add(mesh);
    hidden.push(mesh);
    mesh.visible = false;
  });

  const rng: Rng = createRng(seed);
  const phase = rng() * Math.PI * 2;
  const phaseB = rng() * Math.PI * 2;
  const phaseC = rng() * Math.PI * 2;

  const container = ENGINE.SceneNode.create({
    name: 'Suspected',
    position: centre.clone(),
  });

  const fill = new THREE.MeshBasicMaterial({
    color: new THREE.Color(FILL_COLOUR),
    transparent: true,
    opacity: BREATHE_LOW,
    /*
     * Depth still written, so the wireframe of a box behind this one is occluded. Guesses
     * stack up in a room and without it the shelf reads as a heap of overlapping outlines
     * rather than as four separate volumes.
     */
    depthWrite: true,
  });

  const volume = decorMesh('SuspectedVolume', new THREE.BoxGeometry(size.x, size.y, size.z), fill);
  volume.castShadow = false;
  volume.receiveShadow = false;
  container.add(volume);

  /*
   * The edges, in the machine's own colour and outside its own tone mapping.
   *
   * ACCENT.data is the cold cyan §9 assigns to data and scanning - the same colour as the
   * scan reticles and the console globe, because this is the same instrument saying the
   * same thing. `toneMapped: false` is what makes it read as emissive without a bloom pass:
   * the fill goes through the tone curve with the rest of the room and the line does not,
   * so the edge stays bright against a volume that is nearly black.
   */
  const wire = new THREE.LineBasicMaterial({
    color: new THREE.Color(ACCENT.data),
    transparent: true,
    opacity: BREATHE_HIGH,
    toneMapped: false,
  });
  const edges = new THREE.LineSegments(boxEdges(size), wire);
  container.add(edges);

  /*
   * The rule that crosses the volume when it resolves. ART_DIRECTION §3.
   *
   * Just the bottom rectangle, at full brightness, and it rides the volume's lower edge -
   * so shrinking the box upward drags the line up through the space the prop occupies.
   * That is the whole sweep: no clipping planes, no second shader, no discard. The line is
   * where the change is happening and the eye follows it because it is the brightest thing
   * in the frame for six tenths of a second.
   *
   * Hidden until then. A permanent bright edge along the bottom of every guess would read
   * as a design element rather than as an event.
   */
  const ruleMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(ACCENT.knowledge),
    transparent: true,
    opacity: 1,
    toneMapped: false,
  });
  const rule = new THREE.LineSegments(baseEdges(size), ruleMaterial);
  rule.visible = false;
  container.add(rule);

  root.add(container);

  let time = 0;
  let disposed = false;
  /** Seconds into the resolve, or null while the machine is still guessing. */
  let resolving: number | null = null;
  let delay = 0;

  return {
    get resolving(): boolean {
      return resolving !== null;
    },

    resolve(stagger = 0): void {
      if (resolving !== null || disposed) return;
      resolving = 0;
      delay = stagger;
      /*
       * The prop comes back at the START of the sweep, not the end.
       *
       * It is behind a volume that is still mostly opaque, so almost nothing shows yet -
       * and as the box retreats upward it UNCOVERS a thing that was already there. Revealing
       * it at the end instead would be a swap, and a swap reads as a bug however well it is
       * timed. What the direction asks for is something developing, and developing means the
       * image was always underneath.
       */
      for (const mesh of hidden) mesh.visible = true;
      rule.visible = true;
    },

    update(deltaTime: number): boolean {
      if (disposed) return false;
      time += deltaTime;

      if (resolving !== null) {
        resolving += deltaTime;
        if (resolving < delay) return true;

        const t = Math.min(1, (resolving - delay) / RESOLVE_SECONDS);
        /*
         * Ease out, per §3 - it decelerates into place. A linear sweep reads as a wipe, and
         * a wipe is a transition between two pictures; this is meant to read as a thing
         * arriving, which means it has to slow down as it gets there.
         */
        const eased = 1 - Math.pow(1 - t, 3);

        /*
         * Shrink upward, anchored at the top. The box's ceiling stays put and its floor
         * climbs, so the bottom rectangle - the rule - travels the full height of the
         * volume exactly once.
         */
        container.scale.y = Math.max(0.0001, 1 - eased);
        container.position.set(centre.x, centre.y + (size.y * eased) / 2, centre.z);

        fill.opacity = BREATHE_LOW * (1 - eased);
        wire.opacity = BREATHE_HIGH * (1 - eased);
        /*
         * The rule holds full brightness until the very end and then goes in a hurry. A
         * line that fades out evenly with everything else is not an event, it is a
         * dissolve - the spike has to survive to the top and stop.
         */
        ruleMaterial.opacity = t < 0.82 ? 1 : 1 - (t - 0.82) / 0.18;

        if (t >= 1) {
          this.dispose();
          return false;
        }
        return true;
      }

      /*
       * Three unrelated rates on three axes. One sine on one axis is a bob, and a bob is a
       * mechanism; three that never line up is something the machine has not pinned down.
       */
      const spin = time * Math.PI * 2 * DRIFT_RATE;
      container.position.set(
        centre.x + Math.sin(spin + phase) * DRIFT,
        centre.y + Math.sin(spin * 0.77 + phaseB) * DRIFT * 0.6,
        centre.z + Math.cos(spin * 1.31 + phaseC) * DRIFT
      );

      const breath = (Math.sin(time * Math.PI * 2 * BREATHE_RATE + phase) + 1) / 2;
      fill.opacity = BREATHE_LOW + (BREATHE_HIGH - BREATHE_LOW) * breath;
      // The edge runs opposite the fill, so the object never dims as a whole - it resolves
      // and unresolves, which is what it is meant to be doing.
      wire.opacity = BREATHE_HIGH - (BREATHE_HIGH - BREATHE_LOW) * breath * 0.5;
      return true;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const mesh of hidden) mesh.visible = true;
      container.removeFromParent();
      volume.geometry.dispose();
      edges.geometry.dispose();
      rule.geometry.dispose();
      fill.dispose();
      wire.dispose();
      ruleMaterial.dispose();
    },
  };
}
