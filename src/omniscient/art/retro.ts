/**
 * The CRT, as a real post-process pass.
 *
 * ## Why this exists at all
 *
 * §221 records that four engine effects extend `WebGPUOnlyEffectBase` and return an empty
 * effect list on WebGL - and that the retro and pixelation effects are two of them. That is
 * still true, so `ENGINE.PostProcessPass.Retro` cannot do anything here no matter what it
 * is configured with. It fails silently, which is the worst way for it to fail.
 *
 * One correction to make while we are here: **colour grading is in the same set.**
 * `ColorGradingEffect.createWebGLEffect` returns `{ effects: [] }`
 * (`.engine/src/render/postprocessing/effects/ColorGradingEffect.ts:48`). The saturation of
 * 1.22 configured in the rig has therefore never applied to a single frame of this game.
 * That is why the colour kept reading flat after ACES went in - ACES desaturates on the
 * highlight rolloff and nothing was putting it back. This pass carries the saturation now,
 * because it is the only thing in the stack that actually runs.
 *
 * ## How it gets to run
 *
 * `WebGLEffectData` has two fields: `effects`, which must be instances of the
 * `postprocessing` library's `Effect` class, and `passes`, which is `any[]` and goes
 * straight to `composer.addPass()`. The library is bundled inside `genesys.min.mjs` and is
 * not resolvable from this project, so `effects` is unreachable - but `passes` only needs
 * an object with the shape EffectComposer calls, and that shape is small:
 *
 *     enabled, needsSwap, renderToScreen, renderer, mainScene, mainCamera
 *     setSize(w, h), initialize(...), setDepthTexture(t), render(...), dispose()
 *
 * So this is a hand-rolled pass wrapping a ShaderMaterial. No new dependency, no second
 * copy of the postprocessing library, and no risk of one library's `Effect` being handed to
 * another library's `EffectPass`.
 *
 * ## Colour space, which is the part that quietly breaks these
 *
 * This pass is now the last one in the stack, so it is the one that hands the canvas its
 * pixels - and that makes the sRGB encode its job. It reads a linear buffer and writes
 * display-referred values.
 *
 * Worth writing down how easy it was to conclude the opposite. `EffectMaterial` defines
 * `ENCODE_OUTPUT: "1"` at construction and nothing in the library ever unsets it, so on a
 * reading of the source every EffectPass appears to encode, always. The reason it does not
 * is a level down, in three itself: `WebGLRenderer` picks the output colour space from the
 * **current render target**, and for any target that is not the canvas that is
 * `LinearSRGBColorSpace` - which makes `linearToOutputTexel` the identity. The define is
 * present and compiled in and does nothing. The encode only ever happened because the last
 * pass was drawing to the screen.
 *
 * Reading the library said "already encoded". The frame said otherwise: mid-tones dropped
 * from 19 to 2.5, which is exactly sRGB 0.0758 read as if it were linear. §252 - the
 * measurement is the thing that settles it, and the source is a hypothesis.
 *
 * `uEncode` is driven from `renderToScreen` rather than hardcoded, so if this pass ever
 * stops being last it degrades to a straight copy instead of double-encoding.
 *
 * The split in the shader follows from this. Aberration and phosphor bleed happen above the
 * encode, on scene-referred light, because that is where a lens and a tube's own persistence
 * act. Scanlines, grille, vignette and the grade happen below it, on the displayed picture,
 * because that is what they are artefacts of.
 *
 * ## §187, which is the reason for the presets
 *
 * The CRT language belongs to the machine. If a scanline crawls over Adaeze's field then
 * the field is on a screen, and the whole premise - that these are real places and you are
 * the thing on the other end of the phone - is gone. So the pass is always mounted but its
 * look is per-context: `world` is a clean camera, `console` is the room the machine lives
 * in, and only `machine` is an actual tube.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

/** One complete look. Every field is a shader uniform; there is no master strength knob. */
export interface RetroLook {
  /** Barrel distortion. 0 is a flat pane; the tube's dark border only appears above 0. */
  curve: number;
  /** Radial RGB split, in UV units at the corners. */
  aberration: number;
  /** Depth of the scanline troughs, 0-1. */
  scanline: number;
  /** Bands across the screen height is half this. 480 gives a band every ~4.5px at 1080p. */
  scanCount: number;
  /** Aperture-grille strength - the per-device-pixel RGB triad mask. */
  grille: number;
  /** Phosphor persistence: how much of the trailing smear survives. */
  bleed: number;
  vignette: number;
  /** Brightness of the rolling refresh bar. */
  roll: number;
  /** Mains-hum flicker amplitude. Small numbers only; this is a nausea risk. */
  flicker: number;
  /** Applies in every preset - this is the grade ACES took off, not a retro artefact. */
  saturation: number;
  tint: THREE.Color;
}

/**
 * The three contexts.
 *
 * `world` is deliberately not "off". A slight corner aberration and a soft vignette are
 * camera behaviour, not television behaviour, and they cost nothing while giving the
 * dioramas the lens the reference frames have. Everything that says CRT is at zero.
 */
export const RETRO_LOOKS = {
  world: {
    curve: 0,
    aberration: 0.0008,
    scanline: 0,
    scanCount: 480,
    grille: 0,
    bleed: 0,
    vignette: 0.16,
    roll: 0,
    flicker: 0,
    saturation: 1.16,
    tint: new THREE.Color(1, 1, 1),
  },
  console: {
    curve: 0.010,
    aberration: 0.0018,
    scanline: 0.055,
    scanCount: 620,
    grille: 0,
    bleed: 0.20,
    vignette: 0.30,
    roll: 0.020,
    flicker: 0.0015,
    saturation: 1.12,
    tint: new THREE.Color(0.99, 1.0, 1.02),
  },
  machine: {
    curve: 0.055,
    aberration: 0.0060,
    scanline: 0.20,
    scanCount: 480,
    grille: 0.55,
    bleed: 0.55,
    vignette: 0.42,
    roll: 0.055,
    flicker: 0.004,
    saturation: 1.05,
    // Cold phosphor. Green-blue lift with the red pulled down is the colour of a monitor
    // that has been on for nine hours, and it is the palette the wireframe city is drawn in.
    tint: new THREE.Color(0.94, 1.02, 1.08),
  },
} satisfies Record<string, RetroLook>;

export type RetroLookName = keyof typeof RETRO_LOOKS;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uCurve;
uniform float uAberration;
uniform float uScanline;
uniform float uScanCount;
uniform float uGrille;
uniform float uBleed;
uniform float uVignette;
uniform float uRoll;
uniform float uFlicker;
uniform float uSaturation;
uniform vec3 uTint;
uniform float uEncode;
varying vec2 vUv;

vec3 linearToSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);

  // Tube curvature. Pushes outward, so the corners sample past the edge of the buffer -
  // which is what the mask at the bottom is for.
  vec2 tube = vUv + c * r2 * uCurve;

  // Radial split, weaker in the middle. A real tube converges its guns at the centre and
  // never quite manages it at the corners.
  vec2 split = c * uAberration * (0.30 + r2 * 1.6);

  vec3 col;
  col.r = texture2D(tDiffuse, tube + split).r;
  col.g = texture2D(tDiffuse, tube).g;
  col.b = texture2D(tDiffuse, tube - split).b;

  // Phosphor persistence. Taken with max() rather than added, so it can only pull a trail
  // out behind something already bright instead of fogging the whole frame.
  if (uBleed > 0.0001) {
    float tx = 1.0 / uResolution.x;
    vec3 trail =
      texture2D(tDiffuse, tube - vec2(tx * 2.0, 0.0)).rgb * 0.55 +
      texture2D(tDiffuse, tube - vec2(tx * 5.0, 0.0)).rgb * 0.30 +
      texture2D(tDiffuse, tube - vec2(tx * 9.0, 0.0)).rgb * 0.15;
    col = max(col, trail * uBleed);
  }

  // Everything above works on scene-referred light; everything below is a property of the
  // displayed picture. This is the line between them - see the note in the module header.
  col = mix(col, linearToSRGB(col), uEncode);

  // Scanlines. sin squared so the troughs are narrow and the lit part stays wide - the
  // other way round reads as a grate over the picture rather than as a raster.
  float sl = sin(tube.y * uScanCount * 3.14159265);
  col *= 1.0 - uScanline * sl * sl;

  // Aperture grille, in device pixels rather than UV so it stays one triad per pixel at
  // any resolution. The gain afterwards returns the average brightness the mask removed.
  if (uGrille > 0.0001) {
    float m = mod(gl_FragCoord.x, 3.0);
    vec3 triad = vec3(step(m, 1.0), step(1.0, m) * step(m, 2.0), step(2.0, m));
    col *= mix(vec3(1.0), mix(vec3(0.70), vec3(1.16), triad), uGrille);
    col *= 1.0 + uGrille * 0.22;
  }

  // The refresh bar drifting up the screen - the artefact you get filming a monitor.
  if (uRoll > 0.0001) {
    float roll = fract(tube.y * 0.7 - uTime * 0.09);
    float bar = smoothstep(0.0, 0.10, roll) * (1.0 - smoothstep(0.10, 0.26, roll));
    col *= 1.0 + bar * uRoll;
  }

  col *= 1.0 + sin(uTime * 47.0) * uFlicker;

  // Saturation and tint apply in every preset. This is the grade, not the CRT.
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSaturation);
  col *= uTint;

  col *= 1.0 - uVignette * smoothstep(0.10, 0.60, r2);

  // Black off anything the curvature pulled in from outside the buffer. Gated on uCurve
  // because with no curve tube is exactly vUv and this would put a dark rim on a
  // perfectly flat image.
  if (uCurve > 0.0001) {
    vec2 edge = smoothstep(vec2(0.0), vec2(0.004), tube)
              * smoothstep(vec2(0.0), vec2(0.004), 1.0 - tube);
    col *= edge.x * edge.y;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * A fullscreen pass shaped like `postprocessing`'s Pass without being one.
 *
 * Everything public here is called by EffectComposer, so the names are its names rather
 * than ones chosen for this file.
 */
class RetroPass {
  public enabled = true;
  /** We write the result to outputBuffer, so the composer must swap after us. */
  public needsSwap = true;
  public renderToScreen = false;
  public needsDepthTexture = false;
  public renderer: THREE.WebGLRenderer | null = null;
  public mainScene: THREE.Scene | null = null;
  public mainCamera: THREE.Camera | null = null;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;

  /** Where the look is heading, and where it is now. */
  private target: RetroLook = { ...RETRO_LOOKS.world, tint: RETRO_LOOKS.world.tint.clone() };
  private time = 0;
  /** Seconds to cover most of the distance to a new look. */
  private tau = 0.22;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1920, 1080) },
        uTime: { value: 0 },
        uCurve: { value: this.target.curve },
        uAberration: { value: this.target.aberration },
        uScanline: { value: this.target.scanline },
        uScanCount: { value: this.target.scanCount },
        uGrille: { value: this.target.grille },
        uBleed: { value: this.target.bleed },
        uVignette: { value: this.target.vignette },
        uRoll: { value: this.target.roll },
        uFlicker: { value: this.target.flicker },
        uSaturation: { value: this.target.saturation },
        uTint: { value: this.target.tint.clone() },
        uEncode: { value: 1 },
      },
    });

    /*
     * One triangle, not two. A fullscreen quad has a diagonal seam down which the GPU
     * runs two half-empty warps; a triangle big enough to cover the viewport has none.
     * The UVs run 0-2 so they still come out 0-1 across the visible part.
     */
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
    );
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));

    this.quad = new THREE.Mesh(geometry, this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Ask for a look. Blends unless told not to. */
  public setLook(look: RetroLook, immediate = false): void {
    this.target = { ...look, tint: look.tint.clone() };
    if (!immediate) return;

    const u = this.material.uniforms;
    u.uCurve.value = look.curve;
    u.uAberration.value = look.aberration;
    u.uScanline.value = look.scanline;
    u.uScanCount.value = look.scanCount;
    u.uGrille.value = look.grille;
    u.uBleed.value = look.bleed;
    u.uVignette.value = look.vignette;
    u.uRoll.value = look.roll;
    u.uFlicker.value = look.flicker;
    u.uSaturation.value = look.saturation;
    (u.uTint.value as THREE.Color).copy(look.tint);
  }

  /**
   * Exponential approach, so the blend rate is frame-rate independent and a mode change
   * eases rather than snapping. Nothing else in the game needs to tick this - the composer
   * hands us a delta every frame.
   */
  private advance(deltaTime: number): void {
    const dt = Math.min(Math.max(deltaTime, 0), 0.1);
    this.time += dt;

    const k = 1 - Math.exp(-dt / this.tau);
    const u = this.material.uniforms;
    const to = this.target;

    u.uTime.value = this.time;
    u.uCurve.value += (to.curve - u.uCurve.value) * k;
    u.uAberration.value += (to.aberration - u.uAberration.value) * k;
    u.uScanline.value += (to.scanline - u.uScanline.value) * k;
    u.uScanCount.value += (to.scanCount - u.uScanCount.value) * k;
    u.uGrille.value += (to.grille - u.uGrille.value) * k;
    u.uBleed.value += (to.bleed - u.uBleed.value) * k;
    u.uVignette.value += (to.vignette - u.uVignette.value) * k;
    u.uRoll.value += (to.roll - u.uRoll.value) * k;
    u.uFlicker.value += (to.flicker - u.uFlicker.value) * k;
    u.uSaturation.value += (to.saturation - u.uSaturation.value) * k;
    (u.uTint.value as THREE.Color).lerp(to.tint, k);
  }

  // ===== EffectComposer's interface from here down =====

  public initialize(): void {}

  public setDepthTexture(): void {}

  public setSize(width: number, height: number): void {
    (this.material.uniforms.uResolution.value as THREE.Vector2).set(width, height);
  }

  public render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget,
    outputBuffer: THREE.WebGLRenderTarget,
    deltaTime?: number
  ): void {
    this.advance(deltaTime ?? 1 / 60);
    this.material.uniforms.tDiffuse.value = inputBuffer.texture;
    // Only the pass that reaches the canvas owes it an encode - see the module header.
    this.material.uniforms.uEncode.value = this.renderToScreen ? 1 : 0;
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}

interface RetroConfig extends ENGINE.BaseEffectConfig {
  look?: RetroLookName;
}

/**
 * Order 80 puts it after anti-aliasing (72) and therefore last in the stack.
 *
 * That is on purpose. AA run after scanlines would blur them into a grey wash, and the
 * grille has to land on final device pixels or it stops being one triad wide. Being last
 * is also what hands it `renderToScreen`, via the pipeline's `updateRenderToScreen`.
 */
class OmniscientRetroEffect extends ENGINE.IPostProcessEffect<RetroConfig> {
  public override readonly type = 'omniscient-retro';
  public override readonly order = 80;

  public readonly pass = new RetroPass();

  public override getDefaultConfig(): RetroConfig {
    return { type: this.type, enabled: true, order: this.order, look: 'world' };
  }

  public override createWebGLEffect(): ENGINE.WebGLEffectData {
    return { effects: [], passes: [this.pass] };
  }

  public override applyWebGLConfig(_data: ENGINE.WebGLEffectData, config: RetroConfig): void {
    if (config.look) this.pass.setLook(RETRO_LOOKS[config.look]);
  }

  public override dispose(): void {
    this.pass.dispose();
  }
}

/**
 * One instance for the process.
 *
 * The pipeline rebuilds its composer whenever an effect is toggled, and `createWebGLEffect`
 * is called again each time - handing back the same pass keeps the blend state and the
 * clock continuous across a rebuild instead of resetting the look mid-scene.
 */
let effect: OmniscientRetroEffect | null = null;
let mounted = false;

/** What `installRetro` needs from the manager. Narrow on purpose - see below. */
interface RetroHost {
  registerEffect(e: ENGINE.IPostProcessEffect): void;
  getEffect(type: string): ENGINE.IPostProcessEffect | null;
}

/**
 * Mount the pass, and confirm it actually mounted.
 *
 * `PostProcessManager.registerEffect` is one line - `this.pipeline?.registerEffect(effect)`
 * - and the pipeline is built lazily on the first render, well after `beginPlay`. So
 * calling this from setup does nothing at all, silently, and returns as if it had worked.
 * This cost a full build-capture-measure cycle: the game compiled, ran at 240 FPS, logged
 * nothing, and the frame was byte-identical to the one before the pass existed.
 *
 * `configureEffect` does not have this problem because it falls back to `pendingConfig` and
 * replays once the pipeline appears. `registerEffect` has no such fallback, which is why
 * this one has to check its own work rather than trust the call.
 *
 * Hence the return value: false means "not yet, call me again next frame". The rig does.
 *
 * §297 in one function - a fix that reports success is not a fix. The only evidence that
 * counts is `getEffect` handing the effect back.
 */
export function installRetro(post: RetroHost): boolean {
  if (mounted) return true;

  effect ??= new OmniscientRetroEffect();
  post.registerEffect(effect as unknown as ENGINE.IPostProcessEffect);

  mounted = post.getEffect('omniscient-retro') !== null;
  return mounted;
}

/**
 * Switch context. Call this from wherever the game changes what you are looking at -
 * a diorama, the console room, or the machine's own interior.
 */
export function setRetroLook(name: RetroLookName, immediate = false): void {
  effect?.pass.setLook(RETRO_LOOKS[name], immediate);
}
