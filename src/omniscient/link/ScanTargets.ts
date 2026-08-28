/**
 * Numbered scan reticles, pinned to things in the world.
 *
 * ## What this is for
 *
 * The player is a machine looking at a place it cannot touch, through somebody else's
 * description of it. Everything else in the Contact View is text; nothing on screen ever
 * said "I have identified that object and I am watching it." The evidence in each scene -
 * the transmitter, the beacon, the lock, the torch - was marked with the outline pass, and
 * that was removed because a hard black line round every clue read as a cartoon rather than
 * as an instrument. Removing it left the evidence with no treatment at all.
 *
 * A reticle is the right answer where an outline was the wrong one. An outline is a
 * property of the object - it says "this thing is drawn differently from the rest of the
 * world", which is a lie, because the world is consistent and it is the OBSERVER that
 * differs. A reticle is a property of the observer: it sits in the machine's own layer,
 * in the machine's own colour, drawn over the picture rather than into it. Same
 * information, and it puts the strangeness where it belongs.
 *
 * ## Why the DOM and not geometry
 *
 * A billboard in the scene would be lit, fogged, occluded and scaled by distance - four
 * ways for an annotation to become part of the room it is annotating. It also has to be
 * built per scene. This is one layer over everything, in crisp text at a fixed size, which
 * is what a readout is. `ACCENT.data` is already declared in the palette as "cold cyan =
 * data, scanning"; this is the first thing to use it for what it says.
 *
 * ## Safe UI
 *
 * Labels come from prop ids and mission text, which are authored - but they go through
 * `textContent` regardless. Nothing here builds markup from a string.
 */

import * as THREE from 'three';

import { accessibleTextMilliseconds } from '../accessibility/preferences.js';
import { ACCENT } from '../art/palette.js';

export const SCAN_STYLE_ID = 'omniscient-scan-targets';

/**
 * 8px of bracket at each corner rather than a closed box.
 *
 * A rectangle round an object is a selection; four corners is a sight. The difference is
 * that a sight leaves the middle of the object completely clear, so the thing being looked
 * at is never behind the thing doing the looking.
 */
export const SCAN_CSS = `
.omni-scan {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
  font-family: "Courier New", ui-monospace, monospace;
  overflow: hidden;
}
.omni-scan__t {
  position: absolute;
  width: 0;
  height: 0;
  /*
   * Transform rather than left/top so the browser can move these on the compositor. They
   * are repositioned every frame from the camera, and layout-driven movement of a dozen
   * absolutely positioned nodes at 240fps is the one way this could cost frames.
   */
  will-change: transform;
  opacity: 0;
  transition: opacity 320ms ease-out;
}
.omni-scan__t--on { opacity: 1; }

/*
 * Sized from the object, not from a constant.
 *
 * A fixed 52px sight is the wrong size for everything: it swallows a torch and sits inside
 * a radio set. --rx and --ry are written every frame from the screen extent of the target's
 * eight bounding-box corners, so the sight is the shape of the thing it looks at and grows
 * as the camera pushes in - which is what makes it read as measurement, not as a sticker.
 * Two radii rather than one because the transmitter is three times wider than it is tall.
 */
.omni-scan__t { --rx: 26px; --ry: 26px; }
.omni-scan__box {
  position: absolute;
  left: calc(-1 * var(--rx));
  top: calc(-1 * var(--ry));
  width: calc(var(--rx) * 2);
  height: calc(var(--ry) * 2);
}
.omni-scan__box i {
  position: absolute;
  width: 11px;
  height: 11px;
  border: 1px solid ${ACCENT.data};
  opacity: 0.95;
}
.omni-scan__box i:nth-child(1) { left: 0;  top: 0;  border-right: 0; border-bottom: 0; }
.omni-scan__box i:nth-child(2) { right: 0; top: 0;  border-left: 0;  border-bottom: 0; }
.omni-scan__box i:nth-child(3) { left: 0;  bottom: 0; border-right: 0; border-top: 0; }
.omni-scan__box i:nth-child(4) { right: 0; bottom: 0; border-left: 0;  border-top: 0; }

/* A single hairline from the sight out to where the writing is. */
.omni-scan__leader {
  position: absolute;
  left: var(--rx);
  top: calc(-1 * var(--ry));
  width: 22px;
  border-top: 1px solid ${ACCENT.data};
  opacity: 0.7;
}
.omni-scan__tag {
  position: absolute;
  left: calc(var(--rx) + 22px);
  top: calc(-1 * var(--ry) - 8px);
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 6px 3px;
  white-space: nowrap;
  background: rgba(4, 12, 16, 0.72);
  border-left: 2px solid ${ACCENT.data};
}
.omni-scan__n {
  font-size: calc(12px + var(--omni-font-boost, 0px));
  letter-spacing: 0.06em;
  color: #9fd8ec;
}
.omni-scan__name {
  font-size: calc(9px + var(--omni-font-boost, 0px));
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #5f93a8;
}

/*
 * Callout on the other side.
 *
 * The tag hangs 150px to the right of the sight, and the evidence in most of these rooms
 * is centre-frame - which puts the writing under the transcript column. The first version
 * hid any target whose tag would overflow, and the result was that the one object every
 * request is ABOUT was the only one never marked. A real instrument flips its callout; it
 * does not stop tracking the thing it is looking at.
 */
.omni-scan__t--flip .omni-scan__leader { left: auto; right: var(--rx); }
.omni-scan__t--flip .omni-scan__tag {
  left: auto;
  right: calc(var(--rx) + 22px);
  border-left: 0;
  border-right: 2px solid ${ACCENT.data};
}
/* Compact evidence captions stay with their object, clear of the caller's silhouette. */
.omni-scan__t--below .omni-scan__leader { display: none; }
.omni-scan__t--below .omni-scan__tag {
  left: calc(-1 * var(--rx));
  right: auto;
  top: calc(var(--ry) + 6px);
  border-left: 2px solid ${ACCENT.data};
  border-right: 0;
}

/*
 * Corner furniture, from the mockup's COASTAL RELAY 7 // STORM CELL 04.
 *
 * Two lines in the stage's bottom-right saying what the machine is doing with its eye. It
 * is not decoration: the count is the number of reticles actually on screen, so a room
 * where the evidence has not been found yet reads NO TRACK, and the player can tell the
 * difference between "nothing to see" and "the overlay is broken" - which is a distinction
 * this project has had to make by hand more than once.
 */
.omni-scan__status {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 6px 9px 7px;
  text-align: right;
  font-size: calc(9px + var(--omni-font-boost, 0px));
  line-height: 1.65;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #5f93a8;
  background: linear-gradient(90deg, rgba(4, 12, 16, 0), rgba(4, 12, 16, 0.66));
  pointer-events: none;
}
.omni-scan__status b { color: #9fd8ec; font-weight: normal; }

/*
 * The one moving part.
 *
 * A static reticle reads as a decal; something has to say the machine is still looking.
 * A slow sweep across the sight is the cheapest possible tell and it never competes with
 * the conversation for attention, which a blink or a pulse would.
 */
.omni-scan__sweep {
  position: absolute;
  left: calc(-1 * var(--rx));
  top: calc(-1 * var(--ry));
  width: calc(var(--rx) * 2);
  height: 1px;
  background: ${ACCENT.data};
  opacity: 0.55;
  animation: omni-scan-sweep 2.8s linear infinite;
}
@keyframes omni-scan-sweep {
  0%   { transform: translateY(0);    opacity: 0; }
  12%  { opacity: 0.55; }
  88%  { opacity: 0.55; }
  100% { transform: translateY(calc(var(--ry) * 2 - 1px)); opacity: 0; }
}
`;

/**
 * How far the writing reaches past the sight: the leader plus a typical tag. Used only to
 * decide which side the callout goes on, so an approximation is the right kind of number -
 * measuring the tag would mean a layout read per target per frame to move some text 150px.
 */
const TAG_REACH = 150;

/** The sight never gets so small it is a dot, nor so large it is a border. */
const MIN_R = 16;
const MAX_R = 110;

/** A thing in the world worth pointing at. */
export interface ScanTarget {
  id: string;
  node: THREE.Object3D;
  labelPlacement?: 'side' | 'below';
}

interface Marker {
  root: HTMLElement;
  target: ScanTarget;
  /**
   * The eight corners of the object's local-space bounding box.
   *
   * Local rather than world because several of these props move - the beacon swings, the
   * torch is carried - and a world box measured at mount time would be wrong the moment
   * they did. Transforming eight points by the node's current matrix costs nothing.
   *
   * Corners rather than a radius because a sphere is the wrong shape for most of these.
   * The transmitter is three times wider than it is tall, and a sight sized by the box's
   * half-diagonal came out a third taller than the whole bench it stands on. Projecting
   * the corners and taking their screen extent gives the object's actual footprint, which
   * is both correct and the thing an instrument would draw.
   */
  corners: THREE.Vector3[];
}

/**
 * Human wording for a prop id.
 *
 * Ids are written for code - `photo-box`, `shore-tree` - and a readout that says PHOTO-BOX
 * looks like a variable name leaked on screen, which is exactly the "UI mockup pasted over
 * a render" failure the console chrome was built to avoid.
 */
function labelFor(id: string): string {
  return id.replace(/[-_]+/g, ' ');
}

export class ScanTargets {
  private readonly layer: HTMLElement;
  private markers: Marker[] = [];

  /** Scratch, reused per frame - see §123 on allocating in a tick. */
  private readonly world = new THREE.Vector3();


  /**
   * The stage is the hole in the console frame that the diorama shows through. A reticle
   * that drifts out of it would sit on top of the transcript, so the rect is read once a
   * frame and anything outside it is hidden rather than clamped: a target that has gone
   * behind the panel has genuinely left the view, and pinning it to the edge would claim
   * it is somewhere it is not.
   */
  private stage: HTMLElement | null = null;

  /** The corner readout, parented to the stage once the stage exists. */
  private status: HTMLElement | null = null;
  private statusTyper = 0;

  constructor(container: HTMLElement) {
    if (!document.getElementById(SCAN_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = SCAN_STYLE_ID;
      style.textContent = SCAN_CSS;
      document.head.appendChild(style);
    }

    this.layer = document.createElement('div');
    this.layer.className = 'omni-scan';
    container.appendChild(this.layer);
  }

  /** Show the layer only while a request is open. */
  public setVisible(visible: boolean): void {
    this.layer.style.display = visible ? '' : 'none';
    if (this.status) this.status.style.display = visible ? '' : 'none';
  }

  /**
   * The corner readout, typed rather than set.
   *
   * A readout that simply appears has always been there; one that types has just been
   * worked out, and the whole premise is that the machine is figuring this room out live.
   * It is also the cheapest possible version of the effect - two short strings, one
   * interval, and it stops - which is the only kind worth having in a frame budget.
   *
   * The interval is cancelled on every call, so a fast scene change cannot leave two
   * typers racing to write into the same element.
   */
  private writeStatus(lines: [string, string]): void {
    if (!this.stage) return;
    if (!this.status) {
      this.status = document.createElement('div');
      this.status.className = 'omni-scan__status';
      this.stage.appendChild(this.status);
    }

    window.clearInterval(this.statusTyper);
    const status = this.status;
    const full = lines.join('\n');
    let shown = 0;

    const paint = (text: string): void => {
      status.replaceChildren();
      for (const [i, line] of text.split('\n').entries()) {
        if (i > 0) status.appendChild(document.createElement('br'));
        // The value after the // is the part worth reading, so it gets the bright colour.
        const cut = line.indexOf('//');
        if (cut < 0) {
          status.appendChild(document.createTextNode(line));
          continue;
        }
        status.appendChild(document.createTextNode(line.slice(0, cut + 2)));
        const value = document.createElement('b');
        value.textContent = line.slice(cut + 2);
        status.appendChild(value);
      }
    };

    const interval = accessibleTextMilliseconds(26);
    if (interval === 0) {
      paint(full);
      return;
    }

    this.statusTyper = window.setInterval(() => {
      shown += 1;
      paint(full.slice(0, shown));
      if (shown >= full.length) window.clearInterval(this.statusTyper);
    }, interval);
  }

  /**
   * Point at a new set of things.
   *
   * Rebuilt rather than diffed: a scene change replaces every target, and the numbering
   * restarts from 01 because the numbers are positions in this room's list, not identities.
   */
  public setTargets(targets: ScanTarget[]): void {
    this.layer.replaceChildren();

    this.stage ??= document.querySelector('.omni-cv__stage');
    this.writeStatus([
      `OPTICAL // ${targets.length === 0 ? 'NO TRACK' : `${String(targets.length).padStart(2, '0')} TRACKED`}`,
      'FEED // REMOTE',
    ]);

    this.markers = targets.map((target, index) => {
      const root = document.createElement('div');
      root.className = 'omni-scan__t';
      root.classList.toggle('omni-scan__t--below', target.labelPlacement === 'below');

      const box = document.createElement('div');
      box.className = 'omni-scan__box';
      for (let i = 0; i < 4; i++) box.appendChild(document.createElement('i'));

      const sweep = document.createElement('div');
      sweep.className = 'omni-scan__sweep';
      // Offset per target so two reticles on screen are never in step, which would read
      // as one animation rather than as two instruments.
      sweep.style.animationDelay = `${index * 0.9}s`;

      const leader = document.createElement('div');
      leader.className = 'omni-scan__leader';

      const tag = document.createElement('div');
      tag.className = 'omni-scan__tag';
      const n = document.createElement('span');
      n.className = 'omni-scan__n';
      n.textContent = String(index + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'omni-scan__name';
      name.textContent = labelFor(target.id);
      tag.append(n, name);

      root.append(box, sweep, leader, tag);
      this.layer.appendChild(root);

      // Staggered, so they register one after another instead of arriving as a set. The
      // machine is finding them, not remembering them.
      window.setTimeout(
        () => root.classList.add('omni-scan__t--on'),
        accessibleTextMilliseconds(240 + index * 260)
      );

      /*
       * Measure the object once.
       *
       * `setFromObject` walks every mesh under the node, which for a prop root is the whole
       * assembly - the right answer, and far too expensive to do per frame. Done here it
       * happens once per scene mount, alongside the DOM build that is already the most
       * expensive thing in this class.
       */
      const bounds = new THREE.Box3().setFromObject(target.node);
      if (bounds.isEmpty()) bounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(0.4, 0.4, 0.4));

      // Into the node's own space, so the corners travel with it.
      target.node.updateWorldMatrix(true, false);
      const toLocal = new THREE.Matrix4().copy(target.node.matrixWorld).invert();
      const corners: THREE.Vector3[] = [];
      for (const cx of [bounds.min.x, bounds.max.x]) {
        for (const cy of [bounds.min.y, bounds.max.y]) {
          for (const cz of [bounds.min.z, bounds.max.z]) {
            corners.push(new THREE.Vector3(cx, cy, cz).applyMatrix4(toLocal));
          }
        }
      }

      return { root, target, corners };
    });
  }

  /** Re-pin every reticle to where its object is now. Call once a frame. */
  public update(camera: THREE.Camera | null): void {
    if (!camera || this.markers.length === 0) return;

    const width = this.layer.clientWidth;
    const height = this.layer.clientHeight;
    if (width === 0 || height === 0) return;

    this.stage ??= document.querySelector('.omni-cv__stage');
    const layerBox = this.layer.getBoundingClientRect();
    const stageBox = this.stage?.getBoundingClientRect() ?? null;

    for (const marker of this.markers) {
      marker.target.node.updateWorldMatrix(true, false);
      const matrix = marker.target.node.matrixWorld;

      /*
       * The object's footprint on screen, from its eight corners.
       *
       * `inFront` is per corner and all-or-nothing on purpose. A box straddling the near
       * plane has some corners projecting to sane coordinates and some to wild ones, and
       * averaging those gives a sight the size of the screen for one frame as the camera
       * passes through the object. Dropping the whole target for that frame is invisible;
       * a full-screen bracket is not.
       */
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let inFront = true;

      for (const corner of marker.corners) {
        this.world.copy(corner).applyMatrix4(matrix).project(camera);
        if (this.world.z <= -1 || this.world.z >= 1) {
          inFront = false;
          break;
        }
        const cx = (this.world.x * 0.5 + 0.5) * width;
        const cy = (-this.world.y * 0.5 + 0.5) * height;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
      }

      if (!inFront) {
        marker.root.style.display = 'none';
        continue;
      }

      const x = (minX + maxX) * 0.5;
      const y = (minY + maxY) * 0.5;
      // A little air, so the brackets sit outside the silhouette rather than clipping it.
      const rx = Math.min(MAX_R, Math.max(MIN_R, (maxX - minX) * 0.5 + 10));
      const ry = Math.min(MAX_R, Math.max(MIN_R, (maxY - minY) * 0.5 + 10));
      marker.root.style.setProperty('--rx', `${rx.toFixed(1)}px`);
      marker.root.style.setProperty('--ry', `${ry.toFixed(1)}px`);

      let visible = x > -60 && x < width + 60 && y > -60 && y < height + 60;
      if (visible && stageBox) {
        const px = layerBox.left + x;
        const py = layerBox.top + y;
        /*
         * The bound is the sight, not the sight plus its writing. Only the reticle has to
         * be over the diorama for the target to be worth marking - where the tag goes is a
         * layout question, and it is answered by flipping rather than by giving up.
         */
        visible =
          px > stageBox.left + rx &&
          px < stageBox.right - rx &&
          py > stageBox.top + ry &&
          py < stageBox.bottom - ry;
        marker.root.classList.toggle('omni-scan__t--flip', px + rx + TAG_REACH > stageBox.right);
      }

      marker.root.style.display = visible ? '' : 'none';
      if (visible) marker.root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }

  public dispose(): void {
    window.clearInterval(this.statusTyper);
    this.status?.remove();
    this.status = null;
    this.layer.remove();
    this.markers = [];
  }
}
