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

  /**
   * Less black at the root, less yellow at the tip.
   *
   * The ramp ran #2c4420 to #8fbf5e - almost black to a dry yellow-green - which was tuned
   * against the old unlit-ish ground and reads as dead thatch under a real sun. Grass in
   * light is SATURATED: dark green in its own shade at the base, and a bright cool green at
   * the tip where the light gets through the blade. The gap between them is what gives a
   * field depth when nothing casts a shadow.
   */
  /*
   * Lifted to meet the lighter ground, rather than dragging the ground back down.
   *
   * The ground moved up to sage over pale sand and these blades stayed where they were, so
   * a dark stalk was now sitting on a light field - a harder value split than before and
   * exactly the sort of contrast that stops a picture being restful. Two ways to close it:
   * push the ground back down, which throws away the calm the change bought, or bring the
   * grass up to it, which keeps it. Grass IS lighter than the soil it grows out of once the
   * sun is on it, so the second is also the true one.
   *
   * Overshot once on the way here. Lifted to #5a7440/#c3e08a the blades measured luma 135
   * against a ground at 129 - six values apart, which is no separation at all, and the field
   * dissolved into a single hazy mat. A tuft needs to be a bit DARKER at the base than the
   * ground it stands on, because a clump shades itself and the ground around it; the light
   * belongs at the tips, where it actually falls.
   *
   * The base stays clearly darker than the tip either way. That gradient is what gives a
   * blade its own form at this poly count, and flattening it to close the gap with the
   * ground would trade one flatness for another.
   */
  const base = new THREE.Color('#44603a');
  const tip = new THREE.Color('#b4d878');

  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    // Tapered, and faster near the tip so it looks like a blade rather than a wedge.
    // Sharper taper. At 0.75 the blade held most of its width to two-thirds up and read
    // as a wedge; a real blade is widest near the root and narrows the whole way.
    const halfWidth = 0.5 * (1 - Math.pow(t, 0.55) * 0.9);
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

/**
 * A seed head: one stalk, arching, with a spindle on the end.
 *
 * ## Why the field needed a second shape at all
 *
 * Because a meadow made only of blades has a flat top. Every blade is the same kind of
 * thing at roughly the same height, so the field's silhouette is a fuzzy horizontal line
 * however many of them there are - and §4.1 puts silhouette before everything, including
 * the count. What makes long grass read as LONG is the layer above it: a scatter of stalks
 * that have gone to seed, standing well clear of the mass and nodding at a different rate.
 *
 * It is also the difference between grass and grass that nobody has cut, which is the
 * entire jam theme in one prop. A mown lawn has no seed heads by definition - that is what
 * mowing is for.
 *
 * ## One strip, not a stem and a head
 *
 * The width profile does the work: near-constant and very thin for the first four fifths,
 * then a sine bulge for the last fifth. That is a stalk with a spindle on it, in one piece
 * of geometry with one draw, and at any distance the player will ever see it there is
 * nothing a separate head mesh would add.
 *
 * Arches harder than a blade - 0.5 against 0.34 - because a seed head is carrying weight at
 * the far end and a straight one reads as an aerial.
 */
/*
 * The widths below are in METRES at unit scale, and getting that wrong the first time
 * produced the exact failure this file already records for the blades. A stalk at 1.1cm
 * with a 13cm spindle on it is not a seed head, it is a flag: the field came out scattered
 * with flat tan lozenges catching the sun broadside, and at a squint they read as leaves
 * blowing about. Real seed heads are a few millimetres across and ten times longer than
 * they are wide, and the stylised references exaggerate the LENGTH.
 *
 * §4.1 again, and it is remarkable how often it is the answer: silhouette first. No colour
 * or count would have rescued the wrong width.
 */
function seedHeadGeometry(segments = 9): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  /**
   * Straw at the top, and the reason it is not brighter.
   *
   * The head is the only part of this field that sits above the grass line, so it is the
   * part that establishes where the top of the field IS - which means it has to be lighter
   * than the mass below it or it does nothing. It must not be lighter than the sky, and on
   * the smallholding the ground is already deliberately pale (calm is a value decision, see
   * the tunnel's own ground) - so this is a dry straw pulled well back from white rather
   * than the bleached colour real seed heads go.
   */
  const stalk = new THREE.Color('#5c6b38');
  const head = new THREE.Color('#b3a771');

  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    // Thin stalk, then a spindle in the last quarter. Sine so it swells and tapers again
    // rather than stepping out to a rectangle. The spindle is long, not fat - a quarter of
    // the stalk's length and 1.6cm across, which on a 0.8m stalk is 20cm by 16mm.
    const swell = t < 0.75 ? 0 : Math.sin(((t - 0.75) / 0.25) * Math.PI) * 0.008;
    const halfWidth = 0.0025 + swell;
    // The same arc as a blade. At 0.5 the tip travelled 45cm downwind of its own root and
    // the heads read as detached from the stalks carrying them.
    const lean = t * t * 0.34;
    // The colour change is tied to the swell, not to height, so the straw arrives exactly
    // where the head does however the profile is retuned later.
    const shade = stalk.clone().lerp(head, Math.min(1, swell / 0.005));

    positions.push(-halfWidth, t, lean, halfWidth, t, lean);
    colors.push(shade.r, shade.g, shade.b, shade.r, shade.g, shade.b);
  }

  positions.push(0, 1, 0.34);
  colors.push(head.r, head.g, head.b);
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
  /**
   * Regions where the grass is SHORT rather than absent - ground somebody keeps.
   *
   * `clear` removes blades, which is right for a path or a bed and wrong for the part of a
   * garden that is simply looked after: bare earth reads as scorched, not as tended. This
   * scales blade height inside a radius instead, with a soft edge so a kept patch fades into
   * rough ground rather than ending on a circle.
   *
   * `scale` is the multiplier at the centre; the falloff runs out to `radius`.
   */
  short?: Array<{ centre: THREE.Vector3; radius: number; scale: number }>;
  y?: number;
  /**
   * Blades per crown.
   *
   * Worth an option rather than a constant because it is really a COVERAGE control, and
   * that was not obvious until a field looked sparse at a hundred thousand blades. With a
   * fixed budget, blades and crowns trade against each other: gathering the same blades
   * into fewer, fatter tufts leaves more bare ground between them. A trodden verge wants
   * fat tufts and gaps; a field nobody has cut wants the crowns close enough to touch.
   */
  bladesPerClump?: [number, number];
  /**
   * Stalks gone to seed, standing above the grass line. Omit for anything mown or walked.
   *
   * A fraction of the blade count rather than an absolute, so retuning the density does not
   * silently turn a meadow into a cornfield. Around a twentieth reads as a field nobody has
   * cut this year; a tenth starts to read as a crop.
   */
  seedHeads?: {
    /** As a fraction of `count`. */
    share: number;
    /** Height range in metres. Should clear the blades, or there is no point. */
    height: [number, number];
  };
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
  const UP = new THREE.Vector3(0, 1, 0);

  /**
   * Grass grows in TUFTS, and this is the change that matters most.
   *
   * Every blade used to get its own independent position, which produces an even scatter -
   * and an even scatter is the one thing a field never is. Real grass comes up in clumps
   * from a single root: several blades splaying from nearly the same point, with bare
   * ground between the clumps. That texture is most of what the eye uses to recognise
   * grass at all, and without it any number of individually correct blades still reads as
   * bristles on a brush.
   *
   * So a clump centre is chosen, then a handful of blades are placed within a few
   * centimetres of it, SHARING its height - because blades from one root are the same age.
   */
  /**
   * Tight. A tuft comes out of ONE crown, not out of a patch.
   *
   * This was 0.075 - blades scattered anywhere in a 15cm square around the clump centre -
   * and that is not a tuft, it is a loose handful. Grass grows from a crown: the stems leave
   * the ground within a couple of centimetres of each other and splay as they rise, which is
   * why a real tuft is a dense point at the base opening into a fan at the top.
   *
   * At 0.022 the bases nearly touch and the height variation does the spreading instead, so
   * the silhouette gets the fan without the roots wandering. It also sharpens the gaps: the
   * same number of blades gathered into tighter groups leaves more bare ground visible
   * between them, and that alternation of dense and bare is most of what makes a field read
   * as a field rather than as a texture.
   */
  const CLUMP_SPREAD = 0.022;
  let clumpX = 0;
  let clumpZ = 0;
  let clumpLeft = 0;
  let clumpHeight = 1;

  /**
   * Whether anything is allowed to grow at a point, and how well - or null for bare.
   *
   * Pulled out of the blade loop so the seed heads can ask the same question. Two passes
   * scattering over the same ground with two copies of these rules is two passes that will
   * eventually disagree, and the way that shows up is a stalk standing in the middle of the
   * path, which is worse than no stalk at all.
   *
   * `lush` is remapped so `bareBelow` is a real edge rather than a fade to nothing: below it
   * there is no grass, and just above it the blades are short. That is what gives a bald
   * patch a fringe instead of a cut line.
   *
   * The beach margin is generous and RANDOMISED at its inner edge, because a real treeline
   * against sand is ragged; a clean arc would only be a different wrong line. It consumes
   * from the shared stream, which is why this is a closure over `rng` rather than a pure
   * function of position.
   */
  const lushAt = (x: number, z: number): number | null => {
    if (options.clear?.some((zone) => Math.hypot(x - zone.centre.x, z - zone.centre.z) < zone.radius)) {
      return null;
    }
    if (options.keepOffBeach !== undefined) {
      const inland = -shoreDepth(x, z);
      if (inland < options.keepOffBeach * range(rng, 0.55, 1.45)) return null;
    }
    const field = density(x, z);
    if (field < bareBelow) return null;
    return (field - bareBelow) / Math.max(0.001, 1 - bareBelow);
  };

  for (let i = 0; i < count; i++) {
    if (clumpLeft <= 0) {
      clumpX = at.x + range(rng, -width / 2, width / 2);
      clumpZ = at.z + range(rng, -depth / 2, depth / 2);
      // More blades per crown, since they now occupy a fraction of the footprint.
      const [fewest, most] = options.bladesPerClump ?? [6, 12];
      clumpLeft = fewest + Math.floor(rng() * (most - fewest + 1));
      clumpHeight = range(rng, 0.75, 1.25);
    }
    clumpLeft--;

    const x = clumpX + range(rng, -CLUMP_SPREAD, CLUMP_SPREAD);
    const z = clumpZ + range(rng, -CLUMP_SPREAD, CLUMP_SPREAD);

    const lush = lushAt(x, z);
    if (lush === null) continue;

    position.set(x, y, z);
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), range(rng, 0, Math.PI * 2));
    // clumpHeight is shared across the tuft - blades from one root are the same age.
    let kept = 1;
    for (const patch of options.short ?? []) {
      const dx = x - patch.centre.x;
      const dz = z - patch.centre.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= patch.radius) continue;
      // Smoothstep out to the radius, so the kept ground has an edge you can believe.
      const t = d / patch.radius;
      const edge = t * t * (3 - 2 * t);
      kept = Math.min(kept, patch.scale + (1 - patch.scale) * edge);
    }
    const tall = range(rng, low, high) * clumpHeight * (0.45 + 0.55 * lush) * kept;
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
    /*
     * Narrow. This was 0.07, and it is the answer to why the grass never read as grass.
     *
     * halfWidth runs to 0.5, so that scale gave a blade SEVEN CENTIMETRES across at the
     * base on a stalk 20-34cm tall - a ratio near 3:1, which is a leaf. Real grass is a few
     * millimetres wide and forty times longer than it is broad, and the stylised references
     * exaggerate the length rather than the width. Every other fix attempted here - colour,
     * clumping, height, taper - was correct and none of them could survive the silhouette
     * being wrong, because width is what the eye reads first.
     *
     * 0.026 gives roughly 2.6cm at the base tapering to a point: still chunky enough to
     * catch light as a facet at this poly budget, and now ten times longer than it is wide.
     */
    scale.set(range(rng, 0.7, 1.1) * 0.026, tall, tall);
    matrix.compose(position, quaternion, scale);

    // Thin, dry blades where the field is sparse - the same reason the soil shows there.
    const tint = new THREE.Color(1, 1, 1).lerp(dry, (1 - lush) * 0.55);
    placements.push({ matrix: matrix.clone(), tint });
  }

  /**
   * The seed heads, scattered independently of the crowns.
   *
   * Independently on purpose. A stalk is not one of the blades in a tuft grown tall - it
   * comes up between them - so tying it to a crown centre would line the heads up with the
   * clumps and give the field a regularity at exactly the scale the eye is best at
   * spotting. Scattered freely over the same density field, they land where the grass is
   * thick without repeating its rhythm.
   *
   * Only in the lush third. A seed head standing in a bald patch is a stalk with nothing
   * under it, which reads as a weed rather than as a field going over.
   *
   * The height is scaled far less by `lush` than the blades are (0.7-1.0 against
   * 0.45-1.0), because a stalk's whole job is to break the top line of the grass and one
   * that shortens with the field cannot.
   */
  const heads: Array<{ matrix: THREE.Matrix4; tint: THREE.Color }> = [];
  if (options.seedHeads) {
    const wanted = Math.round(count * options.seedHeads.share);
    const [headLow, headHigh] = options.seedHeads.height;

    for (let i = 0; i < wanted; i++) {
      const x = at.x + range(rng, -width / 2, width / 2);
      const z = at.z + range(rng, -depth / 2, depth / 2);
      const lush = lushAt(x, z);
      if (lush === null || lush < 0.35) continue;

      position.set(x, y, z);
      quaternion.setFromAxisAngle(UP, range(rng, 0, Math.PI * 2));
      const tall = range(rng, headLow, headHigh) * (0.7 + 0.3 * lush);
      // X is NOT scaled down the way a blade's is: seedHeadGeometry is authored at real
      // width already, so a stalk is 1.1cm and its spindle 6.6cm without help.
      scale.set(range(rng, 0.8, 1.2), tall, tall);
      matrix.compose(position, quaternion, scale);
      heads.push({
        matrix: matrix.clone(),
        tint: new THREE.Color(1, 1, 1).lerp(dry, (1 - lush) * 0.4),
      });
    }
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

  /**
   * One InstancedMesh per shape, sharing the material.
   *
   * Sharing it is what keeps the seed heads in the same weather - the gust is uniforms on
   * that one material, so a second material would be a second field blowing on its own
   * clock, and two grasses moving out of step is more obviously wrong than either being
   * still. The colour difference lives in the vertex colours of the geometry instead,
   * which costs nothing.
   */
  function instance(geometry: THREE.BufferGeometry, of: typeof placements): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, of.length));
    of.forEach((placement, i) => {
      mesh.setMatrixAt(i, placement.matrix);
      mesh.setColorAt(i, placement.tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Every blade is inside the patch; the automatic bounds would be computed from the base
    // geometry alone and cull the whole field the moment the patch centre left the frustum.
    mesh.frustumCulled = false;
    return mesh;
  }

  const node = ENGINE.SceneNode.create({ name: 'Meadow', position: new THREE.Vector3() });
  node.add(instance(bladeGeometry(), placements));
  if (heads.length > 0) node.add(instance(seedHeadGeometry(), heads));
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
export function meadowGround(options: GroundOptions): THREE.MeshStandardMaterial {
  /**
   * LIT now, and the reason it was not is gone.
   *
   * This was a MeshBasicMaterial, and the comment here used to explain why at length: the
   * outdoor sun was a PointLight with a 26 metre range, so a ground plane big enough to
   * reach the horizon fell outside the light past its near edge, faded to black across the
   * middle of the shot, and grew a dark band where it met the backdrop. All true, and all
   * true of a point light. The sun is a DirectionalLightNode now - parallel rays, no
   * falloff, every surface with the same orientation lit identically wherever it stands -
   * so the entire argument for unlit expired when that changed and nobody came back for it.
   *
   * The old note also claimed nothing was lost, because a flat plane has one normal and
   * lighting it only differs from not lighting it by a constant. That was right until
   * shadows: a constant cannot have a tree in it. This is the one surface in the game that
   * must receive shadows, because everything else in the scene stands ON it, and an object
   * with no shadow under it is an object that is not touching the ground.
   *
   * Still unfogged - the rig's fog is tuned to a room at fogFar 26 and would haze the field
   * out from the middle distance.
   */
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(options.grass),
    // Soil and grass are about as diffuse as surfaces get. No specular story to tell here.
    roughness: 0.96,
    metalness: 0,
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
