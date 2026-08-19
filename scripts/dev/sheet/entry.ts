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
  const cap = document.createElement('figcaption');
  cap.textContent = `${label}  ${src.width}x${src.height}${zoom > 1 ? ` (x${zoom})` : ''}`;
  cell.append(view, cap);
  wrap.append(cell);
}

const S = 'm4ss';
show('backdrop', art.backdropTexture(S).texture);
show('atmosphere', art.atmosphereTexture(S));
show('stone', art.stoneTexture(S), 3);
show('lip', art.lipTexture(S), 2);
show('endCap', art.endCapTexture(S), 2);
show('pool', art.poolTexture(S), 3);
show('bush', art.bushTexture(S), 2);
show('vine', art.vineTexture(S), 3);
show('spores', art.sporeTexture(S), 2);
show('portal', art.portalTexture(S, 0), 3);
show('glow', art.glowTexture(S, '#7fe0a0'), 2);

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
