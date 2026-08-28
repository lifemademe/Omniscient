/**
 * Global cel-shading pass.
 *
 * It performs restrained, edge-preserving colour simplification and a camera-matched
 * depth/normal prepass. That prepass supplies silhouette and crease ink with ordinary depth
 * testing, so outlines cannot show through shelves or walls. It runs at order 70, before the
 * subtle CRT pass at order 80. DOM interface overlays live outside the scene composer;
 * the physical menu CRT supplies an explicit protected quad for its raster image.
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
  /** Objects hidden for the geometry prepass and restored the same frame. See renderGeometry. */
  private readonly prepassHidden: THREE.Object3D[] = [];
  /**
   * Subtrees to hide for the geometry prepass, named by the caller.
   *
   * The prepass renders the scene with an override material, which resurrects anything the
   * beauty pass is not drawing: the workstation desk, lamp and CRT drew a full wireframe
   * over the warehouse floor with no fill behind them. Their materials are not transparent,
   * not colorWrite-off and not marked invisible, so none of the checks below catch them -
   * whatever keeps them out of the beauty pass, an override material defeats it.
   *
   * The first attempt at this named the mission ROOT and hid everything that was not on the
   * path to it. That removed the desk and the outline together: with the whole scene hidden
   * the prepass wrote an empty buffer, every sample came back "no geometry", and the contour
   * silently stopped existing. Proven by tinting the ink magenta - zero magenta pixels with
   * the walk in, 6.4% with it out.
   *
   * So this is an explicit list rather than a rule. It can only ever remove the things named
   * in it, which means the worst it can do is fail to fix a ghost - never erase the feature.
   */
  public readonly prepassExclude: THREE.Object3D[] = [];
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
        uBrightness: { value: 1 },
        uOutlineFadeStart: { value: 999 },
        uOutlineFadeEnd: { value: 1000 },
        uPosterize: { value: 0 },
        uPosterizeSoft: { value: 0 },
        uPosterizeGate: { value: 0 },
        uSaturation: { value: 1 },
        uProtectedA: { value: new THREE.Vector2() },
        uProtectedB: { value: new THREE.Vector2() },
        uProtectedC: { value: new THREE.Vector2() },
        uProtectedD: { value: new THREE.Vector2() },
        uProtectedOn: { value: 0 },
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

  /** Exempt one camera-projected surface from filtering and contour ink. */
  public setProtectedQuad(corners: readonly THREE.Vector2[] | null): void {
    const uniforms = this.material.uniforms;
    if (!corners || corners.length !== 4) {
      uniforms.uProtectedOn.value = 0;
      return;
    }
    (uniforms.uProtectedA.value as THREE.Vector2).copy(corners[0]);
    (uniforms.uProtectedB.value as THREE.Vector2).copy(corners[1]);
    (uniforms.uProtectedC.value as THREE.Vector2).copy(corners[2]);
    (uniforms.uProtectedD.value as THREE.Vector2).copy(corners[3]);
    uniforms.uProtectedOn.value = 1;
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
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const previousShadowNeedsUpdate = renderer.shadowMap.needsUpdate;
    const previousAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);

    /*
     * See-through things must not cast a contour.
     *
     * `overrideMaterial` replaces every material in the scene with an opaque normal write,
     * which means glass, stretch wrap, scan beams, wireframe fences and anything mid-fade
     * all stamp a full silhouette into the prepass - and then get a hard ink line drawn
     * round something the player can see straight through. On an aisle shot the workstation
     * desk and its monitor appeared as a floating wireframe over the floor: no fill, because
     * the beauty pass barely draws them, but a complete outline, because the prepass drew
     * them at full strength.
     *
     * Hidden for the prepass and restored immediately after. One traversal a frame against
     * a full scene render is not the expensive half of this pass, and the alternative -
     * layer masks - needs every transparent material in the game to remember to opt out.
     */
    for (const excluded of this.prepassExclude) {
      if (!excluded.visible) continue;
      excluded.visible = false;
      this.prepassHidden.push(excluded);
    }

    for (const object of scene.children) object.traverseVisible((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!material) return;
      /*
       * Four separate ways a material hides itself, and overrideMaterial defeats all of
       * them: it swaps in an opaque normal write and the object reappears in the prepass
       * with a full silhouette. Transparency was only the first one found - a workstation
       * desk that the beauty pass does not draw was still handing the contour a crisp
       * outline, and it drew as a wireframe floating over the aisle floor.
       *
       * `visible` and `colorWrite` are the two the renderer honours on the material rather
       * than on the object, so `traverseVisible` walks straight past them. `depthWrite`
       * false marks beams, decals and scan sweeps - things drawn ON other surfaces, which
       * should never own an edge of their own.
       */
      const hidden = !material.visible
        || material.colorWrite === false
        || material.depthWrite === false
        || (material.transparent && material.opacity < 0.95);
      if (hidden) {
        mesh.visible = false;
        this.prepassHidden.push(mesh);
      }
    });

    try {
      scene.overrideMaterial = this.normalMaterial;
      // Normals are unlit. Rebuilding every light's shadow map here doubles the
      // shadow work and uses the prepass's deliberately hidden geometry.
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      renderer.autoClear = true;
      renderer.setRenderTarget(this.normalTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
    } finally {
      for (const object of this.prepassHidden) object.visible = true;
      this.prepassHidden.length = 0;
      scene.overrideMaterial = previousOverride;
      renderer.autoClear = previousAutoClear;
      renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
      renderer.shadowMap.needsUpdate = previousShadowNeedsUpdate;
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
    this.now.brightness += (this.target.brightness - this.now.brightness) * k;
    this.now.outlineFadeStart += (this.target.outlineFadeStart - this.now.outlineFadeStart) * k;
    this.now.outlineFadeEnd += (this.target.outlineFadeEnd - this.now.outlineFadeEnd) * k;
    this.now.posterizeSoft += (this.target.posterizeSoft - this.now.posterizeSoft) * k;
    this.now.posterizeGate += (this.target.posterizeGate - this.now.posterizeGate) * k;
    this.now.saturation += (this.target.saturation - this.now.saturation) * k;
    // Step COUNT is snapped rather than eased. Interpolating it walks the image through
    // 3.4 and 3.7 steps on the way, and a fractional band count is a moving moire.
    this.now.posterize = this.target.posterize;
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
    u.uBrightness.value = this.now.brightness;
    u.uOutlineFadeStart.value = this.now.outlineFadeStart;
    u.uOutlineFadeEnd.value = this.now.outlineFadeEnd;
    u.uPosterize.value = this.now.posterize;
    u.uPosterizeSoft.value = this.now.posterizeSoft;
    u.uPosterizeGate.value = this.now.posterizeGate;
    u.uSaturation.value = this.now.saturation;
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
const cloneLook = (look: PaintLook): PaintLook => ({
  ...look,
  inkColor: [...look.inkColor],
});
let activeValues: PaintLook = cloneLook(PAINT_LOOKS.off);

/** Mount the pass. Returns false until the pipeline exists - same contract as installRetro. */
export function installPaint(post: PaintHost): boolean {
  if (mounted) return true;
  effect ??= new OmniscientPaintEffect();
  post.registerEffect(effect as unknown as ENGINE.IPostProcessEffect);
  mounted = post.getEffect('omniscient-paint') !== null;
  if (mounted) {
    effect.pass.setLook(activeValues, true);
    effect.pass.enabled = activeLook !== 'off';
  }
  return mounted;
}

/**
 * Hand the pass the scene and camera its geometry prepass needs.
 *
 * ## Why the outlines never appeared
 *
 * `renderGeometry` opens with `if (!scene || !camera ... ) return false`, and NOTHING in
 * this project ever assigned either one. The engine's WebGLPipeline does set them - but
 * only on `this.renderPass`, the pipeline's own built-in pass, never on a custom effect
 * registered through `registerEffect`. So the guard failed on its first line, every frame,
 * since the day the contour was written.
 *
 * The consequence is bigger than a subtle look problem: `uHasGeometry` was pinned at 0, so
 * the entire outline branch was unreachable. Every knob feeding it - outlineWidth,
 * depthInk, normalInk, outlineStrength, normalScale - was dead, along with the normal and
 * depth prepass they drive. Tuning them at the F8 panel moved nothing, which is exactly
 * what "the cel shading does not produce the lines" describes.
 *
 * It hid for as long as it did because the failure is silent and its symptom is plausible:
 * a cel pass with no contour still bands and tints, so it looks like a look that needs more
 * tuning rather than a feature that is switched off. There is no way to tell those apart
 * from the image alone, which is why the fix came from reading the guard rather than from
 * pushing the width up again.
 *
 * Called every frame rather than once at mount, because the active camera changes with the
 * shot and a stale one would prepass the room from where the lens used to be.
 */
export function setPaintView(scene: THREE.Scene | null, camera: THREE.Camera | null): void {
  if (!effect) return;
  effect.pass.mainScene = scene;
  effect.pass.mainCamera = camera;
}

/** Name a subtree the contour prepass must not draw. See PaintPass.prepassExclude. */
export function excludeFromPaintOutline(node: THREE.Object3D | null): void {
  if (!effect || !node || effect.pass.prepassExclude.includes(node)) return;
  effect.pass.prepassExclude.push(node);
}

export function setPaintLook(name: PaintLookName, immediate = false): void {
  activeLook = name;
  activeValues = cloneLook(PAINT_LOOKS[name]);
  if (!effect) return;
  if (name === 'off') {
    // The editor A/B path should not pay for a neutral full-screen blit.
    effect.pass.setLook(activeValues, true);
    effect.pass.enabled = false;
    return;
  }
  effect.pass.enabled = true;
  effect.pass.setLook(activeValues, immediate);
}

/** Patch the active look, including before the lazily-created post pipeline is mounted. */
export function setPaintValues(values: Partial<PaintLook>, immediate = true): void {
  activeValues = cloneLook({
    ...activeValues,
    ...values,
    inkColor: values.inkColor ?? activeValues.inkColor,
  });
  effect?.pass.setLook(activeValues, immediate);
}

/** Keep a camera-projected UI surface outside the full-scene cel conversion. */
export function setPaintProtectedQuad(corners: readonly THREE.Vector2[] | null): void {
  effect?.pass.setProtectedQuad(corners);
}

/** The target values, for the F8 panel and clipboard dump. */
export function paintValues(): PaintLook {
  return cloneLook(activeValues);
}

