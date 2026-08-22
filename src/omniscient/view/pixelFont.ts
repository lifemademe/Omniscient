/**
 * The 3x5 face Pelagic OS writes in, alone in its own module on purpose.
 *
 * Two consumers: the station desktop (Keller's OS) and the wall stencils inside the
 * containment sim (stageArt.signTexture) - same operating system, same letterforms. It
 * lived inside stationDesk.ts first, and importing it from there dragged CRTSurface and
 * the whole engine into the texture sheet's standalone bundle. A font is data; data does
 * not get to have dependencies.
 */

export const PIXEL_FONT: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'],
  K: ['101', '110', '100', '110', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'],
  O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '111', '011'], R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '011'], V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
  a: ['000', '011', '101', '101', '011'], b: ['100', '110', '101', '101', '110'],
  c: ['000', '011', '100', '100', '011'], d: ['001', '011', '101', '101', '011'],
  e: ['000', '010', '101', '110', '011'], f: ['001', '010', '111', '010', '010'],
  g: ['000', '011', '101', '011', '110'], h: ['100', '110', '101', '101', '101'],
  i: ['010', '000', '010', '010', '010'], j: ['001', '000', '001', '101', '010'],
  k: ['100', '101', '110', '110', '101'], l: ['110', '010', '010', '010', '011'],
  m: ['000', '110', '111', '101', '101'], n: ['000', '110', '101', '101', '101'],
  o: ['000', '010', '101', '101', '010'], p: ['000', '110', '101', '110', '100'],
  q: ['000', '011', '101', '011', '001'], r: ['000', '011', '100', '100', '100'],
  s: ['000', '011', '110', '011', '110'], t: ['010', '111', '010', '010', '011'],
  u: ['000', '101', '101', '101', '011'], v: ['000', '101', '101', '101', '010'],
  w: ['000', '101', '101', '111', '101'], x: ['000', '101', '010', '010', '101'],
  y: ['000', '101', '101', '011', '110'], z: ['000', '111', '011', '110', '111'],
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
  ':': ['000', '010', '000', '010', '000'], '/': ['001', '001', '010', '100', '100'],
  '.': ['000', '000', '000', '000', '010'], '-': ['000', '000', '111', '000', '000'],
  '+': ['000', '010', '111', '010', '000'], $: ['011', '110', '010', '011', '110'],
  '@': ['010', '101', '111', '100', '011'], '>': ['100', '010', '001', '010', '100'],
  _: ['000', '000', '000', '000', '111'], '~': ['000', '000', '011', '110', '000'],
  ' ': ['000', '000', '000', '000', '000'],
};

/** Draw a string as hard blocks. `scale` multiplies both axes and the advance. */

/**
 * How wide a string is, in pixels, at this scale.
 *
 * Advance is 4 cells: three for the glyph and one of air. The last character's trailing
 * column is included, because a centring calculation that dropped it would sit every label
 * half a pixel left and nobody would ever find out why.
 */
export function pixelTextWidth(text: string, scale: number): number {
  return text.length * 4 * scale;
}

/**
 * Draw a string in the 3x5 face onto any 2D context.
 *
 * Lives here rather than in a consumer because it WAS in a consumer: `stationDesk.ts` had a
 * private copy, and the CRT needed the same thing, and this project has already lost an
 * afternoon today to two copies of one number drifting apart. A renderer for a font is still
 * data's business - it takes a context and touches nothing else, so the module keeps the
 * independence its header claims.
 *
 * Unknown characters advance without drawing, so a string with a colon in it comes out
 * spaced correctly rather than jammed together.
 */
export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: string
): void {
  ctx.fillStyle = color;
  let cx = Math.round(x);
  const top = Math.round(y);
  for (const ch of text) {
    const rows = PIXEL_FONT[ch] ?? PIXEL_FONT[ch.toUpperCase()];
    if (rows) {
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 3; c++) {
          if (rows[r][c] === '1') ctx.fillRect(cx + c * scale, top + r * scale, scale, scale);
        }
      }
    }
    cx += 4 * scale;
  }
}
