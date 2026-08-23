/**
 * The pointer, which is part of the machine.
 *
 * ## Why this exists
 *
 * Two faults, and they are different problems that happen to have one fix.
 *
 * The cursor DISAPPEARS once you click into the game. Nothing in this project hides it and
 * the engine's only pointer-lock request lives in PlayerController, which this game does
 * not use - so the cause is somewhere in the host window rather than in code we own. That
 * makes it unfixable at the source and trivial to fix at the destination: declare a cursor
 * explicitly and loudly enough that whatever was clearing it loses.
 *
 * And it was the operating system's arrow, on a screen that is otherwise entirely this
 * machine's. Every readable thing in OMNISCIENT_ is phosphor green on near-black; a white
 * Windows arrow sitting on top of that is the one element in the frame that belongs to
 * another program. The pointer is the player's hand inside the fiction - on the globe it
 * is what picks a person to help - so it should look like it belongs to the console.
 *
 * ## Drawn rather than imported
 *
 * An SVG data URI, so there is no asset to load, nothing to go missing, and no second
 * place for the palette to drift. Both cursors carry a dark outline under the green: on
 * the globe the background is near-black and on a lit diorama it can be a pale wall, and a
 * flat green arrow vanishes against roughly half of what this game draws.
 */

import { ACCENT } from './palette.js';

const STYLE_ID = 'omniscient-cursor';
const HIDDEN_CLASS = 'omni-cursor-hidden';
let telemetrySuppressed = false;
let pointerLockAllowed = false;

/** Where the point of the arrow actually is, in the SVG's own pixels. */
const ARROW_HOTSPOT = '3 2';
/** The fingertip, which is what a player aims with a hand cursor. */
const HAND_HOTSPOT = '9 3';

function encode(svg: string): string {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

/**
 * The arrow: a hard-edged wedge, in keeping with everything else in this game.
 *
 * Deliberately not the rounded system arrow. The outline is drawn first and slightly
 * fatter than the fill, which is the cheapest way to get a readable edge on both a dark
 * console and a lit room without two separate cursors.
 */
const ARROW = `
<svg xmlns="http://www.w3.org/2000/svg" width="22" height="26" viewBox="0 0 22 26">
  <path d="M3 2 L3 19 L7.5 15 L10.5 22 L13.5 20.6 L10.6 14 L16 14 Z"
        fill="#0b1410" stroke="#0b1410" stroke-width="3" stroke-linejoin="round"/>
  <path d="M3 2 L3 19 L7.5 15 L10.5 22 L13.5 20.6 L10.6 14 L16 14 Z" fill="${ACCENT.knowledge}"/>
</svg>`;

/** The hand, for anything the player can actually press. */
const HAND = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="26" viewBox="0 0 24 26">
  <path d="M9 3 L9 12 L9 8.5 L12 8.5 L12 12 L15 9.5 L15 13 L18 12 L18 18
           Q18 22 14 22 L11 22 Q7 22 6 18 L5 14 Q4.6 12 6.4 11.6 Q8 11.3 8.4 13 Z"
        fill="#0b1410" stroke="#0b1410" stroke-width="3" stroke-linejoin="round"/>
  <path d="M9 3 L9 12 L9 8.5 L12 8.5 L12 12 L15 9.5 L15 13 L18 12 L18 18
           Q18 22 14 22 L11 22 Q7 22 6 18 L5 14 Q4.6 12 6.4 11.6 Q8 11.3 8.4 13 Z"
        fill="${ACCENT.knowledge}"/>
</svg>`;

/**
 * Declare the cursor for the whole game, once.
 *
 * `!important` on purpose, and it is not laziness: the point is to beat whatever is
 * clearing the cursor in the host window, and a rule that can be overridden does not solve
 * the problem it exists for. The `, auto` fallback means a browser that refuses the data
 * URI still shows SOMETHING, which is the failure mode worth protecting against - a
 * missing image on a cursor rule leaves the player with no pointer at all.
 *
 * Two rules rather than one: everything gets the arrow, and anything the console has
 * already marked as pressable keeps a hand. The console's own `cursor: pointer` rules stay
 * meaningful; they just stop being the operating system's hand and start being this one.
 */
export function installCursor(): void {
  suppressEditorTelemetry();
  if (document.getElementById(STYLE_ID)) {
    setCursorVisible(false);
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
html, body, canvas, .omni-cv, .omni-cv * {
  cursor: ${encode(ARROW)} ${ARROW_HOTSPOT}, auto !important;
}
button, a, [role='button'],
.omni-globe__answer, .omni-globe__name, .omni-chip, .omni-tab,
.omni-board__cell, .omni-board__person, .omni-board__slot, .omni-board__pin,
.omni-board__track, .omni-hint, .omni-terminal__send {
  cursor: ${encode(HAND)} ${HAND_HOTSPOT}, pointer !important;
}
html.${HIDDEN_CLASS}, html.${HIDDEN_CLASS} * {
  cursor: none !important;
}
/*
 * Sandbox Studio's play runner injects the standard Three.js Stats panel into the game
 * document. It is not part of the project and is absent from a published build, but it
 * otherwise contaminates every editor capture. Match the library's exact fixed/clickable
 * 10000-layer signature rather than hiding arbitrary canvases or game UI.
 */
body > div[style*='position: fixed'][style*='z-index: 10000'][style*='cursor: pointer'] {
  display: none !important;
}`;
  document.head.appendChild(style);
  setCursorVisible(false);

  /**
   * Refuse accidental pointer lock on the game's click-driven screens. Dedicated direct-
   * control spaces can opt in while mounted, then hand this protection back on exit.
   */
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement && !pointerLockAllowed) void document.exitPointerLock();
  });
}

/**
 * Remove only the injected Three.js Stats panel from editor play windows.
 *
 * Some runner versions mount it in the game's document and others in the parent host. Its
 * library signature is unusually specific: a fixed/absolute clickable layer at z-index
 * 10000 containing several tiny canvases. A MutationObserver covers runners that add it a
 * frame after beginPlay; published builds match nothing and pay no ongoing work.
 */
function suppressEditorTelemetry(): void {
  if (telemetrySuppressed) return;
  telemetrySuppressed = true;

  const documents: Document[] = [document];
  try {
    if (window.parent !== window && window.parent.document !== document) {
      documents.push(window.parent.document);
    }
  } catch {
    // A cross-origin host is allowed; the project document is still scanned below.
  }

  for (const owner of documents) {
    const hide = (): void => {
      for (const candidate of owner.body?.querySelectorAll('div') ?? []) {
        const style = owner.defaultView?.getComputedStyle(candidate);
        const position = style?.position;
        if (
          style?.zIndex === '10000' &&
          style.cursor === 'pointer' &&
          (position === 'fixed' || position === 'absolute') &&
          candidate.querySelectorAll('canvas').length >= 2
        ) {
          candidate.style.setProperty('display', 'none', 'important');
        }
      }
    };
    hide();
    if (owner.body) new MutationObserver(hide).observe(owner.body, { childList: true });
  }
}

/**
 * The pointer is an interaction affordance, not a watermark.
 *
 * It is hidden while the machine is booting or the camera is carrying the player between
 * spaces, then restored at the first moment there is something to choose. Keeping this as
 * a root class also beats host/editor cursor rules without making individual screens know
 * which element currently owns the pointer.
 */
export function setCursorVisible(visible: boolean): void {
  document.documentElement.classList.toggle(HIDDEN_CLASS, !visible);
}

/** Allow raw mouse capture only for a mounted direct-control gameplay space. */
export function setPointerLockAllowed(allowed: boolean): void {
  pointerLockAllowed = allowed;
  if (!allowed && document.pointerLockElement) void document.exitPointerLock();
}
