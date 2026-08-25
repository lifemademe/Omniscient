/**
 * The painterly conversion, as GLSL and numbers only.
 *
 * Split from `paintPass.ts` so it imports NOTHING. The pass has to import the engine to
 * register itself, the engine reaches for node's `path`, and a browser bundle cannot follow
 * it there - which meant the compile check could not see the one thing it exists to check.
 * A shader string and a table of look values have no business depending on a game engine.
 *
 * See paintPass.ts for what each part is doing and why.
 */

/** How hard each part of the conversion is pushed. */
export interface PaintLook {
  /** Edge-preserving filter radius in pixels. 0 disables it and costs nothing. */
  radius: number;
  /** How much of the filtered image replaces the original, 0..1. */
  strength: number;
  /** Ink on edges, 0..1. */
  ink: number;
  /** Cold shadows and warm lights, 0..1. */
  tint: number;
  /** Optional fine surface breakup, 0..1. */
  tooth: number;
  /** Screen-space contour width in pixels. */
  outlineWidth: number;
  /** Contribution from camera-depth discontinuities. */
  depthInk: number;
  /** Contribution from view-normal discontinuities and hard creases. */
  normalInk: number;
  /** Final opacity of the geometry contour. */
  outlineStrength: number;
  /** Resolution scale of the warehouse geometry prepass. */
  normalScale: number;
  /** Preserve saturated semantic scan, evidence, and door-state colours. */
  protectSignals: number;
  /**
   * Value steps in the post pass. 0 disables it.
   *
   * The material injection in painterly.ts bands the DIRECT LIGHT term and leaves the
   * hemisphere fill smooth, which is right for a painted look and wrong for a cel one - a
   * surface lit mostly by fill still slides through a gradient, and in a night interior
   * that is most of the frame. This quantises the finished pixel instead, so a surface is
   * flat regardless of which light drew it. The two stack: bands shape the form, this
   * flattens what is left.
   */
  posterize: number;
  /** Width of the soft edge between posterised steps, 0..1 of a step. 0 is a hard cel step. */
  posterizeSoft: number;
  /**
   * Chroma gain on the finished pixel, 1 = unchanged.
   *
   * Posterising VALUE makes hue carry more of the picture, because there is less value
   * variation left to carry it. This is the knob for that, and it is separate from the
   * material-level chroma in WarehouseCelStyle so the look can be pushed without editing
   * the palette underneath it.
   */
  saturation: number;
  /**
   * Gain on the shaded image, 1 = unchanged.
   *
   * Applied after the edge-preserving filter and BEFORE ink, outline and tooth, which is the
   * placement that makes it behave like a light rather than like a wash: contours still mix
   * toward `inkColor` afterwards, so brightening the room does not fade its lines. The
   * protected-signal colours are lifted by the same factor, so scan and evidence hues keep
   * their relationship to everything around them instead of going dull as the room comes up.
   */
  brightness: number;
  /** Linear ink colour. Dark blue-green reads as shadow rather than UI black. */
  inkColor: readonly [number, number, number];
}

export const PAINT_LOOKS = {
  /** Off. Exactly the image the game had before this file existed. */
  off: {
    radius: 0, strength: 0, ink: 0, tint: 0, tooth: 0,
    outlineWidth: 0, depthInk: 0, normalInk: 0, outlineStrength: 0,
    normalScale: 0.5, protectSignals: 0, inkColor: [0.025, 0.035, 0.04],
    brightness: 1, posterize: 0, posterizeSoft: 0, saturation: 1,
  },
  /**
   * The one to look at first.
   *
   * A 3px radius at 0.85 flattens the noise out of the textures without eating the pixel
   * art's own edges, which are the thing this game cannot afford to lose.
   */
  painted: {
    radius: 1.2, strength: 0.18, ink: 0.24, tint: 0.4, tooth: 0.04,
    outlineWidth: 0, depthInk: 0, normalInk: 0, outlineStrength: 0,
    normalScale: 0.5, protectSignals: 0.3, inkColor: [0.025, 0.035, 0.04],
    brightness: 1, posterize: 0, posterizeSoft: 0, saturation: 1,
  },
  /** Pushed, for judging the direction rather than for shipping. */
  heavy: {
    radius: 1.8, strength: 0.34, ink: 0.48, tint: 0.65, tooth: 0.08,
    outlineWidth: 1.5, depthInk: 1, normalInk: 0.7, outlineStrength: 0.8,
    normalScale: 0.85, protectSignals: 0.55, inkColor: [0.018, 0.025, 0.03],
    brightness: 1, posterize: 0, posterizeSoft: 0, saturation: 1,
  },
  /** Warehouse prototype: clean value bands, occluded contours, no canvas or oil smearing. */
  warehouseCel: {
    radius: 3, strength: 1, ink: 1, tint: 0.12, tooth: 0,
    /*
     * Settled at the F8 panel, 2026-08-25.
     *
     * The outline goes from a quarter of a pixel to 1.35, which is the difference between a
     * contour you can find if you look for it and one that draws the room. And brightness
     * more than doubles, because the cel pass bands toward the darker step and the warehouse
     * was already a night interior - the two compounded into a room lit like a cupboard.
     * Lifting inside the pass rather than at the tone mapper is what keeps the ink black
     * while the surfaces come up; see PaintLook.brightness.
     */
    /*
     * 2.6px, up from 1.35, and the reason it now reads at all is the ORDER it is drawn in
     * rather than the width - see the signal restore in main(). At 1.35 with the contour
     * being wiped off every saturated surface afterwards, widening it was pushing on a
     * rope.
     */
    outlineWidth: 1.4, depthInk: 2, normalInk: 2, outlineStrength: 1,
    /*
     * 0.55, down from 1.
     *
     * This decides how much of the cel treatment is handed back to "signal" colours, and at
     * 1 it meant ALL of it. That was survivable while the warehouse palette was grey and
     * almost nothing tripped the test; with the palette repainted, a tan carton now scores
     * two thirds of the way to "signal" and was getting two thirds of its banding and ink
     * returned. The test has been tightened as well, but this is the honest number for how
     * much a scan line should be allowed to opt out.
     */
    normalScale: 1, protectSignals: 0.55,
    inkColor: [0.025186859622305935, 0.035601314869097636, 0.03954623527052923],
    /*
     * 1.42, down from 2.17, settled alongside dropping the tone mapper to 0.62.
     *
     * The two do different jobs and were pulling against each other: exposure at 1.08 with a
     * 2.17 gain inside the cel pass meant the pass was compensating for a tone map that was
     * already lifting. Taking the exposure down and easing the gain gets to the same
     * mid-range with more headroom left at the top, which is where the banding lives.
     */
    brightness: 1.42,
    /*
     * Four value steps with a nearly hard edge, and 1.3x chroma.
     *
     * Three steps is a comic and reads too coarse on a 26-metre aisle, where the run has to
     * describe distance with value alone. Four keeps the near/mid/far read while still
     * being unmistakably flat. Softness at 0.08 rather than 0 because a perfectly hard step
     * crawls along a slowly curving surface as the drone moves - a few percent of ramp costs
     * nothing visible and kills the crawl.
     */
    posterize: 4, posterizeSoft: 0.05, saturation: 1.26,
  },
  /** Lower-cost depth-led contour for high-DPI or constrained GPUs. */
  warehouseCelLow: {
    radius: 0, strength: 0, ink: 0.06, tint: 0.24, tooth: 0,
    outlineWidth: 1.8, depthInk: 1, normalInk: 0.38, outlineStrength: 0.58,
    normalScale: 0.48, protectSignals: 0.55, inkColor: [0.025, 0.035, 0.04],
    brightness: 1, posterize: 3, posterizeSoft: 0.14, saturation: 1.2,
  },
} as const satisfies Record<string, PaintLook>;

export type PaintLookName = keyof typeof PAINT_LOOKS;

export const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

/*
 * The filter deliberately stays to a compact cross-shaped neighbourhood. It preserves
 * labels and hard prop boundaries while taking the brittle digital edge off flat regions;
 * unlike the former broad Kuwahara kernel it cannot turn warehouse detail into a smear.
 */
export const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tNormal;
uniform sampler2D tSceneDepth;
uniform vec2 uResolution;
uniform vec2 uOutlineTexel;
uniform float uRadius;
uniform float uStrength;
uniform float uInk;
uniform float uTint;
uniform float uTooth;
uniform float uOutlineWidth;
uniform float uDepthInk;
uniform float uNormalInk;
uniform float uOutlineStrength;
uniform float uProtectSignals;
uniform float uBrightness;
uniform float uPosterize;
uniform float uPosterizeSoft;
uniform float uSaturation;
uniform vec2 uProtectedA;
uniform vec2 uProtectedB;
uniform vec2 uProtectedC;
uniform vec2 uProtectedD;
uniform float uProtectedOn;
uniform float uHasGeometry;
uniform float uCameraNear;
uniform float uCameraFar;
uniform vec3 uInkColor;
uniform float uEncode;

float luma( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }

float protectedSide( vec2 a, vec2 b, vec2 p ) {
  return ( b.x - a.x ) * ( p.y - a.y ) - ( b.y - a.y ) * ( p.x - a.x );
}

bool insideProtectedQuad( vec2 p ) {
  float s0 = protectedSide( uProtectedA, uProtectedB, p );
  float s1 = protectedSide( uProtectedB, uProtectedC, p );
  float s2 = protectedSide( uProtectedC, uProtectedD, p );
  float s3 = protectedSide( uProtectedD, uProtectedA, p );
  return ( s0 >= 0.0 && s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0 )
      || ( s0 <= 0.0 && s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0 );
}

float toothHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}

float viewDepth( float depth ) {
  return ( uCameraNear * uCameraFar ) /
    max( 0.00001, uCameraFar - depth * ( uCameraFar - uCameraNear ) );
}

vec3 readNormal( vec2 uv ) {
  return normalize( texture2D( tNormal, uv ).rgb * 2.0 - 1.0 );
}

vec2 geometryDifference( vec2 uv, float centreDepth, vec3 centreNormal ) {
  float sampleDepth = texture2D( tSceneDepth, uv ).x;
  bool centrePresent = centreDepth < 0.999999;
  bool samplePresent = sampleDepth < 0.999999;
  if ( centrePresent != samplePresent ) return vec2( 1.0 );
  if ( !centrePresent ) return vec2( 0.0 );

  float centreView = viewDepth( centreDepth );
  float sampleView = viewDepth( sampleDepth );
  float depthEdge = abs( centreView - sampleView ) / max( 0.25, min( centreView, sampleView ) );
  vec3 sampleNormal = readNormal( uv );
  float normalEdge = 1.0 - clamp( dot( centreNormal, sampleNormal ), -1.0, 1.0 );
  return vec2( depthEdge, normalEdge );
}

void main() {
  vec2 texel = 1.0 / uResolution;
  vec4 src = texture2D( tDiffuse, vUv );

  /* The physical CRT is part of the room; its raster image is UI and stays untouched. */
  if ( uProtectedOn > 0.5 && insideProtectedQuad( vUv * 2.0 - 1.0 ) ) {
    gl_FragColor = src;
    if ( uEncode > 0.5 ) gl_FragColor = linearToOutputTexel( gl_FragColor );
    return;
  }

  vec3 colour = src.rgb;

  if ( uStrength > 0.0 && uRadius > 0.0 ) {
    /* Five-tap, luma-aware flattening: calm interiors without crossing object boundaries. */
    vec2 o = texel * uRadius;
    vec3 sum = colour;
    float total = 1.0;
    vec3 s0 = texture2D( tDiffuse, vUv + vec2( o.x, 0.0 ) ).rgb;
    vec3 s1 = texture2D( tDiffuse, vUv - vec2( o.x, 0.0 ) ).rgb;
    vec3 s2 = texture2D( tDiffuse, vUv + vec2( 0.0, o.y ) ).rgb;
    vec3 s3 = texture2D( tDiffuse, vUv - vec2( 0.0, o.y ) ).rgb;
    float centreLuma = luma( colour );
    float w0 = exp( -abs( luma( s0 ) - centreLuma ) * 28.0 );
    float w1 = exp( -abs( luma( s1 ) - centreLuma ) * 28.0 );
    float w2 = exp( -abs( luma( s2 ) - centreLuma ) * 28.0 );
    float w3 = exp( -abs( luma( s3 ) - centreLuma ) * 28.0 );
    sum += s0 * w0 + s1 * w1 + s2 * w2 + s3 * w3;
    total += w0 + w1 + w2 + w3;
    colour = mix( colour, sum / total, uStrength );
  }

  // Brightness sits here on purpose: after the filter, before every line-drawing step, so
  // lifting the room never lifts its ink. See PaintLook.brightness.
  colour *= uBrightness;

  /*
   * Chroma, then value steps. This order matters.
   *
   * Saturating first means the posteriser quantises a colour that already has its final
   * hue strength, so the flat blocks come out at full chroma. Doing it the other way round
   * saturates the seams between steps as much as the steps themselves and puts a coloured
   * fringe on every band edge.
   */
  if ( uSaturation != 1.0 ) {
    colour = mix( vec3( luma( colour ) ), colour, uSaturation );
  }

  /*
   * Flat blocks, which is the half of "cel shading" the material injection cannot do.
   *
   * painterly.ts bands the DIRECT light term inside the per-light loop and deliberately
   * leaves the hemisphere fill smooth. That is the right call for a painted look, but it
   * means a surface lit mostly by fill still slides through a gradient - and in a night
   * interior that is most of the frame, which is why the result read as soft shading rather
   * than as cel. Quantising the finished pixel catches everything, whatever drew it.
   *
   * Scaled rather than replaced, so hue and chroma survive: only the value is stepped.
   */
  if ( uPosterize > 0.5 ) {
    /*
     * Rounded to the nearest step, not raised to the next one.
     *
     * The obvious form - floor, then ramp up across the bottom of the cell - moves almost
     * every pixel UP by nearly a whole step, because anything past the ramp has already
     * arrived at the top. Measured on an aisle capture it lifted mean luma from 61 to 104
     * and turned a night interior into an overcast afternoon, which would have quietly
     * undone the exposure settled at the F8 panel.
     *
     * Transitioning across the MIDDLE of each cell is the same flat-block result with no
     * bias: as many pixels step down as step up, so the frame keeps the mean it had.
     */
    float value = max( luma( colour ), 0.0001 );
    /*
     * Stepped in PERCEPTUAL space, not linear.
     *
     * Quantising linear luminance spends almost every step in the highlights, where a night
     * interior has nothing, and lays one enormous step across the entire shadow range, where
     * it has everything. At four bands the bottom step swallowed each pixel below 0.125 and
     * flattened it to absolute black - the roof trusses, the far end of the aisle and most
     * of the ceiling went out together, and the frame lost half its mean.
     *
     * A gamma curve is roughly how the eye spaces value, and it is how a painter picks the
     * steps between shadow and light. Banding there puts the four steps where the picture
     * actually lives: the darkest band now ends at 0.008 linear instead of 0.125.
     */
    float perceptual = pow( value, 0.4545 );
    float scaled = perceptual * uPosterize;
    float base = floor( scaled );
    float within = fract( scaled );
    float halfSoft = max( uPosterizeSoft, 0.0001 ) * 0.5;
    float steppedPerceptual = ( base + smoothstep( 0.5 - halfSoft, 0.5 + halfSoft, within ) ) / uPosterize;
    float banded = pow( steppedPerceptual, 2.2 );
    colour *= banded / value;
  }

  if ( uInk > 0.0 ) {
    // Compact luminance derivative. Geometry contours are supplied separately below.
    float r = uRadius > 0.0 ? uRadius : 1.0;
    vec2 o = texel * max( 1.0, r * 0.5 );
    float ml = luma( texture2D( tDiffuse, vUv + vec2( -o.x,  0.0 ) ).rgb );
    float mr = luma( texture2D( tDiffuse, vUv + vec2(  o.x,  0.0 ) ).rgb );
    float tc = luma( texture2D( tDiffuse, vUv + vec2( 0.0, o.y ) ).rgb );
    float bc = luma( texture2D( tDiffuse, vUv - vec2( 0.0, o.y ) ).rgb );
    float edge = clamp( abs( mr - ml ) + abs( tc - bc ), 0.0, 1.0 );
    /*
     * Only where there is light to lose. Inking the darks turns every shadow into a scribble
     * and this game is mostly shadow, so the edge is weighted by how lit the pixel already
     * is - the same reason a painter draws into the light and lets the darks close up.
     */
    edge *= smoothstep( 0.05, 0.35, luma( colour ) );
    colour *= 1.0 - edge * uInk;
  }

  if ( uTint > 0.0 ) {
    float l = luma( colour );
    vec3 cool = vec3( 0.76, 0.89, 1.13 );
    vec3 warm = vec3( 1.11, 1.02, 0.88 );
    colour *= mix( vec3( 1.0 ), mix( cool, warm, smoothstep( 0.10, 0.62, l ) ), uTint );
  }

  /*
   * The signal restore, and it USED TO RUN LAST.
   *
   * This hands saturated pixels back their original colour so a scan sweep, an evidence
   * highlight or a door-state lamp is not banded into something else. Running it after the
   * contour meant it also handed back the pixels the contour had just been drawn on: every
   * outline that happened to fall on a coloured surface was erased, by design, one line of
   * code later. That is the whole "the cel shading does not produce the lines" report - the
   * lines were being drawn and then painted over.
   *
   * It runs here now, and the contour is the last thing that touches the image. A signal
   * colour still opts out of the banding and the ink; it no longer opts out of its own
   * silhouette, which was never the intent.
   *
   * The test is tightened too. Chroma alone calls anything colourful a signal, which was
   * harmless while the warehouse palette was grey and describes half the room now that it
   * is not. Requiring real brightness as well as real chroma is what separates an
   * emissive UI colour from a cardboard box that is merely brown.
   */
  float high = max( src.r, max( src.g, src.b ) );
  float low = min( src.r, min( src.g, src.b ) );
  float semanticSignal = smoothstep( 0.22, 0.5, high - low ) * smoothstep( 0.42, 0.74, high );
  vec3 signalColour = src.rgb * uBrightness;
  signalColour = mix( vec3( luma( signalColour ) ), signalColour, uSaturation );
  colour = mix( colour, signalColour, semanticSignal * uProtectSignals );

  if ( uHasGeometry > 0.5 && uOutlineStrength > 0.0 ) {
    float centreDepth = texture2D( tSceneDepth, vUv ).x;
    vec3 centreNormal = readNormal( vUv );
    /*
     * Eight taps, not four.
     *
     * A cross-shaped kernel only ever measures across a horizontal or a vertical, so an
     * edge running at forty-five degrees is sampled along its own length and reads as
     * barely an edge at all. A warehouse is diagonals: every rack, beam and floor line runs
     * to a vanishing point, which is the worst possible case for a four-tap contour and
     * exactly the geometry this game is made of.
     *
     * The corners sit at 0.7071 of the step so all eight are the same distance out, and the
     * line comes out one weight the whole way round instead of thinning on the diagonals.
     */
    vec2 outlineStep = uOutlineTexel * max( 1.0, uOutlineWidth );
    vec2 diagonal = outlineStep * 0.7071;
    vec2 edge = vec2( 0.0 );
    edge = max( edge, geometryDifference( vUv + vec2( outlineStep.x, 0.0 ), centreDepth, centreNormal ) );
    edge = max( edge, geometryDifference( vUv - vec2( outlineStep.x, 0.0 ), centreDepth, centreNormal ) );
    edge = max( edge, geometryDifference( vUv + vec2( 0.0, outlineStep.y ), centreDepth, centreNormal ) );
    edge = max( edge, geometryDifference( vUv - vec2( 0.0, outlineStep.y ), centreDepth, centreNormal ) );
    edge = max( edge, geometryDifference( vUv + diagonal, centreDepth, centreNormal ) );
    edge = max( edge, geometryDifference( vUv - diagonal, centreDepth, centreNormal ) );
    edge = max( edge, geometryDifference( vUv + vec2( diagonal.x, -diagonal.y ), centreDepth, centreNormal ) );
    edge = max( edge, geometryDifference( vUv + vec2( -diagonal.x, diagonal.y ), centreDepth, centreNormal ) );
    /*
     * Both windows come down by roughly half.
     *
     * The old ranges only ever fully fired on a near silhouette against a far background.
     * A crease between two faces of the same rack twenty metres down an aisle - which is
     * most of the lines in the reference the look is aimed at - landed in the bottom tenth
     * of the ramp and drew nothing. The gains stay as the tuning knobs; these are the
     * windows they act on.
     */
    /*
     * The depth test has to know how OBLIQUE the surface is.
     *
     * A raw depth difference between neighbouring pixels is large on any surface receding
     * from the lens, whether or not there is an edge there - a floor seen at a glancing
     * angle changes depth faster across one pixel than a genuine step does. Down a
     * twenty-six metre aisle almost every surface is oblique, so with the prepass finally
     * feeding it, a plain threshold inked the entire room solid: measured at 70% of the
     * frame below luma 0.10, against 14% before.
     *
     * MeshNormalMaterial writes VIEW-space normals, so the z component is the cosine
     * between the surface and the lens. Dividing the tolerance by it asks the right
     * question - "is this step bigger than the slope alone would explain" - instead of "is
     * this step big". Clamped at 0.12 so a surface seen edge-on does not divide by nearly
     * nothing and disable the test where silhouettes actually live.
     */
    float facing = max( abs( centreNormal.z ), 0.12 );
    float slopeTolerance = 1.0 / facing;
    /*
     * Widened again once the room came up.
     *
     * These windows were set while the warehouse was still a night interior, where ink and
     * shadow are the same colour and a generous contour just reads as more darkness. Against
     * a high-key room the ink is the only dark thing in the frame, so it can afford to be
     * drawn the way the reference draws it - present on every form, not only on the ones
     * with a hard silhouette behind them.
     */
    /*
     * Retuned once the prepass was pointed at the right camera.
     *
     * Every number here before this had been chosen against a contour that was never drawn -
     * the prepass was rendering the workstation from the workstation's lens, so widening the
     * line and lowering the windows changed an image nobody was looking at. With it live,
     * the same values inked the racking solid: a rack upright is four to eight pixels wide
     * down an aisle and a three-pixel contour on both sides of it leaves no member in the
     * middle, only a dark bar where one used to be.
     *
     * These are set so the line reads on the SILHOUETTE and lets the surface keep its own
     * colour, which is what the reference does - the ink there is a boundary, not a fill.
     */
    float contour = max(
      smoothstep( 0.05 * slopeTolerance, 0.18 * slopeTolerance, edge.x * uDepthInk ),
      smoothstep( 0.14, 0.42, edge.y * uNormalInk )
    );
    colour = mix( colour, uInkColor, contour * uOutlineStrength );
  }

  if ( uTooth > 0.0 ) {
    float grain = toothHash( floor( gl_FragCoord.xy * 0.5 ) );
    colour *= 1.0 - grain * uTooth;
  }


  gl_FragColor = vec4( colour, src.a );
  // Only the pass that reaches the canvas owes it an encode - same rule as the CRT.
  if ( uEncode > 0.5 ) gl_FragColor = linearToOutputTexel( gl_FragColor );
}
`;
