import * as THREE from 'three';
import * as ENGINE from '@gnsx/genesys.js';

import { createMotes } from '../geometry/wildlife';

/**
 * The air a lamp is standing in.
 *
 * §186 asks for haze and shafts of light rather than more modelled detail, on the grounds
 * that they buy painterly depth far more cheaply. Every practical in this game was throwing
 * a pool onto a surface and nothing in between: the workstation lamp lit the desk and the
 * notebook beautifully, and the 30cm of space under the shade was empty, so the fixture
 * read as a decal projector rather than as a bulb in a room somebody breathes in.
 *
 * ## Why a shell and not a volume
 *
 * A real volumetric needs to march the light's depth buffer, which is not a thing this
 * project can afford in a scene that already spends a cube map on one bench shadow. What is
 * used here instead is the oldest trick there is: an open-ended cone, double-sided, blended
 * additively, with no depth write. The camera sees the far wall of the cone through the
 * near wall, both contribute, and the two add up thickest where the shell is most edge-on -
 * which is exactly where a real shaft of dusty air would be deepest. The volume is a
 * side-effect of the geometry rather than something the shader has to reason about.
 *
 * Two terms do the rest. `along` fades the shaft out as it falls away from the bulb, so it
 * never reaches the surface as a hard-edged ring - the pool the light itself throws has to
 * be what lands on the desk, not this. `graze` is the edge-on term, and it is what keeps
 * the cone from reading as a solid ice-cream cone when the camera is square onto it.
 *
 * ## What is deliberately NOT here
 *
 * No tone-mapping opt-out, and no borrowing of `lampWarm` / `lampCore`. Both were the
 * obvious way to make this bright and both are how this codebase has produced white chips
 * where it wanted a warm glow - an additive pass that skips the tone mapper clips the
 * moment anything else warm lands in the same pixels. The colour is passed in, sits well
 * below the light's own, and the strength is tuned against a render rather than a number
 * that looked right in source.
 */
export interface LampConeOptions {
  /** Where the bulb is, in the space of the node this gets added to. */
  readonly apex: THREE.Vector3;
  /** Which way the light throws. Need not be normalised. */
  readonly direction: THREE.Vector3;
  /** How far the visible shaft carries before it has faded out entirely. */
  readonly length: number;
  /** Radius at the bulb - the shade's aperture, not a point. */
  readonly apexRadius: number;
  /** Radius where the shaft fades out. */
  readonly baseRadius: number;
  readonly color: string;
  /** Peak alpha of the shell. Small: 0.3 is already clearly visible. */
  readonly strength?: number;
  /** Motes drifting inside the shaft. 0 for none. */
  readonly motes?: number;
  /** Metres per second the motes sink. See `fall` in createMotes. */
  readonly fallSpeed?: number;
  readonly moteColor?: string;
  readonly seed?: string;
}

export interface LampCone {
  readonly root: ENGINE.SceneNode;
  /** Drive the motes. Safe to call with the node hidden. */
  readonly idle: (deltaTime: number) => void;
}

const VERTEX = `
varying float vAlong;
varying vec3 vNormalView;
varying vec3 vToEye;
varying vec3 vLocal;
void main() {
  vLocal = position;
  // CylinderGeometry's uv.y runs 0 at the bottom ring to 1 at the top. The cone is built
  // apex-up and then rotated onto the light's axis, so this is "how close to the bulb".
  vAlong = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalView = normalize(normalMatrix * normal);
  vToEye = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = `
uniform vec3 uColor;
uniform float uStrength;
uniform float uTime;
varying float vAlong;
varying vec3 vNormalView;
varying vec3 vToEye;
varying vec3 vLocal;

/*
 * Cheap value noise, so the shaft has grain instead of a gradient.
 *
 * A critic measured the previous version and found 52% of adjacent pixel pairs EXACTLY
 * equal, with identical-value runs up to fifteen pixels - a smooth band, which reads as a
 * translucent plastic skirt hanging off the shade. What air in a beam actually looks like is
 * particulate, and §4.1 asks for dust in the cone by name.
 *
 * Two octaves is enough at this size and costs almost nothing. It drifts DOWN over time,
 * slowly, because dust falls - the same direction the motes travel, so the two read as one
 * material rather than as a texture with sprites in front of it.
 */
float mrHash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}
float mrNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = mrHash(i);
  float n100 = mrHash(i + vec3(1.0, 0.0, 0.0));
  float n010 = mrHash(i + vec3(0.0, 1.0, 0.0));
  float n110 = mrHash(i + vec3(1.0, 1.0, 0.0));
  float n001 = mrHash(i + vec3(0.0, 0.0, 1.0));
  float n101 = mrHash(i + vec3(1.0, 0.0, 1.0));
  float n011 = mrHash(i + vec3(0.0, 1.0, 1.0));
  float n111 = mrHash(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}
void main() {
  /*
   * Falls away from the bulb - GENTLY. The exponent was 1.7 and that was the whole fault.
   *
   * At 1.7 the density is down to 0.31 by the middle of the shaft and effectively zero at
   * the bottom, and the mouth term below zeroes the very top. Between them all the air
   * lived in a thin ring under the shade with nothing beneath it, so a critic scanning
   * across the gap between lamp and desk measured a mean of 0.67 - the shaft had not been
   * softened, it had been deleted.
   *
   * 0.85 keeps roughly half the density at mid-shaft, which is what makes the space between
   * the shade and the desk read as occupied rather than as a smudge on the bulb.
   */
  float along = pow(clamp(vAlong, 0.0, 1.0), 0.85);
  /*
   * Faces turned TOWARD the camera carry the shaft; the silhouette fades out.
   *
   * This is the opposite of the usual shell trick, and the usual trick was tried first and
   * rendered wrong. Weighting by grazing angle is right for a soap bubble, where what you
   * are drawing IS the skin - it brightens the rim, and on a cone the rim is two straight
   * lines, so the lamp got a hard-edged trapezoid hanging off it instead of air.
   *
   * A shaft is the reverse. It has no skin; it is only ever seen through, and the middle -
   * where the cone's normals point back at the lens - is where a real one has the most
   * dust to scatter off. Fading the silhouette to nothing is also what makes the geometry
   * stop being visible as geometry.
   */
  // 1.5, up from 0.85: the silhouette was dropping 124 to 90 in six pixels, which is an
  // edge. A shaft does not have one.
  float facing = pow(abs(dot(normalize(vNormalView), normalize(vToEye))), 1.5);
  /*
   * Softened from 0.86 to 0.975, because it was cancelling the taper it sits next to.
   *
   * NOTE: no backticks in this comment - it lives inside a template literal, and one ends
   * the shader string mid-file. The variable "along" brightens toward the bulb; this one
   * darkens toward the bulb to avoid a hard ring at
   * the shade's mouth. At 0.86 the two met over most of the visible length and produced a
   * shaft of almost constant density - measured flat at 58-68 across a 240px scan. It only
   * has to soften the last few percent.
   */
  float mouth = smoothstep(1.0, 0.975, vAlong);
  vec3 drift = vec3(0.0, uTime * 0.06, 0.0);
  float grain =
    mrNoise(vLocal * 52.0 + drift) * 0.58 + mrNoise(vLocal * 124.0 + drift * 1.7) * 0.42;
  /*
   * Harder contrast than the first attempt, which measured a mean adjacent-pixel difference
   * of 2.76 and 43% of neighbours exactly equal - grain that is present in the source and
   * invisible on the screen. Still floored above zero: this is texture in a volume, not
   * holes punched through it.
   */
  float a = along * facing * mouth * uStrength * (0.28 + 1.35 * grain);
  // Additive blending multiplies by alpha, so the rgb is NOT premultiplied here.
  gl_FragColor = vec4(uColor, a);
}
`;

export function createLampCone(options: LampConeOptions): LampCone {
  const {
    apex, direction, length, apexRadius, baseRadius, color,
    strength = 0.55, motes = 0, moteColor = '#d8c49a', seed = 'lamp-cone',
  } = options;

  const root = ENGINE.SceneNode.create({ name: 'LampCone', position: apex.clone() });

  /*
   * ## Three nested shells, because one shell has no middle
   *
   * A single cone rendered additively is a constant thickness of glass: a critic scanned
   * across it and found the alpha stepping 8 to 58 in eight pixels and then sitting flat at
   * 58-68 for 240 - a straight silhouette with a uniform interior, which is a slab, not air.
   *
   * The `facing` term should taper it and does not do enough on its own, because a cone this
   * narrow only swings its normals through a small angle across the frame. Nesting fixes it
   * geometrically instead: a ray through the middle crosses six surfaces, a ray near the
   * edge crosses two, so density builds toward the axis the way it does in a real shaft. The
   * inner shells are also shorter, which is what makes the light densify around the bulb
   * rather than along the whole throw.
   *
   * Three, not more: each is a draw, and by the fourth the gain is under a level.
   */
  const SHELLS: ReadonlyArray<{ radius: number; reach: number; weight: number }> = [
    { radius: 1.0, reach: 1.0, weight: 0.85 },
    { radius: 0.68, reach: 0.86, weight: 0.5 },
    { radius: 0.4, reach: 0.66, weight: 0.34 },
  ];

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength * 0.85 },
      uTime: { value: 0 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    // Nothing in the world should be occluded BY air, but air must still be occluded by the
    // desk it stops at - so the depth test stays on and only the write is off.
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: false,
  });

  const clocks: Array<{ value: number }> = [];
  for (const [index, spec] of SHELLS.entries()) {
    const geometry = new THREE.CylinderGeometry(
      apexRadius * spec.radius,
      baseRadius * spec.radius,
      length * spec.reach,
      28,
      10,
      true
    );
    // Built around the origin; shifted so the apex ring sits ON the bulb rather than half a
    // shaft above it. The node is then rotated once, so every shell shares the throw.
    geometry.translate(0, -(length * spec.reach) / 2, 0);
    const shellMaterial = index === 0 ? material : material.clone();
    shellMaterial.uniforms.uStrength = { value: strength * spec.weight };
    shellMaterial.uniforms.uColor = { value: new THREE.Color(color) };
    // Each shell keeps its own clock offset, so the three grains never line up into one
    // pattern - which is what would put a moire through the shaft instead of dust in it.
    shellMaterial.uniforms.uTime = { value: index * 11.0 };
    clocks.push(shellMaterial.uniforms.uTime);
    const shell = new THREE.Mesh(geometry, shellMaterial);
    shell.frustumCulled = false;
    shell.renderOrder = 3 + index;
    root.add(shell);
  }

  if (motes > 0) {
    const flock = createMotes({
      at: new THREE.Vector3(0, -length * 0.55, 0),
      /*
       * 0.8 of the base radius, down from 1.5 - the box was WIDER than the cone.
       *
       * Motes are drawn as Points and lit by nothing; they carry their own colour. Inside
       * the beam that is right and reads as dust. Outside it they are specks glowing ten
       * times over an unlit wall, which is a sprite layer pasted on the screen rather than
       * dust in a light - a critic measured 16% of them sitting on background below value
       * 30, peaking at 147 against a wall of 10.
       *
       * Dust is only visible where light strikes it. The cheapest way to honour that here is
       * to keep the particles inside the volume that is lit.
       */
      size: new THREE.Vector3(baseRadius * 0.8, length * 0.82, baseRadius * 0.8),
      count: motes,
      color: moteColor,
      /*
       * 0.011, up from 0.0042 - they were smaller than a pixel.
       *
       * A critic scanning the cone body found zero discrete motes and called the shaft
       * clean fog. They were there the whole time: 44 of them, at a world size that at this
       * camera distance lands under one screen pixel, so they dithered into the gradient
       * instead of sitting in it. `sizeAttenuation` means this is a real size in the room,
       * not a screen size, which is exactly why it can be too small to exist.
       */
      scale: 0.011,
      // Slow enough that a speck takes most of a minute to cross the shaft. Dust settling
      // in still air, not snow - and not the fly behaviour this helper does by default.
      fall: options.fallSpeed ?? 0.012,
      seed: `${seed}-motes`,
    });
    root.add(flock.root);
    const step = (deltaTime: number): void => {
      for (const clock of clocks) clock.value += deltaTime;
      flock.idle(deltaTime);
    };
    root.traverse((o) => {
      o.userData.noShadowCast = true;
      if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) {
        (o as THREE.Mesh).castShadow = false;
        (o as THREE.Mesh).receiveShadow = false;
      }
    });
    aim(root, direction);
    return { root, idle: step };
  }

  root.traverse((o) => {
    o.userData.noShadowCast = true;
    if ((o as THREE.Mesh).isMesh) {
      (o as THREE.Mesh).castShadow = false;
      (o as THREE.Mesh).receiveShadow = false;
    }
  });
  aim(root, direction);
  return {
    root,
    idle: (deltaTime: number): void => {
      for (const clock of clocks) clock.value += deltaTime;
    },
  };
}

/** Point the cone's -y axis down `direction`. */
function aim(root: ENGINE.SceneNode, direction: THREE.Vector3): void {
  const to = direction.clone().normalize();
  const from = new THREE.Vector3(0, -1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(from, to);
  (root as unknown as THREE.Object3D).quaternion.copy(q);
}
