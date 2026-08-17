/**
 * Certainty, as a rendering dimension. See ART_DIRECTION §1 and §2.
 *
 * ## The law
 *
 * **Warm is known. Cold is inferred.** Every material lerps toward `ACCENT.data` by
 * `(1 - certainty)` and desaturates by the same amount. Nothing else has to encode
 * progress: the player's eye goes to the warmest thing in frame, and the warmest thing in
 * frame is whatever they have earned by talking to somebody.
 *
 * ## What this is actually fixing
 *
 * Mirela's shop, measured: mean saturation 0.58, mean R−B **+56**, 61% of the frame below
 * value 102 and 3% above 178. One hue, no highlight, no cool anywhere. And at a squint the
 * brightest object is a blank white board on the right - the radio, which is the subject of
 * the entire request, reads as a mid-grey box behind it.
 *
 * Both faults have the same cause and the same fix. There is no colour contrast because
 * every surface is the same amber, and there is no focal point because nothing is
 * privileged. Cooling everything the machine has not been told about does both jobs at
 * once: it puts blue in the frame *and* it leaves the subject as the only warm thing in it.
 *
 * That is the argument for this direction in one image. The composition problem and the
 * fiction want exactly the same thing.
 *
 * ## Idempotence
 *
 * Materials are touched repeatedly - a scene remounts, a beat re-runs, certainty rises. So
 * the original colour is stashed in `userData` on first contact and every later call lerps
 * from *that*, never from the current value. Without it the colour walks toward cold a bit
 * more each time and a room slowly turns blue on its own, which is the kind of bug that
 * looks like an art decision for a week.
 *
 * Materials are also shared between props by the palette module, so anything given its own
 * certainty gets its own clone first. Otherwise setting the radio to 1.0 would set every
 * other object sharing `MAT.equipment` to 1.0 with it.
 */

import * as THREE from 'three';

import { ACCENT } from './palette.js';

/** The five tiers, as named values. Use these rather than bare numbers at call sites. */
export const CERTAINTY = {
  /** Not known to exist. Callers should not render it at all. */
  ABSENT: 0,
  /** Something is there. Bounding shape only. */
  SUSPECTED: 0.2,
  /** Shape known. Flat-shaded, cold, no maps. The game's resting state. */
  SHAPED: 0.45,
  /** Described in conversation. Materials arrive. */
  DESCRIBED: 0.75,
  /** The thing being talked about. Fully warm, full detail. */
  KNOWN: 1,
} as const;

const COLD = new THREE.Color(ACCENT.data);
/** The warm end of the law. Practical-lamp amber, not orange - see ACCENT. */
const WARM = new THREE.Color(ACCENT.amber);

interface Marked {
  certaintyBase?: THREE.Color;
  certaintyOwned?: boolean;
  certainty?: number;
  /** Authored values, kept so repeated calls compute from the original and never drift. */
  certaintyRoughness?: number;
  certaintyMetalness?: number;
}

/**
 * Signed. Positive pulls cold, negative pulls warm, zero is the authored colour.
 *
 * The first version only ever cooled, and taken to its conclusion the whole room went grey:
 * frame saturation fell to 0.248 and the radio - the one object at KNOWN, the one thing the
 * player is here for - came out a pale box, because "not cooled" is not the same as warm.
 * A law with only one direction cannot make a focal point; it can only fail to destroy one.
 *
 * So the scale has a neutral point at 0.7 and travels both ways from it. Below, colour
 * drains and slides toward `ACCENT.data`. Above, it saturates and leans warm. An object
 * somebody has just described does not merely stop being blue - it visibly comes to life,
 * which is the reward the whole direction is built to pay.
 *
 * The 0.72 exponent shapes the cold half only: it keeps the SHAPED tier around 0.47 rather
 * than 0.65, which was the difference between a cool room and a colourless one.
 */
const NEUTRAL = 0.7;

function signedPull(certainty: number): number {
  const c = Math.min(1, Math.max(0, certainty));
  if (c <= NEUTRAL) return Math.pow(1 - c / NEUTRAL, 0.72);
  return -((c - NEUTRAL) / (1 - NEUTRAL));
}

interface CertaintyUniforms {
  uCertAmount: { value: number };
  uCertCold: { value: THREE.Color };
  uCertWarm: { value: THREE.Color };
}

/**
 * Install the law into the material's shader, once.
 *
 * It has to happen here rather than on `material.color`, because colour is a *multiplier*
 * on the map. Desaturating it cannot desaturate a texture - it can only dim it. The
 * pegboard is the proof: at SHAPED its colour was halved in saturation and pulled a third
 * of the way to cyan, and it came out the same amber, merely darker, still the largest
 * warm mass in the frame while representing something the machine has not been told about.
 *
 * Injected after `map_fragment`, which is the first point where `diffuseColor` holds base
 * colour times texture. Everything downstream - lighting, shadow, tone mapping - then sees
 * the corrected albedo, so a cooled surface also bounces cool light, which multiplying a
 * colour could never have done.
 *
 * Any existing `onBeforeCompile` is chained rather than replaced: the painterly pass uses
 * one, and clobbering it would silently strip a whole other effect.
 */
function ensureShader(material: THREE.Material): CertaintyUniforms {
  const marked = material as THREE.Material & { certaintyUniforms?: CertaintyUniforms };
  if (marked.certaintyUniforms) return marked.certaintyUniforms;

  const uniforms: CertaintyUniforms = {
    uCertAmount: { value: 0 },
    uCertCold: { value: COLD.clone() },
    uCertWarm: { value: WARM.clone() },
  };
  marked.certaintyUniforms = uniforms;

  const previous = material.onBeforeCompile?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.uCertAmount = uniforms.uCertAmount;
    shader.uniforms.uCertCold = uniforms.uCertCold;
    shader.uniforms.uCertWarm = uniforms.uCertWarm;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform float uCertAmount;\nuniform vec3 uCertCold;\nuniform vec3 uCertWarm;\nvoid main() {'
      )
      .replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          '{',
          '  float certCold = max(0.0, uCertAmount);',
          '  float certWarm = max(0.0, -uCertAmount);',
          '  float certLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(certLuma), certCold * 0.55);',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, uCertCold, certCold * 0.5);',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, uCertWarm, certWarm * 0.15);',
          '  diffuseColor.rgb = mix(vec3(certLuma), diffuseColor.rgb, 1.0 + certWarm * 0.6);',
          '}',
        ].join('\n')
      );
  };
  material.needsUpdate = true;
  return uniforms;
}

/**
 * Clone a material without throwing away its shader.
 *
 * `Material.copy()` copies a fixed list of known fields, and `onBeforeCompile` is not on
 * it - it is a prototype method that effects override as an own property, so a clone
 * silently reverts to the empty base implementation. Any injected shader is simply gone,
 * with no error and no warning, and the only symptom is an effect that stops happening.
 *
 * It had already happened. The flood in Vasile's cellar animates its ripple through
 * `onBeforeCompile`, and the water prop carries no authored certainty - so it defaults to
 * SHAPED, gets cloned here, and lost its ripple on the way. The reflection kept working,
 * because roughness and metalness ARE copied, which is exactly the kind of partial survival
 * that makes a thing look fine while half of it is dead. `flood.update()` went on writing a
 * uniform that nothing was reading.
 *
 * `customProgramCacheKey` needs no help: three's default returns the source text of
 * `onBeforeCompile`, so carrying the function across carries the correct cache key with it.
 *
 * The bookkeeping travels with it, and that part is not optional. Carrying the shader but
 * not the `certaintyOwned` flag produces a material that already HAS the colour law
 * injected and does not know it - so the next pass installs a second copy, the fragment
 * shader ends up declaring `uniform float uCertAmount` twice, and the material fails to
 * compile. Not at build: mid-conversation, the first time a mission raises a certainty in
 * a room that also has a waterline. Exported because anyone else cloning these materials
 * has the same problem, and there should be one way to do it.
 */
export function cloneKeepingShader(material: THREE.Material): THREE.Material {
  const clone = material.clone();
  if (Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile')) {
    clone.onBeforeCompile = material.onBeforeCompile;
  }

  const from = material as THREE.Material & Marked;
  const to = clone as THREE.Material & Marked;
  to.certaintyOwned = from.certaintyOwned;
  to.certaintyBase = from.certaintyBase;
  to.certainty = from.certainty;
  to.certaintyRoughness = from.certaintyRoughness;
  to.certaintyMetalness = from.certaintyMetalness;

  const uniforms = (material as THREE.Material & { certaintyUniforms?: CertaintyUniforms })
    .certaintyUniforms;
  if (uniforms) {
    (clone as THREE.Material & { certaintyUniforms?: CertaintyUniforms }).certaintyUniforms =
      uniforms;
  }

  return clone;
}

function applyToMaterial(material: THREE.Material, certainty: number): void {
  const standard = material as THREE.MeshStandardMaterial & Marked;
  if (!standard.color) return;

  standard.certaintyBase ??= standard.color.clone();
  const amount = signedPull(certainty);

  // The colour law lives in the shader now - see ensureShader. The authored colour is left
  // exactly as written, which also means this stays idempotent for free.
  ensureShader(material).uCertAmount.value = amount;

  /*
   * Unknown things are matte. A specular highlight is information about a surface, and an
   * object nobody has described has no surface yet - leaving the roughness alone let the
   * white boxes on the shelf catch the bench lamp and read as *polished*, which is the
   * most specific a shape can look while meaning nothing.
   */
  if (standard.roughness !== undefined) {
    standard.roughness = Math.min(1, (standard.certaintyRoughness ??= standard.roughness) + Math.max(0, amount) * 0.35);
  }
  if (standard.metalness !== undefined) {
    standard.metalness = (standard.certaintyMetalness ??= standard.metalness) * (1 - Math.max(0, amount));
  }

  /*
   * The subject lifts itself.
   *
   * ART_DIRECTION §1 gives tier 4 "a practical light or a bounce if the object plausibly
   * catches one", and the reason is measured: with the colour law alone the radio read at
   * luma 81 against a blank white board at 155. Warm is not the same as bright, and the
   * eye goes to the brightest thing before it goes to the warmest one - so the one object
   * the whole request is about was still losing to a piece of scenery.
   *
   * A small emissive in the material's own colour rather than a light: it costs nothing,
   * it cannot miss its target, and it survives a prop being moved or re-parented. It is
   * deliberately weak - this should read as the object being *attended to*, not as it
   * glowing, and anything stronger turns evidence into a power-up.
   */
  if (standard.emissive) {
    const lift = Math.max(0, (certainty - 0.9) / 0.1) * 0.16;
    standard.emissive.copy(standard.certaintyBase).multiplyScalar(lift);
  }

  /* Flat shading below SHAPED: this is the 90s CG tier and it should look like it. */
  const flat = certainty < CERTAINTY.SHAPED;
  if (standard.flatShading !== flat) {
    standard.flatShading = flat;
    standard.needsUpdate = true;
  }

  standard.certainty = certainty;
}

/**
 * The THREE.Mesh that actually draws, which on this engine is not the node you traversed.
 *
 * `MeshNode` sets `isMesh = true` on **itself** and, under COLLAPSE_MESH_COMPONENT, never
 * adds its inner `THREE.Mesh` to the scene graph. So a traversal finds the node, the node
 * answers `isMesh`, and everything downstream looks correct - while the object being
 * rendered is somewhere else entirely.
 *
 * It gets worse. The node keeps two materials: `_material`, which is whatever you passed to
 * create(), and `_mesh.material`, which is what the renderer draws - and they are different
 * objects, because the setter routes through `resourceManager.loadGenericMaterial` and
 * assigns the *result*. The public getter returns the rendered one only while
 * `isRenderingScene` is true, and returns `_material` at every other moment, including the
 * one where a scene builder wants to change how something looks.
 *
 * So reading `node.material` outside a render, changing it, and writing it back is three
 * operations on the wrong object, and all three succeed. Two full build-capture-measure
 * cycles showed a mean frame difference of 0.7 - indistinguishable from noise - with no
 * warning anywhere, because nothing had failed.
 *
 * The inner mesh is reachable through MeshNode's public `mesh` getter, which is the only
 * reference anywhere to the thing actually on screen.
 */
export function renderTargetOf(object: THREE.Object3D): THREE.Mesh | null {
  const inner = (object as { mesh?: THREE.Mesh }).mesh;
  if (inner?.isMesh) return inner;
  const mesh = object as THREE.Mesh;
  return mesh.isMesh && mesh.material !== undefined ? mesh : null;
}

/**
 * Set a subtree's certainty.
 *
 * Safe to call every frame and safe to call twice with the same value - see the note on
 * idempotence above. Unlit materials are skipped entirely: sky, sea, backdrop and painted
 * distance are not objects the machine is uncertain about, they are the edge of its model,
 * and cooling them would tint the whole world.
 */
export function applyCertainty(root: THREE.Object3D, certainty: number): number {
  let touched = 0;
  root.traverse((object) => {
    const mesh = renderTargetOf(object);
    if (!mesh) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next: THREE.Material[] = [];

    for (const material of materials) {
      if (!material) continue;
      if (material instanceof THREE.MeshBasicMaterial) {
        next.push(material);
        continue;
      }

      // Own it before changing it, or every prop sharing this material comes with us.
      const marked = material as THREE.Material & Marked;
      const mine = marked.certaintyOwned ? material : cloneKeepingShader(material);
      (mine as THREE.Material & Marked).certaintyOwned = true;
      applyToMaterial(mine, certainty);
      next.push(mine);
      touched += 1;
    }

    if (next.length > 0) mesh.material = next.length === 1 ? next[0] : next;
  });
  return touched;
}
