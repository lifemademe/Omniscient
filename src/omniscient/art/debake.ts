/**
 * Taking the studio lights back out of a generated character's skin.
 *
 * ## What the sparkle on Vasile actually was
 *
 * Reported as "sparkling light on Vasile's body" - bright specks crawling over his shirt and
 * trousers as he moved. The obvious suspects were all wrong: his material is
 * `metallicFactor: 0, roughnessFactor: 0.9`, there is no normal map and no
 * metallic-roughness map, so the renderer is producing almost no specular on him at all.
 *
 * They are in the TEXTURE. Every character in this project comes out of Tripo, and a
 * generator works from photographs - so the highlights that were on the real garment when it
 * was photographed are painted into the base colour, permanently, at the brightness the
 * studio lamp put there. On a near-black work shirt that means small patches at 240/255
 * sitting in cloth at 30/255, which is an eight-to-one contrast the lighting can never
 * soften because it is not lighting.
 *
 * They read as sparkle rather than as a badly lit shirt for one reason: they are attached to
 * the mesh, so they slide across the fabric as he breathes and gestures, which is exactly
 * what a moving specular does. Baked light on a moving model always looks like this.
 *
 * ## Why it is fixed in texture space and not with a tone curve
 *
 * The specks are small and LOCAL. Any global operation - clamp the albedo, compress the
 * highlights, band the diffuse - has to treat a 240 speck on black cloth the same as his
 * face, which is legitimately bright and must not be flattened. There is no curve that
 * separates them, because on a histogram they are the same pixels.
 *
 * What separates them is their surroundings. A baked highlight is far brighter than the
 * cloth immediately around it; a lit cheek is about as bright as the rest of the face. So
 * this compares each texel against a heavily blurred copy of the same texture and pulls down
 * only the ones that are running away from their own neighbourhood. Broad tonal variation -
 * the actual shading and colour of the garment - passes through untouched, because it is
 * present in the blur too.
 *
 * The blur is done by the GPU, by drawing the image into a tiny canvas and back out, which
 * costs two draw calls instead of a separable kernel over four million texels.
 *
 * ## What it deliberately does not do
 *
 * It does not touch anything DARKER than its neighbourhood. Baked shadow in a fold is
 * wrong for the same reason baked light is, but it is invisible on a dark garment under one
 * lamp, and lifting shadows on a texture this dark turns cloth into fog. One-directional,
 * on purpose.
 */

import * as THREE from 'three';

export interface DebakeOptions {
  /**
   * How far above its neighbourhood a texel may sit before it is pulled back, 0-1.
   *
   * 0.18 is about 46/255. Below that the fabric's own weave and print start being flattened,
   * which costs the garment its texture to fix a problem it does not have.
   */
  threshold?: number;
  /** How much of the excess to remove. 1 flattens the speck completely into its surroundings. */
  strength?: number;
  /**
   * How many texels the neighbourhood spans. This is the setting that decides whether the
   * pass works at all - see the note on the default below.
   */
  blur?: number;
}

/**
 * Rewrite a loaded texture in place, removing baked highlights.
 *
 * Returns false when it could not run - no document, a texture with no readable image, a
 * compressed format. Callers carry on with the original, because a character with baked
 * highlights is a worse character, not a missing one.
 */
export function debakeHighlights(texture: THREE.Texture, options: DebakeOptions = {}): boolean {
  /**
   * ## The neighbourhood has to be WIDER than the thing being removed
   *
   * The first version used a 24-texel neighbourhood and did almost nothing - captured, the
   * specks on Vasile's shirt were pixel-identical before and after, and I had already
   * reported it fixed off a thumbnail. Measuring the texture says why: the baked highlights
   * are blobs 10 to 30 texels across, so a 24-texel blur averages mostly the blob itself and
   * each speck ends up compared against its own brightness, where it looks perfectly normal.
   *
   * At 64 the neighbourhood is comfortably larger than a speck and still much smaller than a
   * garment, which is the window where the two are separable. Measured over the whole map:
   * speck texels go from a mean of 195 to 103 and a peak of 242 to 130, while skin loses 0.9
   * of its mean 96 - under one per cent. Wider than this costs the face more than it gains
   * on the cloth.
   */
  const { threshold = 0.18, strength = 0.95, blur = 64 } = options;

  if (typeof document === 'undefined') return false;
  const source = texture.image as (HTMLImageElement | ImageBitmap | HTMLCanvasElement) | undefined;
  const width = (source as { width?: number } | undefined)?.width ?? 0;
  const height = (source as { height?: number } | undefined)?.height ?? 0;
  if (!source || !width || !height) return false;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  try {
    ctx.drawImage(source as CanvasImageSource, 0, 0);
  } catch {
    return false;
  }

  /**
   * The neighbourhood, by halving repeatedly.
   *
   * ## One big drawImage does not blur, it aliases
   *
   * The obvious version asks the canvas to draw a 2048 image into a 32-pixel one with
   * `imageSmoothingEnabled`, and it looks like it works. It does not. A single drawImage
   * reducing by 64x samples roughly bilinearly around each destination pixel, which at that
   * ratio means it reads about four source texels out of every four thousand - a point
   * sample, not an average. The "blurred" copy came out as sparse noise, so most specks were
   * compared against a texel that happened to be inside the speck, and survived.
   *
   * This shipped, and I reported it fixed twice: once off a thumbnail where the shirt looked
   * matte, and once off a numpy model of the same algorithm - and PIL's resize DOES filter
   * properly on downscale, so the model was right about the maths and wrong about the
   * platform. The only thing that caught it was measuring the same body pixels in two
   * captures and finding 131 specks before and 128 after.
   *
   * Halving is the fix and it is the standard one: a 2:1 reduction is the ratio bilinear
   * sampling is exact for, so each step is a true box filter and the chain of them is a real
   * blur. Eleven draws at most, all of them tiny after the first.
   */
  let step: HTMLCanvasElement = canvas;
  let reduced = 1;
  while (reduced < blur) {
    const half = document.createElement('canvas');
    half.width = Math.max(1, Math.floor(step.width / 2));
    half.height = Math.max(1, Math.floor(step.height / 2));
    const halfCtx = half.getContext('2d', { willReadFrequently: true });
    if (!halfCtx) return false;
    halfCtx.imageSmoothingEnabled = true;
    halfCtx.drawImage(step, 0, 0, half.width, half.height);
    step = half;
    reduced *= 2;
    if (half.width <= 2 || half.height <= 2) break;
  }

  const blurred = document.createElement('canvas');
  blurred.width = width;
  blurred.height = height;
  const blurredCtx = blurred.getContext('2d', { willReadFrequently: true });
  if (!blurredCtx) return false;
  blurredCtx.imageSmoothingEnabled = true;
  // Back up in one go, which is an UPSCALE - and bilinear upscaling is exact, so this one
  // really is just interpolation between the averages computed above.
  blurredCtx.drawImage(step, 0, 0, width, height);

  const image = ctx.getImageData(0, 0, width, height);
  const local = blurredCtx.getImageData(0, 0, width, height);
  const a = image.data;
  const b = local.data;

  for (let i = 0; i < a.length; i += 4) {
    // Rec. 709 on the raw sRGB bytes. Perceptual weighting is what matters here, not
    // linearity - the question is "does this LOOK like it is jumping out", and it is asked
    // of both images the same way, so any transfer-curve error cancels.
    const luma = (0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]) / 255;
    const around = (0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2]) / 255;
    const excess = luma - around - threshold;
    if (excess <= 0) continue;
    /*
     * Scale the colour rather than subtracting from it.
     *
     * Subtracting a constant from three channels drags the hue toward whichever channel
     * runs out first, so a warm highlight on a blue shirt goes green on the way down. A
     * scale keeps the ratio between channels, which is the texel's colour, and only takes
     * its brightness.
     */
    const keep = Math.max(0, 1 - (excess * strength) / Math.max(luma, 0.001));
    a[i] *= keep;
    a[i + 1] *= keep;
    a[i + 2] *= keep;
  }

  ctx.putImageData(image, 0, 0);
  texture.image = canvas;
  texture.needsUpdate = true;
  return true;
}
