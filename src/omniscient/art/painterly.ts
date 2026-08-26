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

export const PAINT_BANDING_LOOKS = {
  /** The established house look used by the contact dioramas. */
  house: { bands: 3, softness: 0.32 },
  /** Three readable warehouse value groups without the brittle edge of a hard comic ramp. */
  warehouseCel: { bands: 3, softness: 0.32 },
  /** Lower-contrast fallback for dense or low-resolution captures. */
  warehouseCelSoft: { bands: 4, softness: 0.5 },
} as const satisfies Record<string, Required<BandingOptions>>;

/**
 * Switch the world-height gradient on over one volume, or off everywhere.
 *
 * `centreZ` and `radius` name the volume; see uPaintZoneZ for why this is gated by position
 * rather than simply switched on. Passing a tint of zero disables it globally regardless of
 * the zone, which is what a scene teardown should do.
 */
export function setPaintHeightGradient(
  tint: number,
  centreZ = 0,
  radius = 0,
  low = -0.6,
  high = 4.5
): void {
  PAINT_UNIFORMS.uPaintHeightTint.value = tint;
  PAINT_UNIFORMS.uPaintZoneZ.value = centreZ;
  PAINT_UNIFORMS.uPaintZoneRadius.value = radius;
  PAINT_UNIFORMS.uPaintHeightLow.value = low;
  PAINT_UNIFORMS.uPaintHeightHigh.value = high;
}

export type PaintBandingLookName = keyof typeof PAINT_BANDING_LOOKS;

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
   * How much of each band is a ramp rather than a plateau.
   *
   * 0.17 was a hard step, and a hard step is the right shape when ONE light is drawing it.
   * This injection is inside the per-light loop, so it is never one: every light in a room
   * lays down its own independent three-step terrace at its own angle, and where those
   * terraces cross they break into irregular cells a few pixels across. Reported as grainy
   * shadows, and it is worst in shadow for a reason - the total is small down there, so each
   * step is a large jump relative to the value it is stepping from.
   *
   * Measured before it was changed, on the shop's left wall: a histogram with plateaus at
   * 69-74 and then nothing at all until 85. That is not noise, it is quantisation, and no
   * amount of looking at it as "grain" would have found the cause.
   *
   * 0.32 is the global cel-shaded setting settled through the F8 comparison panel. It keeps
   * the major three-value structure readable while leaving enough ramp to stop multiple
   * practical lights producing brittle, intersecting terraces.
   *
   * MEASURED, because a shared uniform read by a shader nobody can breakpoint is exactly the
   * kind of change that silently does nothing. Earlier frame comparisons established that
   * this shared uniform materially changes the image; the final 0.32 value is authored now,
   * rather than being an editor-only override.
   *
   * The first attempt to measure it looked at edge energy on flat wall patches and reported
   * no change at all - because a band transition on a wall lit from across the room is a
   * LOW-frequency event, and a Laplacian cannot see one. The injection was then tested for
   * life at 2 bands and 0.02 softness, which moved 61.9% of pixels: it is very much alive,
   * and the metric had been wrong rather than the change. Diff whole frames for this.
   */
  uPaintSoft: { value: 0.32 },
  /*
   * The height gradient: how much darker the base of the world is than the top of it.
   *
   * This is the "gradient as texture" the low-poly reference frames use, and it does a job
   * that lighting cannot. A toon ramp quantises the LIGHT on a surface, so two surfaces at
   * different heights lit by the same lamps land in the same band and read as the same
   * thing - which is why five levels of racking loaded with the same cartons came out as one
   * mass. Tinting the ALBEDO by world height separates them before the ramp ever sees them,
   * so each course of the rack sits in a different value band and the eye can count them.
   *
   * It also does the other thing flat shading is bad at: contact. An upright that meets the
   * floor at the same value it has three metres up is a post standing in a room; one that
   * darkens toward its base is a post bolted to the floor.
   *
   * Zero by default, so no scene gets this unless it asks.
   */
  uPaintHeightTint: { value: 0 },
  uPaintHeightLow: { value: -0.6 },
  uPaintHeightHigh: { value: 4.5 },
  /*
   * And it is confined to one volume.
   *
   * These uniforms are shared by every banded material in the game - that is the whole point
   * of them, one write and the entire world re-bands - which means a height tint switched on
   * for the warehouse would also darken the floor of the workstation and every diorama. The
   * warehouse sits about 1200 units down z from everything else, so the treatment is gated
   * on being inside a radius of a named centre. WarehouseCelStyle sets it from its own root's
   * world position, so moving the mission does not silently move the effect off it.
   */
  uPaintZoneZ: { value: 0 },
  uPaintZoneRadius: { value: 0 },
};

interface PaintBandingState {
  onBeforeCompile: THREE.Material['onBeforeCompile'];
  customProgramCacheKey: THREE.Material['customProgramCacheKey'];
}

/** Materials are weakly tracked so an isolated mission can restore its exact prior shader. */
const BANDED_MATERIALS = new WeakMap<THREE.MeshStandardMaterial, PaintBandingState>();

export function setPaintBandingLook(name: PaintBandingLookName): void {
  const look = PAINT_BANDING_LOOKS[name];
  PAINT_UNIFORMS.uPaintBands.value = look.bands;
  PAINT_UNIFORMS.uPaintSoft.value = look.softness;
}

export function isPaintBanded(material: THREE.MeshStandardMaterial): boolean {
  return BANDED_MATERIALS.has(material);
}

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

  if (BANDED_MATERIALS.has(material)) return material;

  const originalOnBeforeCompile = material.onBeforeCompile;
  const originalProgramCacheKey = material.customProgramCacheKey;
  BANDED_MATERIALS.set(material, {
    onBeforeCompile: originalOnBeforeCompile,
    customProgramCacheKey: originalProgramCacheKey,
  });

  material.onBeforeCompile = (shader, renderer) => {
    originalOnBeforeCompile.call(material, shader, renderer);
    shader.uniforms.uPaintBands = PAINT_UNIFORMS.uPaintBands;
    shader.uniforms.uPaintSoft = PAINT_UNIFORMS.uPaintSoft;
    shader.uniforms.uPaintHeightTint = PAINT_UNIFORMS.uPaintHeightTint;
    shader.uniforms.uPaintHeightLow = PAINT_UNIFORMS.uPaintHeightLow;
    shader.uniforms.uPaintHeightHigh = PAINT_UNIFORMS.uPaintHeightHigh;
    shader.uniforms.uPaintZoneZ = PAINT_UNIFORMS.uPaintZoneZ;
    shader.uniforms.uPaintZoneRadius = PAINT_UNIFORMS.uPaintZoneRadius;

    /*
     * World position, carried by a varying of our own.
     *
     * three only defines `worldPosition` in the vertex shader under a set of conditions
     * (envmap, shadowmap, transmission) that are none of this project's business to depend
     * on - a material that happened not to meet them would silently lose the gradient. One
     * varying costs nothing and cannot be switched off by someone else's feature flags.
     */
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      ['#include <common>', 'varying vec3 vPaintWorld;'].join('\n')
    ).replace(
      '#include <begin_vertex>',
      ['#include <begin_vertex>', 'vPaintWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'].join('\n')
    );

    /*
     * Applied to the ALBEDO, not to the lit result.
     *
     * Tinting after lighting would flatten the modelling the lamps are doing and fight the
     * ramp; tinting the diffuse colour is indistinguishable from having authored the
     * material that value in the first place, so it bands cleanly and the highlights stay
     * where they were.
     */
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      [
        '#include <color_fragment>',
        '{',
        '  float paintZone = 1.0 - step( uPaintZoneRadius, abs( vPaintWorld.z - uPaintZoneZ ) );',
        '  float paintLift = smoothstep( uPaintHeightLow, uPaintHeightHigh, vPaintWorld.y );',
        '  float paintTint = mix( 1.0 - uPaintHeightTint, 1.0, paintLift );',
        '  diffuseColor.rgb *= mix( 1.0, paintTint, paintZone * step( 0.0001, uPaintHeightTint ) );',
        '}',
      ].join('\n')
    );

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
        'uniform float uPaintHeightTint;',
        'uniform float uPaintHeightLow;',
        'uniform float uPaintHeightHigh;',
        'uniform float uPaintZoneZ;',
        'uniform float uPaintZoneRadius;',
        'varying vec3 vPaintWorld;',
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
  material.customProgramCacheKey = () => `${originalProgramCacheKey.call(material)}|paint-band`;
  material.needsUpdate = true;
  return material;
}

/** Restore a material that was banded by an isolated runtime presentation. */
export function removePaintBanding(material: THREE.MeshStandardMaterial): void {
  const original = BANDED_MATERIALS.get(material);
  if (!original) return;
  material.onBeforeCompile = original.onBeforeCompile;
  material.customProgramCacheKey = original.customProgramCacheKey;
  BANDED_MATERIALS.delete(material);
  material.needsUpdate = true;
}
