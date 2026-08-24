import * as THREE from 'three';

/**
 * A soft radial glow, for lights that need to bloom without a bloom pass.
 *
 * ## Why this exists, and why the obvious approach failed twice
 *
 * The beacon's halo was built from additive spheres at uniform opacity. Two of them read on
 * screen as two translucent BALLS around the lantern - a sphere at flat alpha has a hard
 * silhouette however faint it is, and additive blending against a night sky makes that edge
 * perfectly legible.
 *
 * The tempting fix is to subdivide: more shells, less alpha each, until the steps blur into a
 * gradient. That was tried at nine shells and about 0.05 of alpha per step, and it made things
 * worse - nine hard edges instead of two, reading as concentric rings, a dartboard rather than
 * a lamp. The lesson is that the edge is not a resolution problem. No number of hard edges
 * adds up to a soft one; the falloff has to be inside the primitive.
 *
 * So the glow is a texture: one quad, one radial alpha ramp that reaches exactly zero at the
 * rim, and no silhouette at all. The ramp is smoothstep-squared rather than linear because a
 * real glow falls off fast near the source and lingers - a linear ramp reads as a flat disc
 * with a soft edge, which is a different wrong answer.
 *
 * ## Billboarding without THREE.Sprite
 *
 * A quad needs to face the camera, and the original note declined `THREE.Sprite` on the
 * grounds that nothing else in this project uses one, so nothing proves the pixel pass and
 * post chain handle it. That reasoning still stands, and it does not need Sprite: three.js
 * calls `onBeforeRender(renderer, scene, camera)` on every mesh it draws, which hands over the
 * camera actually rendering the frame. Copying its quaternion there is a two-line billboard
 * that works for any shot, any aspect, and every camera in the scene - including one the prop
 * idle has no reference to.
 */

let cachedTexture: THREE.CanvasTexture | null = null;

/**
 * The radial ramp, drawn once and shared.
 *
 * 256px is deliberate: the ramp is pure low frequency, so resolution buys nothing and a large
 * texture would just cost memory. The canvas is drawn as an explicit per-pixel ramp rather
 * than with `createRadialGradient` because the browser's gradient interpolates in premultiplied
 * sRGB and leaves a faint grey ring where alpha crosses ~0.5 - which is precisely the artefact
 * this whole file exists to avoid.
 */
export function radialGlowTexture(): THREE.CanvasTexture {
  if (cachedTexture) return cachedTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const image = context.createImageData(size, size);
    const half = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x - half + 0.5) / half;
        const dy = (y - half + 0.5) / half;
        const distance = Math.sqrt(dx * dx + dy * dy);
        // Zero exactly at the rim, so the quad's own edge is never visible.
        const t = Math.max(0, 1 - distance);
        const falloff = t * t * (3 - 2 * t);
        const offset = (y * size + x) * 4;
        image.data[offset] = 255;
        image.data[offset + 1] = 255;
        image.data[offset + 2] = 255;
        image.data[offset + 3] = Math.round(255 * falloff * falloff);
      }
    }
    context.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  cachedTexture = texture;
  return texture;
}

/** Material for a glow quad. One per glow, so each can carry its own colour and strength. */
export function glowMaterial(colour: string, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: radialGlowTexture(),
    color: new THREE.Color(colour),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
}

/**
 * Make a mesh billboard toward whichever camera is drawing it.
 *
 * Set on the Object3D rather than driven from a tick, so it is correct even in the frame a
 * shot cuts - a billboard updated from game logic is always one frame behind the camera it is
 * supposed to face, which shows up as a visible skew on exactly the cuts people look at.
 */
export function billboard(mesh: THREE.Object3D): void {
  mesh.onBeforeRender = (_renderer, _scene, camera): void => {
    mesh.quaternion.copy(camera.quaternion);
  };
}
