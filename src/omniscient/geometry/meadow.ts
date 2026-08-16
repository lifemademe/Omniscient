/**
 * Grass that reads as ground, rather than as a carpet laid on a green plane.
 *
 * ## The one idea this file is built around
 *
 * A single density field decides three things at once: where blades are, how tall they
 * are, and what colour the soil underneath is. That correlation IS the effect. Grass
 * scattered evenly over flat green reads as decoration; grass that thins exactly where the
 * ground goes brown reads as a place, because bare earth is bare for a reason and the
 * reason is visible.
 *
 * Both readings of the field have to agree, so the noise is written twice - once in
 * TypeScript for placement and once in GLSL for the soil - from the same constants. That
 * duplication is deliberate and it is the only duplication in here; everything else is
 * derived.
 *
 * ## Height, not visibility
 *
 * The field scales blade HEIGHT and only then culls what is left under a threshold. A
 * binary mask cuts patches out with a hard edge; scaling height makes them feather, so a
 * bald patch has a fringe around it the way a real one does.
 *
 * ## Why the depth comes from vertex colours
 *
 * This project casts no shadows. Grass normally gets its depth from blades shadowing each
 * other, and without that a field is a flat green mass however many blades are in it. So
 * every blade carries a baked ramp - dark at the base, pale at the tip - which is doing the
 * job the missing shadows would do. It costs nothing: `vertexColors` is a built-in.
 *
 * ## Wind is the point
 *
 * Nothing outdoors in this game moves except the gulls. Four still sets is what makes them
 * read as diagrams. The wind is one uniform, bent in the vertex shader with the square of
 * the height along the blade so the base stays planted, and it is shared so that anything
 * else that should move can be driven from the same gust.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { range } from '../core/rng.js';

import { SHORE_GLSL, shoreDepth } from './shore.js';

import type { Rng } from '../core/rng.js';

/**
 * The shared gust.
 *
 * One object, so grass in two scenes never blows in two directions, and so a future leaf
 * or washing line can be added to the same weather rather than inventing its own.
 */
export const WIND = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.82, 0.57) },
  uWindStrength: { value: 0.13 },
  uWindSpeed: { value: 1.35 },
};

/** Advance the weather. Called once per frame by whichever scene is mounted. */
export function stepWind(deltaTime: number): void {
  WIND.uTime.value += deltaTime;
}

// -- The density field, in TypeScript ---------------------------------------------------

function hash12(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function vnoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash12(ix, iy);
  const b = hash12(ix + 1, iy);
  const c = hash12(ix, iy + 1);
  const d = hash12(ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

/**
 * How much grass belongs at this point, 0 to 1.
 *
 * Three octaves: the first decides where the bald patches are, the second breaks their
 * edges up, the third stops any of it looking like a gradient. Exported because the ground
 * shader needs the identical answer - see GROUND_NOISE_GLSL.
 *
 * The frequencies were nearly tripled after looking at the first field. At 0.19 the first
 * octave had a wavelength of about five metres, which on a nine-metre set meant one bald
 * half and one grassy half - a landscape feature rather than the texture of a field. Grass
 * clumps at something closer to a stride.
 */
export function density(x: number, z: number): number {
  return (
    vnoise(x * 0.52, z * 0.52) * 0.6 +
    vnoise(x * 1.15, z * 1.15) * 0.3 +
    vnoise(x * 2.5, z * 2.5) * 0.1
  );
}

/** The same function again, in GLSL. Kept adjacent so the two cannot drift apart unseen. */
const GROUND_NOISE_GLSL = /* glsl */ `
float mdw_hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float mdw_vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mdw_hash12(i), mdw_hash12(i + vec2(1.0, 0.0)), u.x),
             mix(mdw_hash12(i + vec2(0.0, 1.0)), mdw_hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float mdw_density(vec2 p) {
  return mdw_vnoise(p * 0.52) * 0.6 + mdw_vnoise(p * 1.15) * 0.3 + mdw_vnoise(p * 2.5) * 0.1;
}
`;

// -- One blade --------------------------------------------------------------------------

/**
 * A blade: a tapered strip that leans forward and comes to a point.
 *
 * Four segments rather than one, which the grass-shader write-ups are firm about - cutting
 * segments is the first performance saving anybody tries and the first thing that visibly
 * ruins it, because a straight quad cannot curl and a blade that does not curl reads as a
 * spike. Eight triangles is not a lot to spend on the difference.
 *
 * Unit height, so an instance's Y scale IS its height in metres and the density field can
 * set it directly.
 */
function bladeGeometry(segments = 4): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const base = new THREE.Color('#2c4420');
  const tip = new THREE.Color('#8fbf5e');

  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    // Tapered, and faster near the tip so it looks like a blade rather than a wedge.
    const halfWidth = 0.5 * (1 - Math.pow(t, 0.75) * 0.86);
    // The curl. Baked in rather than done in the shader: it is the blade's shape, not its
    // motion, and shape does not need recomputing sixty times a second.
    const lean = t * t * 0.34;
    const shade = base.clone().lerp(tip, t);

    positions.push(-halfWidth, t, lean, halfWidth, t, lean);
    colors.push(shade.r, shade.g, shade.b, shade.r, shade.g, shade.b);
  }

  // The point.
  positions.push(0, 1, 0.34);
  colors.push(tip.r, tip.g, tip.b);
  const tipIndex = segments * 2;

  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  indices.push((segments - 1) * 2, (segments - 1) * 2 + 1, tipIndex);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// -- The field --------------------------------------------------------------------------

export interface MeadowOptions {
  /** Centre of the patch. */
  at: THREE.Vector3;
  width: number;
  depth: number;
  /** How many blades to try to place. Thinning by density means fewer will survive. */
  count: number;
  /** Blade height range in metres, before the density field scales it. */
  height?: [number, number];
  /** Below this the ground is bare. Raise it for a worn field, lower it for rough meadow. */
  bareBelow?: number;
  /** Metres inland of the waterline before anything will grow. Omit where there is no water. */
  keepOffBeach?: number;
  /** Circles nothing grows in - paths, beds, the base of a tree. */
  clear?: Array<{ centre: THREE.Vector3; radius: number }>;
  y?: number;
}

/**
 * Build the grass.
 *
 * One InstancedMesh, so the whole field is a single draw call, and the per-blade variation
 * lives in the instance matrix and the instance colour rather than in geometry.
 */
export function meadow(rng: Rng, options: MeadowOptions): ENGINE.SceneNode {
  const { at, width, depth, count } = options;
  const [low, high] = options.height ?? [0.16, 0.42];
  const bareBelow = options.bareBelow ?? 0.42;
  const y = options.y ?? at.y;

  const placements: Array<{ matrix: THREE.Matrix4; tint: THREE.Color }> = [];
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const dry = new THREE.Color('#b9b177');

  for (let i = 0; i < count; i++) {
    const x = at.x + range(rng, -width / 2, width / 2);
    const z = at.z + range(rng, -depth / 2, depth / 2);
    if (options.clear?.some((zone) => Math.hypot(x - zone.centre.x, z - zone.centre.z) < zone.radius)) {
      continue;
    }

    /**
     * Height first, culling second.
     *
     * `lush` is remapped so the threshold is a real edge rather than a fade to nothing:
     * below `bareBelow` there is no grass at all, and just above it the blades are short.
     * That is what gives a bald patch a fringe instead of a cut line.
     */
    /**
     * Nothing grows on a beach.
     *
     * Grass ran straight down into the water, which is the single most obvious thing that
     * can be wrong with a shoreline - it stops being a shore and becomes a lawn that has
     * flooded. The margin is generous and RANDOMISED at its inner edge, because a real
     * treeline against sand is ragged; a clean arc would just be a different wrong line.
     */
    if (options.keepOffBeach !== undefined) {
      const inland = -shoreDepth(x, z);
      if (inland < options.keepOffBeach * range(rng, 0.55, 1.45)) continue;
    }

    const field = density(x, z);
    if (field < bareBelow) continue;
    const lush = (field - bareBelow) / Math.max(0.001, 1 - bareBelow);

    position.set(x, y, z);
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), range(rng, 0, Math.PI * 2));
    const tall = range(rng, low, high) * (0.45 + 0.55 * lush);
    /**
     * Z scales with height, and this was the bug that made the field look mown flat.
     *
     * The blade's forward curl is baked into the geometry as 0.34 at the tip of a UNIT
     * blade. With a Z scale of 1 that stayed 0.34 METRES however short the blade was - so a
     * 14cm blade had its tip 34cm downwind, bent to nearly two and a half times its own
     * height and lying along the ground. Grass arches; it does not do that.
     *
     * Scaling depth with height keeps the curl proportional, so a short blade arches a
     * little and a tall one arches more, which is what actually happens in a field.
     */
    scale.set(range(rng, 0.7, 1.1) * 0.07, tall, tall);
    matrix.compose(position, quaternion, scale);

    // Thin, dry blades where the field is sparse - the same reason the soil shows there.
    const tint = new THREE.Color(1, 1, 1).lerp(dry, (1 - lush) * 0.55);
    placements.push({ matrix: matrix.clone(), tint });
  }

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    // Blades are strips seen from both faces, and backface culling would make half the
    // field vanish depending on which way each one happened to be turned.
    side: THREE.DoubleSide,
  });

  /**
   * The wind, injected rather than written as a whole new shader.
   *
   * `onBeforeCompile` keeps MeshStandardMaterial's lighting, fog and the project's own
   * paint banding intact - the same technique art/painterly.ts uses. Writing a bespoke
   * ShaderMaterial would mean reimplementing all of that to make grass wave.
   *
   * NOTE: never clone this material. `clone()` drops onBeforeCompile, which surface.ts
   * already learned the hard way, and the grass would silently stop moving.
   */
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = WIND.uTime;
    shader.uniforms.uWindDir = WIND.uWindDir;
    shader.uniforms.uWindStrength = WIND.uWindStrength;
    shader.uniforms.uWindSpeed = WIND.uWindSpeed;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform float uTime;',
          'uniform vec2 uWindDir;',
          'uniform float uWindStrength;',
          'uniform float uWindSpeed;',
        ].join('\n')
      )
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          '{',
          // Unit-height blade, so the local y IS the fraction along it.
          '  float alongBlade = clamp(transformed.y, 0.0, 1.0);',
          // Each blade's own place in the gust, so a field ripples instead of pulsing.
          '  vec3 bladeAt = instanceMatrix[3].xyz;',
          '  float phase = dot(bladeAt.xz, vec2(0.9, 0.6));',
          '  float gust = sin(uTime * uWindSpeed + phase)',
          '             + 0.4 * sin(uTime * uWindSpeed * 2.3 + phase * 1.7);',
          // Squared, so the base stays planted and only the top half really travels.
          '  float bend = alongBlade * alongBlade * uWindStrength * gust;',
          '  transformed.x += bend * uWindDir.x;',
          '  transformed.z += bend * uWindDir.y;',
          '}',
        ].join('\n')
      );
  };

  const mesh = new THREE.InstancedMesh(bladeGeometry(), material, Math.max(1, placements.length));
  placements.forEach((placement, i) => {
    mesh.setMatrixAt(i, placement.matrix);
    mesh.setColorAt(i, placement.tint);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  // Every blade is inside the patch; the automatic bounds would be computed from the base
  // geometry alone and cull the whole field the moment the patch centre left the frustum.
  mesh.frustumCulled = false;

  const node = ENGINE.SceneNode.create({ name: 'Meadow', position: new THREE.Vector3() });
  node.add(mesh);
  return node;
}

// -- The ground it grows out of ---------------------------------------------------------

export interface GroundOptions {
  /** Colour where the grass is thick. Match it to whatever backdrop it sits against. */
  grass: string;
  /** Colour where it is bare. This is the one the player reads as "ground". */
  soil: string;
  /** Wet sand at the waterline, if this ground meets water. */
  sand?: string;
  /** Dry sand further up the beach. */
  drySand?: string;
}

/**
 * A ground material that browns off exactly where the grass thins.
 *
 * A fresh material rather than a modified shared one, on purpose: MAT.ground is used by
 * cellar floors and repair-shop concrete, and injecting a meadow into the family would put
 * soil mottling under Vasile's pipe run.
 */
export function meadowGround(options: GroundOptions): THREE.MeshBasicMaterial {
  /**
   * Unlit and unfogged, which is not a shortcut - it is the only thing that can work here.
   *
   * The outdoor "sun" in these scenes is a PointLight with a distance of 26 metres, so a
   * ground plane big enough to reach the horizon is simply outside the light past its near
   * edge. Lit, it faded to black across the middle of the shot and grew a dark band where
   * it met the backdrop. The rig's fog is tuned to a room as well - fogFar 26 - and did the
   * same thing again in haze colour.
   *
   * And nothing is lost. A flat plane has one normal, so lighting it produces a single
   * brightness across the whole surface; lit and unlit differ only by a constant, and the
   * constant is easier to pick than to fight. The backdrop's own ground made this bargain
   * long ago and this has to sit against it.
   */
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(options.grass),
    fog: false,
  });

  const soil = new THREE.Color(options.soil);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSoil = { value: soil };
    shader.uniforms.uSand = { value: new THREE.Color(options.sand ?? options.soil) };
    shader.uniforms.uDrySand = { value: new THREE.Color(options.drySand ?? options.soil) };

    // World position, carried across by hand. Three only provides one when something else
    // in the material happens to need it, which is not a thing to depend on.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMeadowAt;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvMeadowAt = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying vec3 vMeadowAt;',
          'uniform vec3 uSoil;',
          'uniform vec3 uSand;',
          'uniform vec3 uDrySand;',
          GROUND_NOISE_GLSL,
          SHORE_GLSL,
        ].join('\n')
      )
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          '{',
          // The identical field the blades were placed with, so the brown appears under the
          // gaps rather than somewhere else entirely.
          '  float lush = mdw_density(vMeadowAt.xz);',
          '  float bare = smoothstep(0.52, 0.30, lush);',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, uSoil, bare * 0.9);',
          '',
          /*
           * The beach, and why it is two colours rather than one.
           *
           * Sand does not stop at the water and it does not stop at the grass - it is wet
           * and dark right at the line, dries out and pales going up the beach, and then
           * loses to the grass somewhere further back. Three bands, so the eye reads a
           * gradient of DRYNESS rather than a stripe somebody painted.
           *
           * Driven by the same shoreDepth the water and the grass use, which is the only
           * reason the sand follows the bays instead of cutting across them.
           */
          '  float toWater = shoreDepth(vMeadowAt.xz);',
          '  float beach = 1.0 - smoothstep(-9.0, 0.6, toWater);',
          '  vec3 sand = mix(uSand, uDrySand, smoothstep(-5.5, -0.4, toWater));',
          '  diffuseColor.rgb = mix(sand, diffuseColor.rgb, beach);',
          '}',
        ].join('\n')
      );
  };

  return material;
}
