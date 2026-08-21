/**
 * The shape a hand-rolled post-process pass has to have.
 *
 * ## Why this file exists
 *
 * The engine ships four stylised effects and every one of them extends `WebGPUOnlyEffect`,
 * so on this project's WebGL pipeline they return an empty effect list and do nothing. The
 * way through is `WebGLEffectData.passes`, which is `any[]` and goes straight to
 * `composer.addPass()` - a plain object with the right methods gets full screen-space access
 * with no engine change. `retro.ts` has done this for the CRT since long before I got here.
 *
 * `any[]` is the problem. Nothing checks the object, so a missing method is not a type error
 * or a warning - it is a crash at some later moment that has no obvious connection to the
 * pass that caused it. `getDepthTexture` was missing from BOTH passes and from the written
 * description of the shape, and it surfaced as:
 *
 *     TypeError: t.getDepthTexture is not a function
 *       ... at deleteDepthTexture ... at dispose ... at initializeComposer
 *       ... at rebuildComposer ... at registerEffect ... at installPaint
 *
 * Note where that lands. `installPaint` triggers it, but the object missing the method was
 * the CRT pass, which had been running perfectly for months - because with exactly one
 * custom pass in the stack nothing ever rebuilds the composer, so the teardown path is never
 * walked. Registering a second pass is the first thing that walks it. A latent fault in the
 * old code, detonated by the new code, reported against the new code.
 *
 * So the shape is written down once, as a type, and both passes declare that they implement
 * it. A missing method is now a compile error in the file that is missing it.
 */

import type * as THREE from 'three';

export interface ComposerPass {
  /** Skipped entirely when false. */
  enabled: boolean;
  /** True when the pass writes to the output buffer and the composer must swap after it. */
  needsSwap: boolean;
  /** Set by the composer on whichever pass is last. Decides who owes the canvas an encode. */
  renderToScreen: boolean;
  /** Injected by the composer; unused by passes that need no depth. */
  needsDepthTexture: boolean;
  renderer: THREE.WebGLRenderer | null;
  mainScene: THREE.Scene | null;
  mainCamera: THREE.Camera | null;

  setSize: (width: number, height: number) => void;
  initialize: (
    renderer?: THREE.WebGLRenderer,
    alpha?: boolean,
    frameBufferType?: number
  ) => void;
  setDepthTexture: (
    depthTexture?: THREE.DepthTexture | null,
    depthPacking?: number
  ) => void;
  /**
   * The depth texture this pass owns, or null.
   *
   * The one that is not optional. See the header - the composer calls this on every pass
   * while tearing itself down, and a pass without it takes the rebuild with it.
   */
  getDepthTexture: () => THREE.DepthTexture | null;
  render: (
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget,
    outputBuffer: THREE.WebGLRenderTarget,
    deltaTime?: number,
    stencilTest?: boolean
  ) => void;
  dispose: () => void;
}
