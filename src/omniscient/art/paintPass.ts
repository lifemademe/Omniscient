/**
 * The painterly pass. A real one, with neighbours.
 *
 * ## Why the last attempt failed
 *
 * The first try injected noise into every material through onBeforeCompile. It was rejected
 * on sight as "smudged textures", and that was the correct verdict: a per-material shader
 * can only multiply the colour it already has. It cannot look sideways. Everything that
 * makes Arcane, Tears of the Kingdom or Disco Elysium read as painted needs to know what is
 * NEXT to a pixel - where an edge is, which direction a shape runs, which neighbours belong
 * to the same region. None of that is reachable from inside a surface shader.
 *
 * I then said a real pass was impossible on this pipeline, and that was wrong. `retro.ts`
 * has been one all along: `WebGLEffectData.passes` is `any[]` and goes straight to
 * `composer.addPass()`, so a hand-rolled object with the right shape gets full screen-space
 * access on WebGL with no engine change and no WebGPU migration. This is that, again.
 *
 * ## What actually makes a frame look painted
 *
 * Four things, in the order they matter:
 *
 * 1. **Kuwahara.** The one that does the heavy lifting. For each pixel it looks at four
 *    overlapping quadrants and takes the mean of whichever has the LOWEST variance. Flat
 *    regions get flatter; edges stay razor sharp instead of blurring. That combination -
 *    smooth interiors, hard boundaries - is the signature of a brush loaded with paint, and
 *    no amount of blurring or noise gets near it. It is also the reason this has to be a
 *    pass: it is sixteen taps per pixel of the neighbourhood.
 *
 * 2. **Ink on the silhouettes.** A Sobel edge on luminance, darkened rather than drawn, so
 *    it reads as a line the painter left rather than a filter's outline. Arcane's is heavy
 *    and coloured; this one is restrained because the game underneath it is not a comic.
 *
 * 3. **Cold shadow, warm light.** A renderer darkens a surface towards black as it turns
 *    from the light; a painter turns it BLUE, because that is what the sky is doing to it,
 *    and puts warmth back only where light lands.
 *
 * 4. **Canvas tooth.** Quietest of the four and the one that stops the other three reading
 *    as a filter.
 *
 * ## Where it sits
 *
 * Order 70, ahead of the CRT at 80. Paint first, then the screen it is being displayed on -
 * the other way round would put brush strokes on top of the scanlines, which is a picture of
 * a monitor rather than a picture on one.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { FRAGMENT, PAINT_LOOKS, VERTEX } from './paintShader.js';

import type { PaintLook, PaintLookName } from './paintShader.js';

export { PAINT_LOOKS } from './paintShader.js';
export type { PaintLook, PaintLookName } from './paintShader.js';

class PaintPass {
  public enabled = true;
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

  /** Live values, and where they are heading. Eased, so a switch is not a cut. */
  private now: PaintLook = { ...PAINT_LOOKS.off };
  private target: PaintLook = { ...PAINT_LOOKS.off };

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1920, 1080) },
        uRadius: { value: 0 },
        uStrength: { value: 0 },
        uInk: { value: 0 },
        uTint: { value: 0 },
        uTooth: { value: 0 },
        uEncode: { value: 0 },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  public setLook(look: PaintLook, immediate = false): void {
    this.target = { ...look };
    if (immediate) this.now = { ...look };
  }

  /** The live values, for a tuning panel to read and write. */
  public get values(): PaintLook {
    return this.now;
  }

  public setSize(width: number, height: number): void {
    (this.material.uniforms.uResolution.value as THREE.Vector2).set(width, height);
  }

  public initialize(): void {
    /* Nothing to warm up. Present because the composer calls it. */
  }

  public setDepthTexture(): void {
    /* No depth needed - this reads colour only. */
  }

  public render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget,
    outputBuffer: THREE.WebGLRenderTarget,
    deltaTime?: number
  ): void {
    const k = Math.min(1, (deltaTime ?? 1 / 60) / 0.22);
    this.now.radius += (this.target.radius - this.now.radius) * k;
    this.now.strength += (this.target.strength - this.now.strength) * k;
    this.now.ink += (this.target.ink - this.now.ink) * k;
    this.now.tint += (this.target.tint - this.now.tint) * k;
    this.now.tooth += (this.target.tooth - this.now.tooth) * k;

    const u = this.material.uniforms;
    u.tDiffuse.value = inputBuffer.texture;
    u.uRadius.value = this.now.radius;
    u.uStrength.value = this.now.strength;
    u.uInk.value = this.now.ink;
    u.uTint.value = this.now.tint;
    u.uTooth.value = this.now.tooth;
    u.uEncode.value = this.renderToScreen ? 1 : 0;

    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}

interface PaintConfig extends ENGINE.BaseEffectConfig {
  look?: PaintLookName;
}

class OmniscientPaintEffect extends ENGINE.IPostProcessEffect<PaintConfig> {
  public override readonly type = 'omniscient-paint';
  /** Ahead of the CRT at 80 - paint the picture, then show it on a screen. */
  public override readonly order = 70;

  public readonly pass = new PaintPass();

  public override getDefaultConfig(): PaintConfig {
    return { type: this.type, enabled: true, order: this.order, look: 'painted' };
  }

  public override createWebGLEffect(): ENGINE.WebGLEffectData {
    return { effects: [], passes: [this.pass] };
  }

  public override applyWebGLConfig(_data: ENGINE.WebGLEffectData, config: PaintConfig): void {
    if (config.look) this.pass.setLook(PAINT_LOOKS[config.look]);
  }

  public override dispose(): void {
    this.pass.dispose();
  }
}

interface PaintHost {
  registerEffect: (effect: ENGINE.IPostProcessEffect) => void;
  getEffect: (type: string) => unknown;
}

let effect: OmniscientPaintEffect | null = null;
let mounted = false;

/** Mount the pass. Returns false until the pipeline exists - same contract as installRetro. */
export function installPaint(post: PaintHost): boolean {
  if (mounted) return true;
  effect ??= new OmniscientPaintEffect();
  post.registerEffect(effect as unknown as ENGINE.IPostProcessEffect);
  mounted = post.getEffect('omniscient-paint') !== null;
  return mounted;
}

export function setPaintLook(name: PaintLookName, immediate = false): void {
  effect?.pass.setLook(PAINT_LOOKS[name], immediate);
}

/** The live values, for the F8 panel. Null before the pass is mounted. */
export function paintValues(): PaintLook | null {
  return effect?.pass.values ?? null;
}

