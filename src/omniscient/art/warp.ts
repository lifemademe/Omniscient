/**
 * The pull back into the machine - green at the edges, and the room going past.
 *
 * ## Why this is a DOM overlay and not a post-process
 *
 * It is screen space, it lasts two seconds, and it has to be frame-accurate against a
 * camera move. A post-process effect would mean a WebGL pass, a uniform to drive, and a
 * place to hang it in the pipeline - for something that is two gradients and a transform.
 * The console's whole interface is already DOM sitting over the render, and this belongs
 * in exactly that layer.
 *
 * ## What it is doing
 *
 * Two things at once, because a vignette alone reads as damage and speed lines alone read
 * as a screen wipe.
 *
 * The VIGNETTE is the machine closing in - phosphor green, transparent through the middle
 * so the diorama stays readable, thickening hard at the corners. It is the same green the
 * CRT draws in, which is the point: the colour of the thing you are being pulled back
 * into arrives before the thing does.
 *
 * The STREAKS are radial, drawn with a repeating conic gradient and masked so they only
 * exist at the edge where the vignette already is. They scale outward from the centre
 * while they fade, so the frame reads as rushing past rather than as lines being drawn on
 * it. Masked rather than faded to nothing in the middle, because a streak that reaches the
 * centre crosses the contact's face at the exact moment the player is looking at them.
 *
 * ## Why it is transform and opacity only
 *
 * Those two are the properties a browser can animate on the compositor without touching
 * layout or paint. Anything else here - a width, a gradient stop, a filter - would run on
 * the main thread alongside the game loop and cost frames during the one moment the camera
 * is moving fastest.
 */

import { getAccessibilityPreferences } from '../accessibility/preferences.js';
import { ACCENT } from './palette.js';

const STYLE_ID = 'omniscient-warp';

const CSS = `
.omni-warp {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* Above the render canvas and the console panels both. 30 put it under the canvas, which
     mounts later in the container and wins on document order at equal stacking. */
  z-index: 9000;
  opacity: 0;
}
/* The closing iris. Transparent well past the middle so the shot stays legible. */
.omni-warp__edge {
  position: absolute;
  inset: -12%;
  background: radial-gradient(
    ellipse at center,
    rgba(127, 224, 138, 0) 30%,
    rgba(127, 224, 138, 0.22) 52%,
    rgba(90, 210, 120, 0.55) 74%,
    rgba(34, 140, 66, 0.88) 100%
  );
}
/* Radial streaks, existing only where the vignette does. The mask is what keeps them off
   the contact's face in the middle of frame. */
.omni-warp__streaks {
  position: absolute;
  inset: -30%;
  background: repeating-conic-gradient(
    from 0deg,
    rgba(150, 255, 170, 0) 0deg,
    rgba(150, 255, 170, 0.85) 0.4deg,
    rgba(150, 255, 170, 0) 1.6deg
  );
  /* Held off the middle of frame, where the contact's face is. Both spellings, because the
     unprefixed property is the newer one and this has to work in whatever the host ships. */
  -webkit-mask-image: radial-gradient(ellipse at center, transparent 26%, black 62%);
  mask-image: radial-gradient(ellipse at center, transparent 26%, black 62%);
  transform: scale(0.55);
}
`;

/**
 * Play the pull-back once.
 *
 * Self-removing. The overlay is built, run and destroyed per transition rather than kept
 * around hidden, because a permanently mounted full-screen element is a permanently
 * composited layer, and this happens eight times in a playthrough.
 */
export function playWarp(container: HTMLElement, seconds = 3.4): void {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const root = document.createElement('div');
  root.className = 'omni-warp';

  const edge = document.createElement('div');
  edge.className = 'omni-warp__edge';

  const streaks = document.createElement('div');
  streaks.className = 'omni-warp__streaks';

  const flash = getAccessibilityPreferences().flashIntensity;
  if (flash === 'reduced') streaks.style.opacity = '0.28';
  if (flash === 'off') {
    edge.style.background =
      'radial-gradient(ellipse at center, rgba(2,8,5,0) 30%, rgba(2,8,5,.34) 54%, rgba(1,5,3,.74) 76%, rgba(0,0,0,.94) 100%)';
    streaks.style.display = 'none';
  }

  root.append(edge, streaks);
  container.appendChild(root);

  /**
   * In fast, out slow.
   *
   * The machine grabbing you should be quicker than the machine letting go - a symmetrical
   * fade reads as a dissolve between two shots rather than as something happening. A fifth
   * of the time coming in, the rest easing out under the camera move.
   */
  /**
   * Longer, and never at full strength.
   *
   * The first version ran two seconds and peaked at opacity 1, and it read as a flash
   * rather than as an event - over before anybody could register it had started, and bright
   * enough while it lasted to bleach the shot it is supposed to be pulling away from.
   *
   * Now it comes up over a third of a second, HOLDS while the camera travels, and leaves
   * slowly. The hold is what makes it read as a thing happening rather than a cut. Peak is
   * 0.62, because this is a veil over the room and not a curtain across it.
   */
  const peak = flash === 'full' ? 0.62 : flash === 'reduced' ? 0.34 : 0.76;
  const hold = flash === 'full' ? 0.55 : flash === 'reduced' ? 0.28 : 0.68;
  const rush = root.animate(
    [
      { opacity: 0 },
      { opacity: peak, offset: 0.11 },
      { opacity: hold, offset: 0.62 },
      { opacity: 0 },
    ],
    { duration: seconds * 1000, easing: 'ease-in-out', fill: 'forwards' }
  );

  // The streaks accelerate outward. Starting under 1 and ending well past it is what sells
  // the direction of travel; the rotation is small and stops it being a static starburst.
  streaks.animate(
    [
      { transform: 'scale(0.5) rotate(0deg)' },
      { transform: 'scale(3.2) rotate(11deg)' },
    ],
    // Still accelerating outward, but over the longer run - the streaks should keep moving
    // for the whole hold rather than arriving and stopping.
    { duration: seconds * 1000, easing: 'cubic-bezier(0.3, 0.55, 0.4, 1)', fill: 'forwards' }
  );

  rush.addEventListener('finish', () => root.remove());
  // Belt and braces: if the tab is backgrounded mid-animation the finish event may never
  // arrive, and a stuck green frame over the game is a worse bug than a missing effect.
  window.setTimeout(() => root.remove(), seconds * 1000 + 600);
}

/** The colour this is keyed to, exported so a caller can match a light or a cue to it. */
export const WARP_GREEN = ACCENT.knowledge;
