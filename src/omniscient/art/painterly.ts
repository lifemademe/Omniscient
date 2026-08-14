/**
 * The painterly conversion.
 *
 * What actually separates the reference frames from this build is not detail - it is that
 * their light falls in BANDS. A surface in the street scene goes lit / half / shadow in
 * three readable steps with soft edges, the way a painter blocks form, instead of sliding
 * through a smooth gradient the way a renderer does. Banding the diffuse response is the
 * single biggest lever on the whole look, and it needs no post-processing, no WebGPU and
 * no new pipeline: three.js has shipped it since forever as MeshToonMaterial.
 *
 * `painterlyFrom` converts a MeshStandardMaterial into a toon material that keeps the
 * albedo map, the normal map and the palette colour, and adds a quantised light ramp.
 * What it LOSES is the roughness map - toon shading has no roughness - so surfaces whose
 * detail rides on roughness keep only the albedo and normal share of it. That trade is
 * exactly what the prototype-on-one-object step exists to judge (§234), because §232 put
 * most of the texture pass's detail into roughness on purpose.
 *
 * The ramp is deliberately not pure: the shadow step is lifted well off black and the
 * steps are close in the upper range, so banding reads as paint rather than as cel. A
 * two-step ramp is a comic; four steps with a lifted floor is gouache.
 */

import * as THREE from 'three';

/** Shared ramps, keyed by their step values - one texture per distinct ramp (§187). */
const RAMPS = new Map<string, THREE.DataTexture>();

/**
 * A quantised light ramp.
 *
 * `steps` are N·L multipliers from shadow to lit, 0..255. Nearest filtering is what makes
 * them bands - with linear filtering the ramp is just a slow gradient and the whole
 * point evaporates.
 */
export function gradientRamp(steps: number[]): THREE.DataTexture {
  const key = steps.join(',');
  const cached = RAMPS.get(key);
  if (cached) return cached;

  const data = new Uint8Array(steps.length);
  steps.forEach((value, i) => (data[i] = value));

  const ramp = new THREE.DataTexture(data, steps.length, 1, THREE.RedFormat);
  ramp.magFilter = THREE.NearestFilter;
  ramp.minFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;

  RAMPS.set(key, ramp);
  return ramp;
}

/**
 * The house ramp: four steps, floor lifted to 30%, the top two close together.
 *
 * The lifted floor is §230's cold-room discipline - shadows in the references are dark
 * and COLOURED, never black, and the hemisphere fill supplies the colour as long as the
 * ramp leaves it something to colour.
 */
export const PAINT_RAMP = [78, 148, 214, 255];

export interface PainterlyOptions {
  /** Ramp steps, shadow to lit. Defaults to the house ramp. */
  ramp?: number[];
}

/**
 * A toon twin of a standard material.
 *
 * Not a mutation: the source material stays untouched, so an object can be A/B'd by
 * swapping between the two, and headless callers that never render lose nothing.
 */
export function painterlyFrom(
  source: THREE.MeshStandardMaterial,
  options: PainterlyOptions = {}
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: source.color.clone(),
    map: source.map,
    normalMap: source.normalMap,
    normalScale: source.normalScale.clone(),
    gradientMap: gradientRamp(options.ramp ?? PAINT_RAMP),
    transparent: source.transparent,
    opacity: source.opacity,
    side: source.side,
    fog: source.fog,
  });
}

export interface BandingOptions {
  /** Number of light bands. 3 reads as gouache; 2 as comic; 5+ approaches smooth. */
  bands?: number;
  /** Width of the soft edge between bands, 0..1 of a band. */
  softness?: number;
}

/**
 * ONE uniform object, shared by every banded material in the game.
 *
 * Handing each material its own uniform would mean a slider had to find and update
 * hundreds of them. Sharing the object means the tuning panel writes `.value` once and
 * every surface in every scene re-bands on the next frame - which is the difference
 * between judging this against the reference frames interactively and judging it one
 * thirty-second rebuild at a time.
 */
export const PAINT_UNIFORMS = {
  uPaintBands: { value: 3 },
  /**
   * 0.17, settled with the F8 panel against the reference frames.
   *
   * 0.02 is a cel shader - the light pool on a wall gets a razor edge and the whole room
   * reads as a comic. 0.30, the first guess, was so soft the banding could not be seen at
   * all in a capture. This is the value where a pool of light has a definite edge you
   * could point at and still looks brushed rather than inked.
   */
  uPaintSoft: { value: 0.17 },
};

/**
 * Banded light on a material that stays PBR.
 *
 * The toon prototype proved both halves of the argument in one capture: the banding is
 * exactly the painterly read the references have, and throwing away the PBR response to
 * get it wrecks the value structure - the shell left its value group and turned near
 * white, because Lambert plus a full-height ramp answers the same lights differently
 * than a rough dielectric does.
 *
 * So the banding goes INTO MeshStandardMaterial instead: onBeforeCompile quantises the
 * direct-light N·L while roughness, metalness and the ambient/hemisphere terms stay
 * untouched. Direct light falls in painted steps; the coloured floor that §230 wants in
 * the shadows still comes from the hemisphere fill, smooth and cold, exactly as before.
 *
 * The injection replaces one line of `lights_physical_pars_fragment` and is therefore
 * pinned to this project's three version (@gnsx/three 0.185.x). If the replace ever
 * misses, the material compiles unbanded rather than broken - the failure mode is the
 * old look, not a pink screen.
 */
export function applyPaintBanding(
  material: THREE.MeshStandardMaterial,
  options: BandingOptions = {}
): THREE.MeshStandardMaterial {
  if (options.bands !== undefined) PAINT_UNIFORMS.uPaintBands.value = options.bands;
  if (options.softness !== undefined) PAINT_UNIFORMS.uPaintSoft.value = options.softness;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPaintBands = PAINT_UNIFORMS.uPaintBands;
    shader.uniforms.uPaintSoft = PAINT_UNIFORMS.uPaintSoft;

    const pars = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
      [
        'float dotNLraw = saturate( dot( geometryNormal, directLight.direction ) );',
        'float dotNL = paintBand( dotNLraw );',
      ].join('\n')
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_pars_fragment>',
      [
        'uniform float uPaintBands;',
        'uniform float uPaintSoft;',
        'float paintBand( float x ) {',
        '  float q = floor( x * uPaintBands ) / uPaintBands;',
        '  float f = fract( x * uPaintBands );',
        '  return q + smoothstep( 0.0, uPaintSoft, f ) / uPaintBands;',
        '}',
        pars,
      ].join('\n')
    );
  };

  // Materials sharing the injection must share a program: without a stable key, three
  // compiles one program per material and the cache thrashes.
  material.customProgramCacheKey = () => `paint-band`;
  material.needsUpdate = true;
  return material;
}
