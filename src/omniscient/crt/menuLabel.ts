/**
 * The machine saying, on its own screen, what you are reaching for.
 *
 * ## Why the menu needed somewhere to put its names
 *
 * The plate labels - NEW GAME, CONTINUE, SETTINGS - are world geometry, painted on the
 * plates and lit by the room. That was fine at full resolution and stopped being fine the
 * moment the game got a pixel grid: captured at three settings and cropped to one label, off
 * is crisp, 2 is chunky and readable, 3 is mush.
 *
 * Exempting them was never an option worth having. A menu plate that stays sharp while the
 * desk it hangs over goes coarse is an object that has left the room, and this game's opening
 * move is eight seconds of boot screen proving the console is a thing standing in a place.
 *
 * ## Why the tube and not an overlay
 *
 * The first attempt hung a DOM readout under the wordmark. It would have worked and it would
 * have been wrong: a caption floating on the wall is the interface talking ABOUT the room
 * rather than the machine answering in it, which is the one thing §157 rules out - the
 * console never touches anything.
 *
 * The tube is already on the desk, already switched on, already showing the knowledge tree,
 * and it is the machine's only voice in this scene. Putting the name there means hovering a
 * plate makes the CRT report what the plate is, which is what a machine with a screen would
 * actually do. Nothing new appears on screen; something already there says something.
 *
 * It also survives the pixel grid for free, because it is drawn in a 3x5 pixel font onto a
 * 192x144 canvas that was always going to be displayed coarse. A readout designed for a
 * low-resolution screen cannot be ruined by one.
 */

import { drawPixelText, pixelTextWidth } from '../view/pixelFont.js';

import type { CRTSurface } from './CRTSurface.js';

/**
 * Glyph scale. 3 puts a capital at 15 surface pixels, which on screen at the menu's framing
 * is about 30 and roughly ten blocks of the game's pixel grid. Verified by capture rather
 * than estimated - the guess before looking was that 3 would be too small to read, and it is
 * not: a 3x5 face is designed for exactly this and survives being blocked far better than
 * any antialiased one.
 */
const SCALE = 3;
/**
 * The band's top, in surface pixels of a 144-tall screen.
 *
 * 104 and scale 4 were the first try and both were too much: the longest name, SHUT DOWN,
 * is nine characters, which at scale 4 is 144 of the 192 available and left the line
 * touching the bezel at the bottom of the tube with the last glyph running into the corner
 * where the perspective takes it. A screen readout that reaches its own edges reads as an
 * overflow rather than as a report.
 *
 * At scale 3 the same nine characters are 108 wide with 42 pixels of air either side, and
 * the band sits clear of the bottom by a comfortable margin.
 */
const BAND_TOP = 86;
const BAND_HEIGHT = 26;

/**
 * Write a name across the bottom of the tube, over whatever is already drawn there.
 *
 * Call AFTER the tree has drawn and before the surface is committed - the tree clears the
 * canvas every frame, so anything written before it is erased.
 *
 * The band is not decoration. The tree's trunk comes up through the middle of this screen and
 * green-on-green would be unreadable, so the label needs its own ground; and a strip that
 * dims what is behind it rather than replacing it is what a real overlay on a CRT does.
 */
export function drawMenuLabel(surface: CRTSurface, title: string): void {
  const { ctx, width } = surface;
  const text = title.toUpperCase();

  // The ground. Dark rather than black, so the tree stays faintly visible through it and
  // the strip reads as something laid over the picture rather than a hole cut in it.
  ctx.fillStyle = 'rgba(3, 12, 6, 0.82)';
  ctx.fillRect(0, BAND_TOP, width, BAND_HEIGHT);

  // A rule along the top of it, in the console's own green. One line, because two would be
  // a frame and a frame is a piece of interface.
  ctx.fillStyle = 'rgba(127, 224, 138, 0.55)';
  ctx.fillRect(0, BAND_TOP, width, 1);

  const w = pixelTextWidth(text, SCALE);
  drawPixelText(ctx, text, Math.round((width - w) / 2), BAND_TOP + 6, SCALE, '#d8ffb0');
}

/** How tall the label's band is, for anything that needs to keep clear of it. */
export const MENU_LABEL_BAND = { top: BAND_TOP, height: BAND_HEIGHT };
