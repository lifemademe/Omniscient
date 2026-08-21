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

/** How hard each part of the conversion is pushed. All four go to zero. */
export interface PaintLook {
  /** Kuwahara radius in pixels. 0 disables it and costs nothing. */
  radius: number;
  /** How much of the filtered image replaces the original, 0..1. */
  strength: number;
  /** Ink on edges, 0..1. */
  ink: number;
  /** Cold shadows and warm lights, 0..1. */
  tint: number;
  /** Canvas grain, 0..1. */
  tooth: number;
}

export const PAINT_LOOKS = {
  /** Off. Exactly the image the game had before this file existed. */
  off: { radius: 0, strength: 0, ink: 0, tint: 0, tooth: 0 },
  /**
   * The one to look at first.
   *
   * A 3px radius at 0.85 flattens the noise out of the textures without eating the pixel
   * art's own edges, which are the thing this game cannot afford to lose.
   */
  painted: { radius: 3, strength: 0.85, ink: 0.35, tint: 0.4, tooth: 0.08 },
  /** Pushed, for judging the direction rather than for shipping. */
  heavy: { radius: 5, strength: 1, ink: 0.6, tint: 0.65, tooth: 0.14 },
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
 * The quadrant loop is unrolled over a compile-time maximum rather than the live radius,
 * because GLSL ES 1.00 will not accept a loop bound that is a uniform. `uRadius` scales the
 * step inside it, so the radius is still continuous at runtime - it is the sample COUNT that
 * is fixed, and sixteen taps per quadrant is more than enough at these radii.
 */
export const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uRadius;
uniform float uStrength;
uniform float uInk;
uniform float uTint;
uniform float uTooth;
uniform float uEncode;

float luma( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }

float toothHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}

void main() {
  vec2 texel = 1.0 / uResolution;
  vec4 src = texture2D( tDiffuse, vUv );
  vec3 colour = src.rgb;

  if ( uStrength > 0.0 && uRadius > 0.0 ) {
    /*
     * Kuwahara. Four quadrants, mean and variance of each, keep the flattest.
     *
     * Variance is what picks the winner, and it is why edges survive: a quadrant that
     * straddles a boundary has high variance and loses to one that sits entirely on one
     * side of it, so the pixel takes the colour of the region it belongs to rather than an
     * average of both. That is the difference between paint and blur.
     */
    vec3 bestMean = colour;
    float bestVar = 1e9;
    for ( int q = 0; q < 4; q++ ) {
      vec2 dir = vec2( q == 0 || q == 3 ? 1.0 : -1.0, q < 2 ? 1.0 : -1.0 );
      vec3 sum = vec3( 0.0 );
      vec3 sumSq = vec3( 0.0 );
      float n = 0.0;
      for ( int i = 0; i <= 4; i++ ) {
        for ( int j = 0; j <= 4; j++ ) {
          vec2 off = vec2( float( i ), float( j ) ) * dir * ( uRadius / 4.0 ) * texel;
          vec3 s = texture2D( tDiffuse, vUv + off ).rgb;
          sum += s;
          sumSq += s * s;
          n += 1.0;
        }
      }
      vec3 mean = sum / n;
      vec3 variance = abs( sumSq / n - mean * mean );
      float v = variance.r + variance.g + variance.b;
      if ( v < bestVar ) {
        bestVar = v;
        bestMean = mean;
      }
    }
    colour = mix( colour, bestMean, uStrength );
  }

  if ( uInk > 0.0 ) {
    // Sobel on luminance. Darkened, not drawn - a line the painter left, not an outline.
    float r = uRadius > 0.0 ? uRadius : 1.0;
    vec2 o = texel * max( 1.0, r * 0.5 );
    float tl = luma( texture2D( tDiffuse, vUv + vec2( -o.x,  o.y ) ).rgb );
    float tc = luma( texture2D( tDiffuse, vUv + vec2(  0.0,  o.y ) ).rgb );
    float tr = luma( texture2D( tDiffuse, vUv + vec2(  o.x,  o.y ) ).rgb );
    float ml = luma( texture2D( tDiffuse, vUv + vec2( -o.x,  0.0 ) ).rgb );
    float mr = luma( texture2D( tDiffuse, vUv + vec2(  o.x,  0.0 ) ).rgb );
    float bl = luma( texture2D( tDiffuse, vUv + vec2( -o.x, -o.y ) ).rgb );
    float bc = luma( texture2D( tDiffuse, vUv + vec2(  0.0, -o.y ) ).rgb );
    float br = luma( texture2D( tDiffuse, vUv + vec2(  o.x, -o.y ) ).rgb );
    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy =  tl + 2.0 * tc + tr - bl - 2.0 * bc - br;
    float edge = clamp( sqrt( gx * gx + gy * gy ), 0.0, 1.0 );
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

  if ( uTooth > 0.0 ) {
    float grain = toothHash( floor( gl_FragCoord.xy * 0.5 ) );
    colour *= 1.0 - grain * uTooth;
  }

  gl_FragColor = vec4( colour, src.a );
  // Only the pass that reaches the canvas owes it an encode - same rule as the CRT.
  if ( uEncode > 0.5 ) gl_FragColor = linearToOutputTexel( gl_FragColor );
}
`;
