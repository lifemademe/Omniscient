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
  /** Linear ink colour. Dark blue-green reads as shadow rather than UI black. */
  inkColor: readonly [number, number, number];
}

export const PAINT_LOOKS = {
  /** Off. Exactly the image the game had before this file existed. */
  off: {
    radius: 0, strength: 0, ink: 0, tint: 0, tooth: 0,
    outlineWidth: 0, depthInk: 0, normalInk: 0, outlineStrength: 0,
    normalScale: 0.5, protectSignals: 0, inkColor: [0.025, 0.035, 0.04],
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
  },
  /** Pushed, for judging the direction rather than for shipping. */
  heavy: {
    radius: 1.8, strength: 0.34, ink: 0.48, tint: 0.65, tooth: 0.08,
    outlineWidth: 1.5, depthInk: 1, normalInk: 0.7, outlineStrength: 0.8,
    normalScale: 0.85, protectSignals: 0.55, inkColor: [0.018, 0.025, 0.03],
  },
  /** Warehouse prototype: clean value bands, occluded contours, no canvas or oil smearing. */
  warehouseCel: {
    radius: 1, strength: 0.12, ink: 0.08, tint: 0.28, tooth: 0,
    outlineWidth: 1.15, depthInk: 1, normalInk: 0.65, outlineStrength: 0.72,
    normalScale: 0.72, protectSignals: 0.92, inkColor: [0.025, 0.035, 0.04],
  },
  /** Lower-cost depth-led contour for high-DPI or constrained GPUs. */
  warehouseCelLow: {
    radius: 0, strength: 0, ink: 0.06, tint: 0.24, tooth: 0,
    outlineWidth: 1, depthInk: 1, normalInk: 0.38, outlineStrength: 0.58,
    normalScale: 0.48, protectSignals: 0.92, inkColor: [0.025, 0.035, 0.04],
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
uniform float uHasGeometry;
uniform float uCameraNear;
uniform float uCameraFar;
uniform vec3 uInkColor;
uniform float uEncode;

float luma( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }

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

  if ( uHasGeometry > 0.5 && uOutlineStrength > 0.0 ) {
    float centreDepth = texture2D( tSceneDepth, vUv ).x;
    vec3 centreNormal = readNormal( vUv );
    vec2 outlineStep = uOutlineTexel * max( 1.0, uOutlineWidth );
    vec2 edge = vec2( 0.0 );
    edge = max( edge, geometryDifference( vUv + vec2( outlineStep.x, 0.0 ), centreDepth, centreNormal ) );
    edge = max( edge, geometryDifference( vUv - vec2( outlineStep.x, 0.0 ), centreDepth, centreNormal ) );
    edge = max( edge, geometryDifference( vUv + vec2( 0.0, outlineStep.y ), centreDepth, centreNormal ) );
    edge = max( edge, geometryDifference( vUv - vec2( 0.0, outlineStep.y ), centreDepth, centreNormal ) );
    float contour = max(
      smoothstep( 0.018, 0.12, edge.x * uDepthInk ),
      smoothstep( 0.08, 0.42, edge.y * uNormalInk )
    );
    colour = mix( colour, uInkColor, contour * uOutlineStrength );
  }

  if ( uTooth > 0.0 ) {
    float grain = toothHash( floor( gl_FragCoord.xy * 0.5 ) );
    colour *= 1.0 - grain * uTooth;
  }


  float high = max( src.r, max( src.g, src.b ) );
  float low = min( src.r, min( src.g, src.b ) );
  float semanticSignal = smoothstep( 0.14, 0.38, high - low ) * smoothstep( 0.2, 0.55, high );
  colour = mix( colour, src.rgb, semanticSignal * uProtectSignals );

  gl_FragColor = vec4( colour, src.a );
  // Only the pass that reaches the canvas owes it an encode - same rule as the CRT.
  if ( uEncode > 0.5 ) gl_FragColor = linearToOutputTexel( gl_FragColor );
}
`;
