/*
 * Every texture generator in stageArt.ts, drawn onto one page.
 *
 * The polish loop's only way of looking at the art was a screenshot of the running game,
 * which costs a build, a play-mode launch and control of the machine's pointer, and which
 * shows each texture once, small, at whatever angle the camera happens to be at. Half the
 * faults found in this run were in the texture itself - lamp pools authored as 36x42 rects,
 * one-pixel speculars, 1230 spores - and every one of them would have been obvious here in
 * a second.
 *
 * This is not a substitute for a capture. A capture proves composition, lighting, scale and
 * that the thing is on screen at all. This proves the SOURCE, which is where the pixels are
 * actually authored, and it is available without stopping what the user is doing.
 */
import * as art from '../../../src/m4ss/stageArt.js';

const wrap = document.getElementById('sheet') as HTMLElement;

/*
 * Show the textures through the SCENE'S TONE CURVE, not raw.
 *
 * This is the fault that mattered most, and it invalidated every brightness judgement made
 * off the first version of this sheet. `assets/default.genesys-scene` sets ACES filmic tone
 * mapping at exposure 0.5, and `lift()` in stageArt.ts exists precisely to pre-compensate for
 * it - the palette is authored bright, by a value-dependent gain of 1.15 to 2.3, because the
 * curve is about to take it back. So the raw texture is SUPPOSED to look blown out. Judging
 * it raw means condemning every colour in the stage for doing its job.
 *
 * `?raw` shows the source values instead, for when the question is about the authored palette
 * rather than about what ships.
 *
 * Ported from three.js's ACESFilmicToneMapping: decode sRGB, scale by exposure/0.6, through
 * the ACES input matrix, the RRT+ODT fit, the output matrix, then encode sRGB again.
 */
const RAW = new URLSearchParams(location.search).has('raw');
const EXPOSURE = 0.5;

const IN_MAT = [
  [0.59719, 0.35458, 0.04823],
  [0.076, 0.90834, 0.01566],
  [0.0284, 0.13383, 0.83777],
];
const OUT_MAT = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
];

const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const apply = (m: number[][], v: number[]): number[] =>
  m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

function toneMap(px: Uint8ClampedArray): void {
  for (let i = 0; i < px.length; i += 4) {
    let c = [toLinear(px[i] / 255), toLinear(px[i + 1] / 255), toLinear(px[i + 2] / 255)];
    c = c.map((v) => (v * EXPOSURE) / 0.6);
    c = apply(IN_MAT, c);
    // RRT and ODT fit.
    c = c.map((v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081));
    c = apply(OUT_MAT, c);
    for (let k = 0; k < 3; k++) {
      px[i + k] = Math.round(Math.max(0, Math.min(1, toSrgb(Math.max(0, Math.min(1, c[k]))))) * 255);
    }
  }
}

/**
 * The same texture, laid three by three - the only way to see whether it TILES.
 *
 * The sheet answered "is this texture any good" and could not answer "does it repeat", which
 * is the question that matters for every surface in the game: a wall is a 128x96 texture
 * repeated fifteen times up a shaft, so a mismatch of one pixel between its top and bottom
 * edges becomes fifteen horizontal lines across the room. Shown at 1:1 because a seam is a
 * discontinuity, and a discontinuity is easiest to see when nothing is interpolated.
 */
function showTiled(label: string, tex: { image: CanvasImageSource & { width: number; height: number } }) {
  const cell = document.createElement('figure');
  const src = tex.image;
  const view = document.createElement('canvas');
  view.width = src.width * 3;
  view.height = src.height * 3;
  const g = view.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) g.drawImage(src, i * src.width, j * src.height);
  }
  if (!RAW) {
    const px = g.getImageData(0, 0, view.width, view.height);
    toneMap(px.data);
    g.putImageData(px, 0, 0);
  }
  cell.appendChild(view);
  const caption = document.createElement('figcaption');
  caption.textContent = `${label} 3x3`;
  cell.appendChild(caption);
  wrap.appendChild(cell);
}

function show(label: string, tex: { image: CanvasImageSource & { width: number; height: number } }, zoom = 1) {
  const cell = document.createElement('figure');
  const src = tex.image;
  const view = document.createElement('canvas');
  view.width = src.width * zoom;
  view.height = src.height * zoom;
  const g = view.getContext('2d')!;
  /*
   * Fill with the stage's own dark ground first.
   *
   * Half these textures are transparent sprites - the portal, the bush, the spores, the
   * glow - and a transparent PNG is shown against WHITE by every image viewer there is. A
   * pale mint membrane meant to be the brightest thing in a dark cavern looks blown out on
   * white and perfectly judged on black, and there is no way to tell which you are looking
   * at unless the ground is stated. So state it: this is roughly the value the stage's haze
   * sits at, and everything is judged against that.
   */
  g.fillStyle = '#16211d';
  g.fillRect(0, 0, view.width, view.height);
  // Nearest-neighbour, or a zoomed pixel-art texture is judged through a blur.
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, view.width, view.height);
  if (!RAW) {
    const px = g.getImageData(0, 0, view.width, view.height);
    toneMap(px.data);
    g.putImageData(px, 0, 0);
  }
  const cap = document.createElement('figcaption');
  cap.textContent = `${label}  ${src.width}x${src.height}${zoom > 1 ? ` (x${zoom})` : ''}${RAW ? '  RAW' : '  ACES 0.5'}`;
  cell.append(view, cap);
  wrap.append(cell);
}

const S = 'm4ss';

/*
 * The tiling checks, first on the page because they are the ones that were missing.
 */
showTiled('tile-wall-gallery', art.wallTexture(S));

showTiled('tile-dirt-plain', art.dirtTexture(S, 128, 96, 'plain'));
art.setStageTheme(art.THEME_STACK);
showTiled('tile-wall-stack', art.wallTexture(S));
art.setStageTheme(art.THEME_GALLERY);

// Both stage identities, side by side - the thumbnail test happens here first.
art.setStageTheme(art.THEME_GALLERY);
show('press', art.pressTexture(S, 60, 260), 1);
show('striker', art.strikerTexture(S, 40, 96), 2);
show('bigshroom', art.bigShroomTexture(S), 1);
show('leafvine', art.leafVineTexture(S), 1);
show('bones', art.bonesTexture(S), 1);
show('deadtree', art.deadTreeTexture(S), 1);
show('growth-live', art.bushTexture(S, 160, false), 2);
show('growth-dead', art.bushTexture(S, 160, true), 2);
show('ring', art.ringTexture(128), 2);
show('dirt-grass', art.dirtTexture(S, 128, 96, 'grass'), 3);
show('dirt-plain', art.dirtTexture(S, 128, 96, 'plain'), 3);
show('acid', art.acidTexture(S, 256, 128), 2);
show('portal-new', art.portalTexture(S, 0), 3);
show('wall-gallery', art.wallTexture(S), 2);
art.setStageTheme(art.THEME_STACK);
show('wall-stack', art.wallTexture(S), 2);
art.setStageTheme(art.THEME_GALLERY);
show('dome', art.domeTexture('dome-gallery'), 1);
art.setStageTheme(art.THEME_STACK);
show('pipestack', art.pipeStackTexture('pipes-stack', 1280, 760), 1);
art.setStageTheme(art.THEME_GALLERY);
show('backdrop', art.backdropTexture(S).texture);
show('atmosphere', art.atmosphereTexture(S));
show('endCap', art.endCapTexture(S), 2);
show('bush', art.bushTexture(S), 2);
show('bushDead', art.bushTexture(S, 160, true), 2);
show('gate', art.gateTexture(S, 40, 590), 1);
show('plate', art.plateTexture(S), 3);
show('vine', art.vineTexture(S), 3);
show('portal', art.portalTexture(S, 0), 3);
show('glow', art.glowTexture(S, '#7fe0a0'), 2);
show('sill', art.sillTexture(S, 96, 30), 4);

/*
 * Post every cell back to catch.py so the textures can be looked at as files.
 *
 * See catch.py for why this is a POST rather than a screenshot or a download.
 */
void (async () => {
  for (const fig of Array.from(wrap.children)) {
    const canvas = fig.querySelector('canvas')!;
    const label = fig.querySelector('figcaption')!.textContent!.split(' ')[0];
    await fetch(`/${label}`, { method: 'POST', body: canvas.toDataURL('image/png') });
  }
  document.title = 'M4SS texture sheet - posted';
})();
