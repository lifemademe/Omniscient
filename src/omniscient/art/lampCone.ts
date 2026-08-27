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
void main() {
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
varying float vAlong;
varying vec3 vNormalView;
varying vec3 vToEye;
void main() {
  // Falls away from the bulb. The exponent is what stops the shaft arriving at the desk
  // as a ring - by the time it lands there is nothing left of it.
  float along = pow(clamp(vAlong, 0.0, 1.0), 1.7);
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
  float facing = pow(abs(dot(normalize(vNormalView), normalize(vToEye))), 0.85);
  // Never quite reaches the shade's mouth, so the shaft does not start on a hard ring.
  float mouth = smoothstep(1.0, 0.86, vAlong);
  float a = along * facing * mouth * uStrength;
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

  const geometry = new THREE.CylinderGeometry(apexRadius, baseRadius, length, 28, 10, true);
  // Built around the origin; shift it so the apex ring sits ON the bulb rather than half a
  // shaft above it, then the whole node is simply rotated to face the throw direction.
  geometry.translate(0, -length / 2, 0);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
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

  const shell = new THREE.Mesh(geometry, material);
  shell.frustumCulled = false;
  shell.renderOrder = 3;
  root.add(shell);

  if (motes > 0) {
    const flock = createMotes({
      at: new THREE.Vector3(0, -length * 0.55, 0),
      size: new THREE.Vector3(baseRadius * 1.5, length * 0.9, baseRadius * 1.5),
      count: motes,
      color: moteColor,
      scale: 0.0042,
      // Slow enough that a speck takes most of a minute to cross the shaft. Dust settling
      // in still air, not snow - and not the fly behaviour this helper does by default.
      fall: options.fallSpeed ?? 0.012,
      seed: `${seed}-motes`,
    });
    root.add(flock.root);
    root.traverse((o) => {
      o.userData.noShadowCast = true;
      if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) {
        (o as THREE.Mesh).castShadow = false;
        (o as THREE.Mesh).receiveShadow = false;
      }
    });
    aim(root, direction);
    return { root, idle: flock.idle };
  }

  root.traverse((o) => {
    o.userData.noShadowCast = true;
    if ((o as THREE.Mesh).isMesh) {
      (o as THREE.Mesh).castShadow = false;
      (o as THREE.Mesh).receiveShadow = false;
    }
  });
  aim(root, direction);
  return { root, idle: () => undefined };
}

/** Point the cone's -y axis down `direction`. */
function aim(root: ENGINE.SceneNode, direction: THREE.Vector3): void {
  const to = direction.clone().normalize();
  const from = new THREE.Vector3(0, -1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(from, to);
  (root as unknown as THREE.Object3D).quaternion.copy(q);
}
