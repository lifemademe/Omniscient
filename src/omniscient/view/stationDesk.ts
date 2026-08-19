/**
 * Station 9's contact view, which is not a room. It is a screen, and it is the whole frame.
 *
 * Every other contact in OMNISCIENT_ opens on a place - a workshop with a tide line, a
 * cellar with water in it - and the player reads the room for evidence. Keller's opens on
 * her desktop, edge to edge, because there is nothing to read in the room she is in and she
 * knows it. The whole request is a file she wants somebody else to open.
 *
 * ## Why this is not the CRT tube's 192x144
 *
 * A desktop is a dense object: a menu bar, a taskbar, eight labelled icons, a terminal with
 * readable output. At 192x144 an icon is six pixels and a filename is unreadable, so the
 * buffer here is 480x270 - exactly quarter-HD, so it lands on a 1920-wide frame at a clean
 * 4x with no resampling and every edge stays hard.
 *
 * It is also drawn with rect fills rather than the PixelSurface line/pixel primitives.
 * Those are one canvas fillRect per PIXEL, which is right for a wireframe globe and absurd
 * for a screen that is mostly filled areas. Everything here is a block, so everything here
 * is a block fill - and the whole desktop repaints only when something on it changed.
 */

import { isM4ssContained } from '../session/persistence.js';
import { PIXEL_FONT as G } from './pixelFont.js';
import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

import { CRTSurface } from '../crt/CRTSurface.js';
import { decorMesh } from '../art/mesh.js';

/** Quarter-HD: a clean 4x onto a 1920 frame, so every pixel stays square and hard. */
export const SCREEN_W = 480;
export const SCREEN_H = 270;

/**
 * The desktop's palette.
 *
 * A cold institutional blue, deliberately nothing like the console's green. The player has
 * spent the whole game inside OMNISCIENT_'s own phosphor; the moment they are looking at
 * somebody ELSE's machine it should be obvious from the colour alone that this is not their
 * software and not their building.
 */
const C = {
  wallTop: '#3a4d6b',
  wallBottom: '#2b3a54',
  bar: '#12161c',
  barInk: '#d6dde8',
  taskInk: '#c2ccd8',
  panel: '#1b2331',
  folder: '#d8a54a',
  folderDark: '#a87c2c',
  folderLip: '#f0c268',
  paper: '#e8edf3',
  paperInk: '#6a7686',
  ink: '#0c1016',
  label: '#e6ecf4',
  select: '#3f7fb5',
  screenGreen: '#7ee08a',
  screenCyan: '#7fd8e8',
  win: '#c8d2de',
  winBar: '#2f5f8f',
  winBody: '#0b0e12',
  warn: '#e07a3c',
  live: '#5fc98f',
  logo: '#42557a',
  accent: '#5a80b8',
};

/** What the desktop is doing. Driven by the mission's cues. */
export type DesktopState = 'idle' | 'selected' | 'opening' | 'open';

interface Icon {
  x: number;
  y: number;
  label: string[];
  kind: 'folder' | 'doc' | 'term' | 'bin' | 'home';
  id?: string;
}

/**
 * The desktop's contents, as data rather than as hand-placed draw calls.
 *
 * The one icon that matters has to be findable by the mission (to highlight it) and by the
 * eye (it is what the whole request is about), and both of those want it to be an entry in
 * a list rather than a special case in a paint routine.
 */
/*
 * The columns start at x 120, not at the left edge, and that is a compromise with the room
 * this screen is actually seen in.
 *
 * The contact view is not the whole window: OMNISCIENT_'s own console sits ON it, a stats
 * column down the left to about x 437 of 1919 and the chat panel from about x 1250. At a
 * clean 4x that leaves buffer columns 109 to 312 unobstructed - 42% of the screen, in the
 * middle. A desktop with its icons in the top-left corner is the honest layout and puts the
 * one icon the entire request is about underneath the connection-strength readout.
 *
 * So the grid is inset. It still reads as a column of icons down the left of a desktop,
 * because everything to the left of them is wallpaper, and the specimen file is the first
 * thing in it - which is what the mission's hint promises.
 */
const ICONS: Icon[] = [
  { x: 120, y: 34, label: ['specimen', 'M4SS'], kind: 'folder', id: 'specimen' },
  { x: 120, y: 100, label: ['Documents'], kind: 'folder' },
  { x: 120, y: 166, label: ['Pictures'], kind: 'folder' },
  { x: 196, y: 34, label: ['Home'], kind: 'home' },
  { x: 196, y: 100, label: ['tank.log'], kind: 'doc' },
  { x: 196, y: 166, label: ['Trash'], kind: 'bin' },
];

export class StationDesktop {
  public state: DesktopState = 'idle';
  private openAmount = 0;
  private time = 0;
  private lastClock = -1;
  private lastState: DesktopState | null = null;
  private lastOpen = -1;
  private caret = false;

  public constructor(private readonly surface: CRTSurface) {}

  public advance(dt: number): void {
    this.time += dt;
    const target = this.state === 'opening' || this.state === 'open' ? 1 : 0;
    this.openAmount += Math.max(-dt * 2.6, Math.min(dt * 2.6, target - this.openAmount));
    if (this.state === 'opening' && this.openAmount > 0.999) this.state = 'open';

    /*
     * Repaint only on change.
     *
     * Nothing on a desktop moves. Repainting 480x270 every frame to animate a clock that
     * ticks once a minute and a caret that blinks twice a second is the sort of cost that
     * does not show up until it is sitting next to a physics simulation - which, in this
     * scene, it is about to be.
     */
    const clock = Math.floor(this.time / 4);
    const caret = Math.floor(this.time * 2) % 2 === 0;
    if (
      clock === this.lastClock &&
      caret === this.caret &&
      this.state === this.lastState &&
      this.openAmount === this.lastOpen
    ) {
      return;
    }
    this.lastClock = clock;
    this.caret = caret;
    this.lastState = this.state;
    this.lastOpen = this.openAmount;
    this.draw();
  }

  private draw(): void {
    const ctx = this.surface.ctx;
    ctx.imageSmoothingEnabled = false;

    this.drawWallpaper(ctx);
    for (const icon of ICONS) this.drawIcon(ctx, icon);
    this.drawTerminal(ctx);
    if (this.openAmount > 0.01) this.drawSpecimenWindow(ctx);
    this.drawMenuBar(ctx);
    this.drawTaskbar(ctx);

    this.surface.applyScanlines(0.1);
    this.surface.commit();
  }

  // -- wallpaper -----------------------------------------------------------------------
  private drawWallpaper(ctx: CanvasRenderingContext2D): void {
    // Banded rather than smooth: a real gradient dithers into mush at this scale, and hard
    // bands are what the era actually looked like.
    const bands = 18;
    for (let i = 0; i < bands; i++) {
      ctx.fillStyle = mix(C.wallTop, C.wallBottom, i / (bands - 1));
      const y0 = Math.round((i / bands) * SCREEN_H);
      const y1 = Math.round(((i + 1) / bands) * SCREEN_H);
      ctx.fillRect(0, y0, SCREEN_W, y1 - y0);
    }

    /*
     * The station mark, watermarked into the middle: a ring of dots, a tank seen from the
     * side, and something in it. Every desktop of this era had one of these, and this one
     * is the only joke on the screen.
     */
    // Centred on the VISIBLE band (buffer 109..312), not on the buffer - see ICONS.
    const cx = 210;
    const cy = 150;
    ctx.fillStyle = C.logo;
    for (let a = 0; a < 72; a++) {
      const th = (a / 72) * Math.PI * 2;
      for (const r of [50, 57]) {
        ctx.fillRect(Math.round(cx + Math.cos(th) * r), Math.round(cy + Math.sin(th) * r), 2, 2);
      }
    }
    ctx.fillRect(cx - 24, cy - 28, 48, 3);
    ctx.fillRect(cx - 24, cy - 28, 3, 54);
    ctx.fillRect(cx + 21, cy - 28, 3, 54);
    ctx.fillRect(cx - 24, cy + 23, 48, 3);
    ctx.fillStyle = C.accent;
    for (let i = 0; i < 5; i++) ctx.fillRect(cx - 15 + i * 3, cy + 4 - i * 2, 22 - i * 4, 16 + i * 2);

    textAt(ctx, cx - 40, cy + 44, 'PELAGIC OS', C.logo, 2);
    textAt(ctx, cx - 18, cy + 62, 'v2.4.1', C.logo, 1);
  }

  // -- icons ---------------------------------------------------------------------------
  private drawIcon(ctx: CanvasRenderingContext2D, icon: Icon): void {
    const lit = icon.id === 'specimen' && this.state !== 'idle';
    if (lit) {
      ctx.fillStyle = C.select;
      ctx.fillRect(icon.x - 13, icon.y - 5, 58, 54);
    }

    const x = icon.x;
    const y = icon.y;
    switch (icon.kind) {
      case 'folder':
        ctx.fillStyle = C.folderDark;
        ctx.fillRect(x, y, 12, 4);
        ctx.fillStyle = C.folder;
        ctx.fillRect(x, y + 3, 30, 22);
        ctx.fillStyle = C.folderLip;
        ctx.fillRect(x, y + 3, 30, 3);
        ctx.fillStyle = C.folderDark;
        ctx.fillRect(x, y + 23, 30, 2);
        break;
      case 'doc':
        ctx.fillStyle = C.paper;
        ctx.fillRect(x + 3, y, 24, 26);
        ctx.fillStyle = C.paperInk;
        for (let i = 0; i < 5; i++) ctx.fillRect(x + 6, y + 5 + i * 4, i === 4 ? 10 : 18, 2);
        // The folded corner, which is the whole reason a rectangle reads as paper.
        ctx.fillStyle = mix(C.paper, C.ink, 0.35);
        ctx.fillRect(x + 21, y, 6, 6);
        break;
      case 'term':
        ctx.fillStyle = C.ink;
        ctx.fillRect(x + 1, y, 28, 24);
        ctx.fillStyle = '#39424f';
        ctx.fillRect(x + 1, y, 28, 2);
        textAt(ctx, x + 6, y + 9, '>_', C.screenGreen, 1);
        break;
      case 'home':
        ctx.fillStyle = '#7f6bb0';
        for (let i = 0; i < 8; i++) ctx.fillRect(x + 14 - i * 2, y + i, 4 + i * 4, 2);
        ctx.fillStyle = '#d8c9a8';
        ctx.fillRect(x + 4, y + 8, 22, 17);
        ctx.fillStyle = '#6a5a48';
        ctx.fillRect(x + 12, y + 15, 7, 10);
        break;
      case 'bin':
        ctx.fillStyle = '#8a939f';
        ctx.fillRect(x + 12, y, 6, 3);
        ctx.fillRect(x + 4, y + 3, 22, 3);
        ctx.fillRect(x + 6, y + 7, 18, 18);
        ctx.fillStyle = '#5d646e';
        for (let i = 0; i < 3; i++) ctx.fillRect(x + 10 + i * 5, y + 10, 2, 12);
        break;
    }

    icon.label.forEach((line, i) => {
      textAt(ctx, x + 15 - (line.length * 4) / 2, y + 31 + i * 8, line, lit ? '#ffffff' : C.label, 1);
    });
  }

  // -- the terminal --------------------------------------------------------------------
  private drawTerminal(ctx: CanvasRenderingContext2D): void {
    const x = 258;
    const y = 150;
    const w = 200;
    const h = 96;

    ctx.fillStyle = C.win;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = C.winBar;
    ctx.fillRect(x, y, w, 13);
    textAt(ctx, x + 4, y + 4, 'Terminal', '#ffffff', 1);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === 2 ? '#c8402c' : '#8fa2b8';
      ctx.fillRect(x + w - 38 + i * 12, y + 3, 9, 7);
    }
    ctx.fillStyle = C.winBody;
    ctx.fillRect(x, y + 13, w, h - 13);

    /*
     * Her session, not a generic directory listing.
     *
     * The reference desktop lists a home folder. This one is a log tail, because it is the
     * only place on the screen where the player can see that she has been doing this for
     * eleven days and nobody has read any of it.
     */
    const lines: Array<[string, string]> = [
      ['keller@pelagic9:~$ tail feed', C.screenGreen],
      ['d09 0412  mass 40  tank empty', C.taskInk],
      ['d10 2251  mass 28  +12 held', C.taskInk],
      ['d11 0330  mass 40  rejoined', C.taskInk],
      ['', C.taskInk],
      ['11 days. nobody has read this.', C.screenCyan],
      ['keller@pelagic9:~$', C.screenGreen],
    ];
    lines.forEach(([line, colour], i) => {
      if (line) textAt(ctx, x + 5, y + 19 + i * 11, line, colour, 1);
    });
    if (this.caret) {
      ctx.fillStyle = C.screenGreen;
      ctx.fillRect(x + 5 + 18 * 4 + 2, y + 19 + 6 * 11 - 1, 3, 7);
    }
  }

  // -- the file, opening ---------------------------------------------------------------
  private drawSpecimenWindow(ctx: CanvasRenderingContext2D): void {
    const t = ease(this.openAmount);
    const fx = ICONS[0].x + 15;
    const fy = ICONS[0].y + 12;
    const x = Math.round(fx + (112 - fx) * t);
    const y = Math.round(fy + (60 - fy) * t);
    const w = Math.max(4, Math.round(216 * t));
    const h = Math.max(4, Math.round(150 * t));

    ctx.fillStyle = C.win;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = C.winBar;
    ctx.fillRect(x, y, w, 13);
    ctx.fillStyle = C.panel;
    ctx.fillRect(x, y + 13, w, h - 13);
    if (t < 0.5) return;

    textAt(ctx, x + 4, y + 4, 'specimen M4SS', '#ffffff', 1);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === 2 ? '#c8402c' : '#8fa2b8';
      ctx.fillRect(x + w - 38 + i * 12, y + 3, 9, 7);
    }

    /*
     * The one live datum on the whole desktop. Once the player has taken the specimen to
     * the second portal, the file stops describing an emergency: BREACHED goes green,
     * and the feed is ARCHIVED because there is nothing left to watch. Read fresh on
     * every draw rather than cached - the flag flips while this screen is off-camera,
     * and a cached copy would report the breach forever.
     */
    const contained = isM4ssContained();
    const rows: Array<[string, string, string]> = [
      ['MASS', '40 units', C.label],
      ['CONTAINMENT', contained ? 'CONTAINED' : 'BREACHED', contained ? C.live : C.warn],
      ['LAST FIX', 'SUBLEVEL 2', C.label],
      ['OBSERVED', '11 days', C.label],
      ['FEED', contained ? 'ARCHIVED' : 'LIVE', contained ? C.label : C.live],
    ];
    rows.forEach(([k, v, colour], i) => {
      const ry = y + 26 + i * 16;
      if (ry > y + h - 28) return;
      textAt(ctx, x + 10, ry, k, C.taskInk, 1);
      textAt(ctx, x + w - 12 - v.length * 4, ry, v, colour, 1);
      ctx.fillStyle = mix(C.panel, C.label, 0.12);
      ctx.fillRect(x + 8, ry + 10, w - 16, 1);
    });
    textAt(ctx, x + 10, y + h - 16, contained ? 'NOTHING TO TAKE' : 'TAKING THE FEED', C.screenCyan, 1);
  }

  // -- chrome --------------------------------------------------------------------------
  private drawMenuBar(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = C.bar;
    ctx.fillRect(0, 0, SCREEN_W, 14);
    ctx.fillStyle = C.folder;
    ctx.fillRect(4, 3, 9, 9);
    ctx.fillStyle = C.bar;
    ctx.fillRect(6, 5, 2, 2);
    ctx.fillRect(9, 5, 2, 2);
    ctx.fillRect(7, 9, 4, 1);

    let x = 22;
    for (const item of ['File', 'Edit', 'View', 'Go', 'Help']) {
      textAt(ctx, x, 5, item, C.barInk, 1);
      x += item.length * 4 + 10;
    }

    // Right cluster: signal bars, battery, clock.
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i < 3 ? C.barInk : '#4a525e';
      ctx.fillRect(SCREEN_W - 96 + i * 4, 9 - i * 2, 3, 3 + i * 2);
    }
    ctx.fillStyle = C.barInk;
    ctx.fillRect(SCREEN_W - 72, 4, 17, 7);
    ctx.fillStyle = C.live;
    ctx.fillRect(SCREEN_W - 71, 5, 12, 5);
    const mins = 14 * 60 + 3 + Math.floor(this.time / 4);
    textAt(ctx, SCREEN_W - 46, 5, `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`, C.barInk, 1);
  }

  private drawTaskbar(ctx: CanvasRenderingContext2D): void {
    const y = SCREEN_H - 20;
    ctx.fillStyle = C.bar;
    ctx.fillRect(0, y, SCREEN_W, 20);
    ctx.fillStyle = '#232b36';
    ctx.fillRect(0, y, 60, 20);
    textAt(ctx, 8, y + 7, 'MENU', C.taskInk, 1);

    const swatches = [C.ink, C.folder, '#4a8fc0', '#8a6fc0'];
    swatches.forEach((colour, i) => {
      ctx.fillStyle = colour;
      ctx.fillRect(68 + i * 22, y + 3, 15, 14);
    });

    // Workspaces. One is current, and it is the only lit thing down here.
    for (let i = 0; i < 4; i++) {
      const bx = SCREEN_W - 96 + i * 20;
      ctx.fillStyle = i === 0 ? C.select : '#232b36';
      ctx.fillRect(bx, y + 3, 16, 14);
      textAt(ctx, bx + 6, y + 7, String(i + 1), C.taskInk, 1);
    }
  }
}

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Blend two hex colours. Used for banding and hairlines, never for anti-aliasing. */
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A 3x5 pixel font with real lowercase.
 *
 * The uppercase-only version looked like a machine shouting, and the reference desktop's
 * filenames are Title Case - "Documents", "tank.log" - which is most of why they read as
 * files somebody named rather than as labels a game printed. Lowercase at this size is
 * three pixels of x-height and two of ascender, which is exactly enough.
 */
function textAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  str: string,
  color: string,
  scale = 1
): void {
  ctx.fillStyle = color;
  let cx = Math.round(x);
  const top = Math.round(y);
  for (const ch of str) {
    const rows = G[ch] ?? G[ch.toUpperCase()];
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

/**
 * The screen, as a quad that fills the frame and nothing else.
 *
 * There was a monitor here - a case, a bezel, a stand, a desk and a wall behind it - and it
 * has all gone. The brief is that the contact view IS the desktop, and every one of those
 * objects was something standing between the player and it. The quad is 16:9 to match the
 * frame, and the scene's camera sits at the distance that makes it fill: with a 46 degree
 * vertical field of view, half of 0.27 over tan(23) is 0.318, and the camera goes a shade
 * closer so the edges crop rather than showing a seam.
 *
 * Unlit, so this scene needs no lighting rig at all. A screen emits.
 */
export function buildStationScreen(surface: CRTSurface): {
  root: ENGINE.SceneNode;
  screen: ENGINE.MeshNode;
} {
  const root = ENGINE.SceneNode.create({ name: 'StationScreen' });

  const geometry = new THREE.PlaneGeometry(0.48, 0.27);
  /*
   * The UVs are flipped VERTICALLY, and the reason is a trap worth naming.
   *
   * CRTSurface used to flip its texture to correct for PlaneGeometry's UVs. That flip was
   * REMOVED when the workstation's screen became an authored quad in CRT_TV.glb, because
   * `fitSurfaceUvs` rebuilds a GLB quad's UVs with v running up the way the world does.
   * Correct for that screen - and it leaves this one, a plain PlaneGeometry, the exact case
   * the flip existed for, rendering its desktop upside down.
   *
   * V only. The first attempt rotated a full 180: upside-down text reads as mirrored as
   * well as inverted, and the two are genuinely hard to tell apart at three pixels a glyph,
   * so that fixed the vertical and introduced a horizontal mirror. Two captures, one axis
   * each, is what it took to be sure.
   */
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), 1 - uv.getY(i));
  uv.needsUpdate = true;

  const screen = decorMesh('StationScreen', geometry, surface.material);
  root.add(screen);
  return { root, screen };
}
