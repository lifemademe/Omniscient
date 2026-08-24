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
 *     setSize(w, h), initialize(...), setDepthTexture(t), getDepthTexture(),
 *     render(...), dispose()
 *
 * `getDepthTexture` was missing from this list and from both passes, and it is the one
 * that is not optional - the composer's teardown calls it on every pass. It only bites
 * when a SECOND custom pass is registered, because that is the first thing that rebuilds
 * the composer and therefore the first thing that walks the dispose path.
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

import type { ComposerPass } from './composerPass.js';

/*
 * The look table and the GLSL live next door, engine-free, so the browser-side shader check
 * can import them - see retroShader.ts. Re-exported here because every caller in the game
 * has always got them from this module and there is no reason to move that.
 */
import { FRAGMENT, RETRO_LOOKS, VERTEX } from './retroShader.js';
import {
  getAccessibilityPreferences,
  onAccessibilityPreferencesChanged,
} from '../accessibility/preferences.js';

import type { RetroLook, RetroLookName } from './retroShader.js';

export { FRAGMENT, RETRO_LOOKS, VERTEX } from './retroShader.js';
export type { RetroLook, RetroLookName } from './retroShader.js';

/** One complete look. Every field is a shader uniform; there is no master strength knob. */


/**
 * A fullscreen pass shaped like `postprocessing`'s Pass without being one.
 *
 * Everything public here is called by EffectComposer, so the names are its names rather
 * than ones chosen for this file.
 */
class RetroPass implements ComposerPass {
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
        uPixel: { value: this.target.pixel },
        uScreenA: { value: new THREE.Vector2() },
        uScreenB: { value: new THREE.Vector2() },
        uScreenC: { value: new THREE.Vector2() },
        uScreenD: { value: new THREE.Vector2() },
        uScreenOn: { value: 0 },
        uCurve: { value: this.target.curve },
        uAberration: { value: this.target.aberration },
        uScanline: { value: this.target.scanline },
        uScanPitch: { value: this.target.scanPitch },
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
    u.uPixel.value = look.pixel;
    u.uCurve.value = look.curve;
    u.uAberration.value = look.aberration;
    u.uScanline.value = look.scanline;
    u.uScanPitch.value = look.scanPitch;
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
    /*
     * Snapped, not eased.
     *
     * Every other field crossfades, because a television changing its own behaviour over a
     * fifth of a second is a television warming up. The signal's resolution is not that: a
     * picture sliding through 2.7 pixels on its way from 2 to 3 spends that time at a block
     * size no grid divides evenly, so the blocks shimmer and crawl. It is the one visibly
     * WRONG state this pass can be in, and it lasts exactly as long as the ease.
     *
     * So this one cuts. A source changing resolution cuts in reality too.
     */
    u.uPixel.value = to.pixel;
    u.uCurve.value += (to.curve - u.uCurve.value) * k;
    u.uAberration.value += (to.aberration - u.uAberration.value) * k;
    u.uScanline.value += (to.scanline - u.uScanline.value) * k;
    u.uScanPitch.value += (to.scanPitch - u.uScanPitch.value) * k;
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

  /**
   * Returns the depth texture this pass owns, which is none.
   *
   * Not optional, and its absence is a latent crash rather than a missing feature. The
   * composer's teardown walks every pass calling `getDepthTexture()` so it can release what
   * they hold, and a hand-rolled pass without it takes the whole rebuild down with
   * "t.getDepthTexture is not a function".
   *
   * It went unnoticed for as long as there was exactly ONE custom pass in the stack: nothing
   * ever rebuilt the composer after it was added, so the dispose path was never walked.
   * Registering a second one is what runs it, and the failure lands on whichever pass is
   * already mounted rather than on the new one - which is why this comment is on both.
   */
  public getDepthTexture(): THREE.DepthTexture | null {
    return null;
  }

  /** Four NDC corners in order, or null to grid the whole frame. */
  public setScreenQuad(corners: readonly THREE.Vector2[] | null): void {
    const u = this.material.uniforms;
    if (!corners || corners.length !== 4) {
      u.uScreenOn.value = 0;
      return;
    }
    (u.uScreenA.value as THREE.Vector2).copy(corners[0]);
    (u.uScreenB.value as THREE.Vector2).copy(corners[1]);
    (u.uScreenC.value as THREE.Vector2).copy(corners[2]);
    (u.uScreenD.value as THREE.Vector2).copy(corners[3]);
    u.uScreenOn.value = 1;
  }

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
let activeLook: RetroLookName = 'world';

/**
 * Preserve the authored grade while taking out the parts of the display treatment most
 * likely to cost readability or comfort.
 *
 * SOFT keeps the fiction of a transmitted picture, but removes all temporal modulation
 * and reduces geometry, convergence and raster artefacts. OFF is a genuinely clean image;
 * a setting labelled off must not quietly leave the vignette or colour cast behind.
 */
function accessibleLook(name: RetroLookName): RetroLook {
  const source = RETRO_LOOKS[name];
  const mode = getAccessibilityPreferences().displayFilter;
  if (mode === 'full') return source;
  if (mode === 'off') {
    return {
      pixel: 1,
      curve: 0,
      aberration: 0,
      scanline: 0,
      scanPitch: source.scanPitch,
      grille: 0,
      bleed: 0,
      vignette: 0,
      roll: 0,
      flicker: 0,
      saturation: 1,
      tint: new THREE.Color(1, 1, 1),
    };
  }

  return {
    ...source,
    pixel: 1 + (source.pixel - 1) * 0.42,
    curve: source.curve * 0.3,
    aberration: source.aberration * 0.25,
    scanline: source.scanline * 0.35,
    grille: source.grille * 0.2,
    bleed: source.bleed * 0.4,
    vignette: source.vignette * 0.65,
    roll: 0,
    flicker: 0,
    tint: source.tint.clone(),
  };
}

onAccessibilityPreferencesChanged(() => {
  effect?.pass.setLook(accessibleLook(activeLook), true);
});

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
  activeLook = name;
  effect?.pass.setLook(accessibleLook(name), immediate);
}

let acquireToken = 0;

/**
 * Open a scene as a signal being acquired, rather than as a room that was already there.
 *
 * TOMAS-REVIEW measured the entrance at ONE FRAME: the globe at t=2.27, the mast at full
 * brightness at t=2.30. No dissolve, no acquisition, the contact standing mid-idle in the
 * first frame he exists - while the HUD panels politely stagger in over 1.2s around him. Its
 * words: the single biggest piece of juice available in the game. The premise is an optical
 * feed reaching a machine that is not yet sure what it is looking at, and none of that was on
 * screen.
 *
 * ## Stepped, not eased - the review asked for the wrong shape here
 *
 * The review suggested opening at pixel 12 and easing to the preset over 0.9s. This pass
 * refuses to ease `uPixel` on purpose, and the note on that refusal is right: a picture
 * sliding through 2.7 pixels on its way from 2 to 3 spends the whole ease at a block size no
 * grid divides evenly, so the blocks shimmer and crawl. It is the one visibly WRONG state the
 * shader can be in.
 *
 * So the resolution comes down a LADDER, each rung held long enough to be a stable picture,
 * while curve and aberration - which do ease, and are supposed to - relax underneath it. That
 * is also the more honest reading of the fiction: a digital signal locking does not slide
 * through resolutions, it steps.
 *
 * Skipped entirely under reduced motion or a display filter that is off, because both are
 * asking for the picture rather than the performance.
 *
 * ## Shorter than the wireframe entrance, on purpose
 *
 * 0.55 rather than the 0.9 this was first written at, and the reason is an ordering that only
 * showed up once both effects were on screen together. `ContactScene.openAsUnknown` wraps the
 * room in lit wireframe edges for 0.8s, and those edges are ONE PIXEL WIDE - at the ladder's
 * first rung a block is twelve, so the coarse phase does not merely coexist with the
 * wireframe, it erases it. Captured side by side, the boxes were invisible at 12px and
 * obvious two rungs later.
 *
 * So the lock finishes first and hands over: the signal arrives, and then you watch the
 * machine's guess at the room resolve in a picture sharp enough to read it. Two effects in
 * sequence say two things; the same two on top of each other said neither.
 */
export function retroAcquire(seconds = 0.55): void {
  if (!effect) return;
  const preferences = getAccessibilityPreferences();
  if (preferences.reducedMotion || preferences.displayFilter === 'off') return;

  // A second call supersedes the first - a scene change during an acquire must not leave the
  // old ladder still stepping into the new room.
  const token = ++acquireToken;
  const base = accessibleLook(activeLook);
  const ladder = [
    { pixel: 12, curve: base.curve + 0.09, aberration: base.aberration + 0.02 },
    { pixel: 7, curve: base.curve + 0.05, aberration: base.aberration + 0.011 },
    { pixel: 4, curve: base.curve + 0.02, aberration: base.aberration + 0.005 },
  ];
  const step = (seconds * 1000) / (ladder.length + 1);

  effect.pass.setLook({ ...base, ...ladder[0] }, true);
  for (const [index, rung] of ladder.slice(1).entries()) {
    window.setTimeout(() => {
      if (acquireToken !== token) return;
      effect?.pass.setLook({ ...base, ...rung }, true);
    }, step * (index + 1));
  }
  window.setTimeout(() => {
    if (acquireToken !== token) return;
    effect?.pass.setLook(accessibleLook(activeLook), true);
  }, step * ladder.length);
}

/**
 * Tell the pass where the CRT's face is on screen, so the pixel grid can skip it.
 *
 * Four corners in NDC, in order round the quad, or null when there is no screen in frame.
 * Called every frame from the rig - the tube is a physical object and the camera moves, so
 * this is a per-frame fact rather than a setting.
 *
 * See the note in the shader for why the screen is exempt at all: it is the one surface in
 * the game that is already a raster display, and a second grid over it double-quantises.
 */
export function setRetroScreenQuad(corners: readonly THREE.Vector2[] | null): void {
  effect?.pass.setScreenQuad(corners);
}
