/**
 * Jump straight to any diorama, for looking at it.
 *
 * ## Why this is a feature and not a hack
 *
 * Every scene in this game sits behind a session: to see Adaeze's field you answer Mirela,
 * then Ileana, then Tomas. That is correct for a player and ruinous for art direction. It
 * has already cost this project real work - three temporary edits in one afternoon that
 * still failed to reach the field, and two occasions where a debug hook was committed by
 * accident and shipped a game that skipped its own menu.
 *
 * Both of those happen because the only way in was to *edit the game*. So this exists
 * instead: a permanent, deliberate way in that nobody has to remember to remove. It reads
 * one key combination, calls one method, and is the entire debug surface.
 *
 * ART_DIRECTION §6 asks for the shot the player actually sees, captured and compared
 * against a reference. That is not possible for six of the eight rooms without this.
 *
 * ## What it deliberately does not do
 *
 * It does not fabricate a session, advance a mission, or touch trust. It mounts the room
 * and points the camera at it - the art, with none of the game in front of it. Anything
 * that needs the conversation running should be reached by playing, because a beat that
 * only works when jumped to is not a beat that works.
 */

import { SCENE_IDS } from '../view/scene-ids.js';

/**
 * Ctrl+Shift+1..8.
 *
 * Alt was the obvious choice and is the wrong one on Windows: pressing it activates the
 * window menu, which swallows the keystrokes that follow. The handler was fine - proved by
 * dispatching the event straight from the console, where it fired first time - and the key
 * never reached it. Worth remembering the next time a listener looks broken: test the
 * listener and the input separately, because they fail identically from the outside.
 */
const MODIFIERS = (event: KeyboardEvent): boolean => event.ctrlKey && event.shiftKey;

export interface SceneJumpHost {
  jumpToScene(sceneId: string): void;
}

const BADGE_ID = 'omniscient-scenejump-badge';

/**
 * A label naming the room, so a capture identifies itself.
 *
 * Small thing, and it has already been needed: several shots in this project's history
 * were argued about for a while before anyone established which scene they were of.
 */
function showBadge(container: HTMLElement, index: number, sceneId: string): void {
  let badge = document.getElementById(BADGE_ID);
  if (!badge) {
    badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.style.cssText = [
      'position:absolute',
      'left:50%',
      'bottom:18px',
      'transform:translateX(-50%)',
      'padding:5px 12px 6px',
      'font:9px/1 "Courier New",monospace',
      'letter-spacing:0.24em',
      'text-transform:uppercase',
      'color:#9fd8ec',
      'background:rgba(4,12,16,0.78)',
      'border-left:2px solid #2f7391',
      'pointer-events:none',
      'z-index:9',
      'transition:opacity 400ms ease-out',
    ].join(';');
    container.appendChild(badge);
  }

  badge.textContent = `${index + 1} // ${sceneId.replace(/^scene-/, '').replace(/-/g, ' ')}`;
  badge.style.opacity = '1';
  window.setTimeout(() => {
    if (badge) badge.style.opacity = '0';
  }, 2200);
}

/**
 * A column of eight numbered tabs on the left edge, revealed on hover.
 *
 * The keyboard shortcut is the right interface for a person and turned out to be unusable
 * for the agent building the art: synthetic keystrokes reach the window - confirmed with
 * SetForegroundWindow and AttachThreadInput - and never reach the page, while synthetic
 * mouse events have driven this game reliably for weeks. Rather than keep debugging an
 * input path whose only job is to let me look at rooms, this offers the same eight jumps
 * to the input that works.
 *
 * Hidden until the pointer is within a few pixels of the left edge, so it is absent from
 * every screenshot and from normal play, and costs the player nothing.
 */
function buildStrip(host: SceneJumpHost, container: HTMLElement): HTMLElement {
  const strip = document.createElement('div');
  strip.style.cssText = [
    'position:absolute',
    'left:0',
    'top:50%',
    'transform:translateY(-50%)',
    'display:flex',
    'flex-direction:column',
    'gap:2px',
    'padding:4px 4px 4px 0',
    'opacity:0',
    'transition:opacity 140ms ease-out',
    'z-index:10',
  ].join(';');

  for (const [index, sceneId] of SCENE_IDS.entries()) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.textContent = String(index + 1);
    tab.title = sceneId;
    tab.style.cssText = [
      'width:20px',
      'height:20px',
      'font:10px/1 "Courier New",monospace',
      'color:#9fd8ec',
      'background:rgba(4,12,16,0.9)',
      'border:0',
      'box-shadow:inset 1px 1px 0 #2f7391,inset -1px -1px 0 #040906',
      'cursor:pointer',
    ].join(';');
    tab.addEventListener('click', () => {
      host.jumpToScene(sceneId);
      showBadge(container, index, sceneId);
    });
    strip.appendChild(tab);
  }

  /*
   * Pointer-events stay off the strip until it is revealed, so an invisible column of
   * buttons can never eat a click meant for the world behind it.
   */
  strip.style.pointerEvents = 'none';
  const onMove = (event: MouseEvent): void => {
    const near = event.clientX - container.getBoundingClientRect().left < 34;
    strip.style.opacity = near ? '1' : '0';
    strip.style.pointerEvents = near ? 'auto' : 'none';
  };
  window.addEventListener('mousemove', onMove);
  (strip as HTMLElement & { _dispose?: () => void })._dispose = () =>
    window.removeEventListener('mousemove', onMove);

  container.appendChild(strip);
  return strip;
}

/** Install the listener and the hover strip. Returns a disposer. */
export function installSceneJump(host: SceneJumpHost, container: HTMLElement): () => void {
  const onKey = (event: KeyboardEvent): void => {
    if (!MODIFIERS(event)) return;

    /*
     * event.code, not event.key. With Alt held, the browser reports the *character* the
     * combination would produce, which on several layouts is not a digit at all - so a
     * key check silently does nothing on exactly the machines least likely to be tested.
     * The physical key is what was meant.
     */
    const match = /^Digit([1-8])$/.exec(event.code);
    if (!match) return;

    const index = Number(match[1]) - 1;
    const sceneId = SCENE_IDS[index];
    if (!sceneId) return;

    event.preventDefault();
    host.jumpToScene(sceneId);
    showBadge(container, index, sceneId);
  };

  window.addEventListener('keydown', onKey);
  const strip = buildStrip(host, container);

  return () => {
    window.removeEventListener('keydown', onKey);
    (strip as HTMLElement & { _dispose?: () => void })._dispose?.();
    strip.remove();
    document.getElementById(BADGE_ID)?.remove();
  };
}
