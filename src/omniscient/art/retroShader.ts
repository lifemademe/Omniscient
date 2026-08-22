/**
 * The CRT pass's GLSL and its look table - and nothing that touches the engine.
 *
 * Split out of `retro.ts` for the same reason `paintShader.ts` is split out of
 * `paintPass.ts`, and the reason is a build error rather than tidiness: the shader check in
 * `scripts/dev/shader/` bundles for a BROWSER, and importing `retro.ts` pulls in
 * `@gnsx/genesys.js`, which imports `path` and `node:module`. So the one file that has to be
 * reachable from a browser bundle cannot be the one that registers an engine effect.
 *
 * Everything here is strings, numbers and THREE.Color. `retro.ts` re-exports it all, so no
 * caller has to know this file exists.
 */

import * as THREE from 'three';

export interface RetroLook {
  /**
   * The signal's pixel size, in device pixels. 1 or below is off.
   *
   * This is the one field that is not a television artefact - it is how coarse the picture
   * being SENT to the television is, which on this machine is a different question from how
   * the television draws it. 3 on a 1920-wide window is a 640-wide source; 6 would be the
   * 320 a PlayStation actually output, and is coarse enough to lose a face at the distance
   * the contact camera stands at.
   */
  pixel: number;
  /** Barrel distortion. 0 is a flat pane; the tube's dark border only appears above 0. */
  curve: number;
  /** Radial RGB split, in UV units at the corners. */
  aberration: number;
  /** Depth of the scanline troughs, 0-1. */
  scanline: number;
  /** Raster pitch in framebuffer rows: one dark line every `scanPitch` pixels. */
  scanPitch: number;
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
    /*
     * 3, and the number is a compromise the console forces.
     *
     * These rooms are what the machine is looking at through somebody else's camera, so a
     * coarse signal is right for them - but Mirela stands about a fifth of the frame tall
     * with the console panel over the right third, and at 6 (a true 320-wide source) her
     * face stops being a face. 3 halves the resolution twice over and still leaves an
     * expression readable, which is the constraint this game has and a platformer does not.
     */
    pixel: 3,
    curve: 0,
    aberration: 0.0008,
    scanline: 0,
    scanPitch: 3,
    grille: 0,
    bleed: 0,
    vignette: 0.16,
    roll: 0,
    flicker: 0,
    saturation: 1.16,
    tint: new THREE.Color(1, 1, 1),
  },
  console: {
    /*
     * 3, the same as everywhere else, and it took removing a piece of the menu to get here.
     *
     * This sat at 2 because the main menu's plate labels are world geometry: NEW GAME,
     * CONTINUE, SETTINGS all go through this pass like everything else, and captured at the
     * three settings and cropped to one label, off is crisp, 2 is chunky and readable, 3 is
     * mush. The menu was one step sharper than every room in the game to keep five words
     * legible.
     *
     * That is a bad trade for a reason that has nothing to do with sharpness: a menu plate
     * which stays crisp while the desk it hangs over goes coarse is an object that has left
     * the room, and this game's entire opening move is the boot screen proving the console
     * is a thing standing in a place. So the labels left the world instead - see
     * MenuReadout - and the plates keep their painted text as texture, which at three
     * pixels a block reads as writing without being readable. Which is what small text on a
     * screwed-on plate looks like from across a room anyway.
     */
    pixel: 3,
    curve: 0.010,
    aberration: 0.0018,
    scanline: 0.055,
    scanPitch: 3,
    grille: 0,
    bleed: 0.20,
    vignette: 0.30,
    roll: 0.020,
    flicker: 0.0015,
    saturation: 1.12,
    tint: new THREE.Color(0.99, 1.0, 1.02),
  },
  machine: {
    /*
     * 3, like everywhere else, and not the 5 this started at.
     *
     * The argument for coarser was that the wire city is the deepest the player gets inside
     * the machine, and lines on black can take it. The argument against is stronger and it
     * is the same one that settles the console: a pixel size that changes between places is
     * a property of the PICTURE, and this game has spent nine missions establishing that the
     * picture belongs to one instrument. A grid that gets chunkier when the subject changes
     * says the machine swapped screens.
     *
     * One size, everywhere, so the grid is the machine rather than the mood.
     */
    pixel: 3,
    curve: 0.055,
    aberration: 0.0060,
    scanline: 0.20,
    scanPitch: 2,
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

/*
 * VERTEX and FRAGMENT are exported for `scripts/dev/shader/`, which compiles them on a real
 * GPU in a real browser.
 *
 * There is no way to compile a shader without one, and this project has shipped a broken
 * one before: declarations placed in a chunk that lives inside main() produced "Fragment
 * shader is not compiled" and a black room. This pass is the only hand-rolled one that is
 * actually MOUNTED, so a failure here is a black screen rather than a black object - which
 * makes it the more important of the two subjects, and it was the one the harness did not
 * cover.
 */
export const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uPixel;
/*
 * The tube's own face, as a quad in NDC, and a switch for when there is not one.
 *
 * Four corners rather than a rectangle because the CRT is a physical object seen at an
 * angle: its screen is a trapezium on the frame, and a bounding rectangle would exempt a
 * band of desk and wall along two of its edges.
 */
uniform vec2 uScreenA;
uniform vec2 uScreenB;
uniform vec2 uScreenC;
uniform vec2 uScreenD;
uniform float uScreenOn;
uniform float uCurve;
uniform float uAberration;
uniform float uScanline;
uniform float uScanPitch;
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

/** Signed area of the triangle abp - positive on one side of ab, negative on the other. */
float sideOf(vec2 a, vec2 b, vec2 p) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

/**
 * Is this fragment on the tube's face?
 *
 * Consistent sign against all four edges. Accepts either winding, because the quad's corner
 * order flips as the camera crosses the plane of the screen and a test that only handled one
 * would silently invert - exempting the whole room and sparing the screen.
 */
bool onScreen(vec2 p) {
  float s0 = sideOf(uScreenA, uScreenB, p);
  float s1 = sideOf(uScreenB, uScreenC, p);
  float s2 = sideOf(uScreenC, uScreenD, p);
  float s3 = sideOf(uScreenD, uScreenA, p);
  return (s0 >= 0.0 && s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0)
      || (s0 <= 0.0 && s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0);
}

void main() {
  /*
   * The signal's resolution, and it is the FIRST thing that happens.
   *
   * Snapping the output UV to a coarse grid means every device pixel inside a block
   * computes the same sample position and therefore the same colour - so the blocks are
   * axis-aligned and exact on screen, with no half-covered edges. Snapping AFTER the
   * curvature would instead quantise the sampling and leave the block edges wobbling along
   * the barrel, which reads as a compression artefact rather than as a low-res picture.
   *
   * Order is the argument for the whole pass: this is the SIGNAL being coarse, and
   * everything below is a tube displaying it. A television showing a 320-line source curves
   * and scans the coarse image; it does not coarsen its own scanlines. So the pixel grid
   * goes through the curve, and the scanlines and the grille stay at device resolution
   * where they already were.
   *
   * pv is used for sampling only. The vignette and the aberration split keep the smooth
   * vUv, because those are lens and geometry rather than signal - blocking them would put
   * visible steps in a soft radial gradient for no reason.
   *
   * (No backticks in this comment: the whole shader is a template literal and one of them
   * here closes it. Second time this trap has been sprung today - the boot stylesheet was
   * the first.)
   */
  /*
   * The one thing the grid does not touch: the CRT's own face.
   *
   * Not an exemption for looking nicer - it is the only surface in this game that is ALREADY
   * a raster display. Its content is authored at 192x144 and drawn in a 3x5 pixel font, so
   * putting a second, unaligned grid over it double-quantises: two grids at different pitches
   * and angles beat against each other, and what that destroys first is exactly the small text
   * the tube exists to show. Letting the screen keep its own pixels is more honest than
   * imposing the camera's on top of them, not less.
   *
   * It follows that the globe view - which is this same screen filling the frame - comes out
   * unpixelated too. That is the correct consequence rather than a side effect: when the
   * picture IS the screen, the screen's resolution is the picture's.
   */
  vec2 pv = vUv;
  if (uPixel > 1.0 && !(uScreenOn > 0.5 && onScreen(vUv * 2.0 - 1.0))) {
    vec2 grid = uResolution / uPixel;
    pv = (floor(vUv * grid) + 0.5) / grid;
  }

  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);

  // Tube curvature. Pushes outward, so the corners sample past the edge of the buffer -
  // which is what the mask at the bottom is for.
  vec2 tube = pv + (pv - 0.5) * dot(pv - 0.5, pv - 0.5) * uCurve;

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

  // Scanlines, in framebuffer rows rather than in UV.
  //
  // They were UV-based and a fixed count, which is resolution-independent right up until
  // the drawing buffer is smaller than the window - and here it is. 620 bands over the
  // height put the pattern above the buffer's Nyquist limit, so what reached the screen
  // was not a raster at all but the beat between the two, measured at a 10.5px period
  // where the maths says 1.7. Anchoring to gl_FragCoord makes the pitch exact at any
  // buffer size and makes aliasing impossible, which is why the grille below already does.
  float sl = sin(gl_FragCoord.y * 3.14159265 / uScanPitch);
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
