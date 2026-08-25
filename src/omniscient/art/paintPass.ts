/**
 * Warehouse stylisation pass.
 *
 * It performs restrained, edge-preserving colour simplification and a camera-matched
 * depth/normal prepass. That prepass supplies silhouette and crease ink with ordinary depth
 * testing, so outlines cannot show through shelves or walls. It runs at order 70, before the
 * subtle CRT pass at order 80, keeping scanlines crisp and interface overlays untouched.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import type { ComposerPass } from './composerPass.js';

import { FRAGMENT, PAINT_LOOKS, VERTEX } from './paintShader.js';

import type { PaintLook, PaintLookName } from './paintShader.js';

export { PAINT_LOOKS } from './paintShader.js';
export type { PaintLook, PaintLookName } from './paintShader.js';

class PaintPass implements ComposerPass {
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
  private readonly normalMaterial = new THREE.MeshNormalMaterial({
    blending: THREE.NoBlending,
    depthTest: true,
    depthWrite: true,
  });
  private readonly normalTarget: THREE.WebGLRenderTarget;
  private readonly clearColor = new THREE.Color();
  private width = 1920;
  private height = 1080;
  private normalWidth = 1;
  private normalHeight = 1;

  /** Live values, and where they are heading. Eased, so a switch is not a cut. */
  private now: PaintLook = { ...PAINT_LOOKS.off };
  private target: PaintLook = { ...PAINT_LOOKS.off };

  constructor() {
    this.normalTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.normalTarget.texture.name = 'OmniscientPaint.Normal';
    this.normalTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedShortType);
    this.normalTarget.depthTexture.name = 'OmniscientPaint.Depth';
    this.normalTarget.depthTexture.format = THREE.DepthFormat;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        tNormal: { value: this.normalTarget.texture },
        tSceneDepth: { value: this.normalTarget.depthTexture },
        uResolution: { value: new THREE.Vector2(1920, 1080) },
        uOutlineTexel: { value: new THREE.Vector2(1, 1) },
        uRadius: { value: 0 },
        uStrength: { value: 0 },
        uInk: { value: 0 },
        uTint: { value: 0 },
        uTooth: { value: 0 },
        uOutlineWidth: { value: 0 },
        uDepthInk: { value: 0 },
        uNormalInk: { value: 0 },
        uOutlineStrength: { value: 0 },
        uProtectSignals: { value: 0 },
        uHasGeometry: { value: 0 },
        uCameraNear: { value: 0.05 },
        uCameraFar: { value: 180 },
        uInkColor: { value: new THREE.Color(0.025, 0.035, 0.04) },
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
    this.width = width;
    this.height = height;
    (this.material.uniforms.uResolution.value as THREE.Vector2).set(width, height);
    if (this.target.outlineStrength > 0) {
      this.resizeGeometryTarget(this.target.normalScale);
    }
  }

  private resizeGeometryTarget(scale: number): void {
    if (scale <= 0) return;
    const boundedScale = THREE.MathUtils.clamp(scale, 0.25, 1);
    const width = Math.max(1, Math.min(1600, Math.round(this.width * boundedScale)));
    const height = Math.max(1, Math.min(900, Math.round(this.height * boundedScale)));
    if (width === this.normalWidth && height === this.normalHeight) return;
    this.normalWidth = width;
    this.normalHeight = height;
    this.normalTarget.setSize(width, height);
    (this.material.uniforms.uOutlineTexel.value as THREE.Vector2).set(1 / width, 1 / height);
  }

  public initialize(): void {
    /* Nothing to warm up. Present because the composer calls it. */
  }

  public setDepthTexture(): void {
    /* No depth needed - this reads colour only. */
  }

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

  /**
   * Render the visible scene once with view normals and its own depth attachment.
   *
   * This is the important distinction from the engine's selected-object outline: the
   * normal/depth target is produced by the active camera with ordinary depth testing, so a
   * rack in front of a visitor wins the pixel and no contour can leak through it.
   */
  private renderGeometry(renderer: THREE.WebGLRenderer): boolean {
    const scene = this.mainScene;
    const camera = this.mainCamera;
    if (!scene || !camera || this.now.outlineStrength <= 0.001) return false;

    this.resizeGeometryTarget(this.target.normalScale);
    const previousTarget = renderer.getRenderTarget();
    const previousOverride = scene.overrideMaterial;
    const previousAutoClear = renderer.autoClear;
    const previousAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);

    try {
      scene.overrideMaterial = this.normalMaterial;
      renderer.autoClear = true;
      renderer.setRenderTarget(this.normalTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
    } finally {
      scene.overrideMaterial = previousOverride;
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(this.clearColor, previousAlpha);
      renderer.setRenderTarget(previousTarget);
    }

    const perspective = camera as THREE.PerspectiveCamera;
    const u = this.material.uniforms;
    u.uCameraNear.value = perspective.near ?? 0.05;
    u.uCameraFar.value = perspective.far ?? 180;
    return true;
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
    this.now.outlineWidth += (this.target.outlineWidth - this.now.outlineWidth) * k;
    this.now.depthInk += (this.target.depthInk - this.now.depthInk) * k;
    this.now.normalInk += (this.target.normalInk - this.now.normalInk) * k;
    this.now.outlineStrength += (this.target.outlineStrength - this.now.outlineStrength) * k;
    this.now.normalScale += (this.target.normalScale - this.now.normalScale) * k;
    this.now.protectSignals += (this.target.protectSignals - this.now.protectSignals) * k;
    this.now.inkColor = [
      this.now.inkColor[0] + (this.target.inkColor[0] - this.now.inkColor[0]) * k,
      this.now.inkColor[1] + (this.target.inkColor[1] - this.now.inkColor[1]) * k,
      this.now.inkColor[2] + (this.target.inkColor[2] - this.now.inkColor[2]) * k,
    ];

    const u = this.material.uniforms;
    u.tDiffuse.value = inputBuffer.texture;
    u.uHasGeometry.value = this.renderGeometry(renderer) ? 1 : 0;
    u.uRadius.value = this.now.radius;
    u.uStrength.value = this.now.strength;
    u.uInk.value = this.now.ink;
    u.uTint.value = this.now.tint;
    u.uTooth.value = this.now.tooth;
    u.uOutlineWidth.value = this.now.outlineWidth;
    u.uDepthInk.value = this.now.depthInk;
    u.uNormalInk.value = this.now.normalInk;
    u.uOutlineStrength.value = this.now.outlineStrength;
    u.uProtectSignals.value = this.now.protectSignals;
    (u.uInkColor.value as THREE.Color).setRGB(...this.now.inkColor);
    u.uEncode.value = this.renderToScreen ? 1 : 0;

    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.quad.geometry.dispose();
    this.material.dispose();
    this.normalMaterial.dispose();
    this.normalTarget.dispose();
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
    return { type: this.type, enabled: true, order: this.order, look: 'off' };
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
let activeLook: PaintLookName = 'off';

/** Mount the pass. Returns false until the pipeline exists - same contract as installRetro. */
export function installPaint(post: PaintHost): boolean {
  if (mounted) return true;
  effect ??= new OmniscientPaintEffect();
  post.registerEffect(effect as unknown as ENGINE.IPostProcessEffect);
  mounted = post.getEffect('omniscient-paint') !== null;
  if (mounted) {
    effect.pass.setLook(PAINT_LOOKS[activeLook], true);
    effect.pass.enabled = activeLook !== 'off';
  }
  return mounted;
}

export function setPaintLook(name: PaintLookName, immediate = false): void {
  activeLook = name;
  if (!effect) return;
  if (name === 'off') {
    // Other missions should not pay for a neutral full-screen blit.
    effect.pass.setLook(PAINT_LOOKS.off, true);
    effect.pass.enabled = false;
    return;
  }
  effect.pass.enabled = true;
  effect.pass.setLook(PAINT_LOOKS[name], immediate);
}

/** The live values, for the F8 panel. Null before the pass is mounted. */
export function paintValues(): PaintLook | null {
  return effect?.pass.values ?? null;
}

