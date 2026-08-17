/**
 * The shared console chrome.
 *
 * Both of OMNISCIENT_'s working screens - the globe it chooses a request from and the
 * Contact View it answers one through - are the same instrument seen in two modes. They
 * were drifting apart: the Contact View became an operator console and the globe stayed a
 * wireframe with bare text on it, and that inconsistency read louder than either screen's
 * own quality, because the player passes through one to reach the other every time.
 *
 * So the frame, the margin readouts and the call controls live here and both screens
 * import them. Anything specific to one screen stays in that screen.
 */
export const CONSOLE_CHROME_ID = 'omniscient-console-chrome';

export const CONSOLE_CHROME_CSS = `
/*
 * The Contact View is a whole operator console, not a chat box floating over a render.
 *
 * The shell is a full-screen frame with a hole in it: the diorama shows through the left,
 * the conversation owns a dedicated column on the right, and the readouts sit in the
 * margins. Nothing overlaps the scene any more, which is what stops the request reading
 * as a UI mockup pasted over somebody's workshop.
 *
 * pointer-events is none on the frame and auto on the controls, so the parts that are
 * only chrome never eat a click meant for the world behind them.
 */
.omni-cv {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: auto 1fr auto;
  font-family: "Courier New", ui-monospace, monospace;
  color: #7fe08a;
  pointer-events: none;
  isolation: isolate;
}
/*
 * Brushed plate rather than a flat fill.
 *
 * A single colour reads as a div; a shallow vertical gradient with a lit top edge reads as
 * a piece of anodised metal with a light source above it, which is what the bar is meant
 * to be. The gradient is only six values wide - any more and it stops being a surface and
 * starts being a background.
 */
.omni-cv__top,
.omni-cv__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 18px;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  background: linear-gradient(#0d1a12, #060d08);
  box-shadow: inset 0 1px 0 #2c5a3b, 0 1px 0 #040906;
  border-bottom: 1px solid #1d3325;
  color: #4f9a5e;
}
.omni-cv__foot {
  border-bottom: none;
  border-top: 1px solid #1d3325;
  background: linear-gradient(#060d08, #0b1710);
  box-shadow: inset 0 -1px 0 #204631, 0 -1px 0 #040906;
  font-size: 10px;
  color: #35603f;
}
.omni-cv__brand { color: #cfe6c4; letter-spacing: 0.28em; }
.omni-cv__net { display: flex; align-items: center; gap: 9px; color: #7fe08a; }
.omni-cv__bars { display: flex; align-items: flex-end; gap: 2px; height: 11px; }
.omni-cv__bars i {
  display: block;
  width: 3px;
  background: #4f9a5e;
}
.omni-cv__bars i:nth-child(1) { height: 30%; }
.omni-cv__bars i:nth-child(2) { height: 55%; }
.omni-cv__bars i:nth-child(3) { height: 78%; }
.omni-cv__bars i:nth-child(4) { height: 100%; background: #7fe08a; }

/* The middle band: scene on the left, conversation on the right. */
.omni-cv__body {
  display: grid;
  grid-template-columns: 1fr min(34vw, 430px);
  gap: 14px;
  padding: 14px 18px;
  min-height: 0;
}
/*
 * The hole in the frame the world shows through, marked as one.
 *
 * Four corner brackets and nothing else. A full border would put a box round somebody's
 * workshop and make it a picture; corners say "this is the extent of what I can see",
 * which is the machine's limit rather than the room's. Same reasoning as the scan sights,
 * one scale up - and the same colour, because they are the same instrument talking.
 *
 * Drawn as eight background gradients rather than as elements, so neither screen has to
 * build DOM for it.
 *
 * Scoped away from the globe, though. The two screens use the same class for different
 * things: on the Contact View __stage is the hole the diorama shows through, and on the
 * globe it is the left readout column - so inheriting this put a viewport frame around
 * three status cards and left two bracket corners floating in the middle of the screen.
 * The globe's own frame goes on .omni-globe__stage, in the globe's own file, which is
 * what this module's header says should happen to anything screen-specific.
 */
.omni-cv:not(.omni-cv--globe) .omni-cv__stage {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 0;
  --bk: 22px;
  --bc: #2f7391;
  background-image:
    linear-gradient(var(--bc), var(--bc)), linear-gradient(var(--bc), var(--bc)),
    linear-gradient(var(--bc), var(--bc)), linear-gradient(var(--bc), var(--bc)),
    linear-gradient(var(--bc), var(--bc)), linear-gradient(var(--bc), var(--bc)),
    linear-gradient(var(--bc), var(--bc)), linear-gradient(var(--bc), var(--bc));
  background-repeat: no-repeat;
  background-size:
    var(--bk) 1px, 1px var(--bk),
    var(--bk) 1px, 1px var(--bk),
    var(--bk) 1px, 1px var(--bk),
    var(--bk) 1px, 1px var(--bk);
  background-position:
    left top, left top,
    right top, right top,
    left bottom, left bottom,
    right bottom, right bottom;
}
/*
 * Inset from the stage edge, so the viewport brackets are not sat on.
 *
 * The cards used to start flush in the corner, which put the top-left bracket behind the
 * CONNECTION STRENGTH plate and left the frame reading as two corners rather than four -
 * an asymmetry that looked like a bug rather than a choice. Twelve pixels is enough for
 * the bracket to clear and reads as the instrument having a bezel.
 */
.omni-cv__readouts {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  width: min(23vw, 260px);
  margin: 13px 0 0 13px;
}
/*
 * Bevelled, and square.
 *
 * These were rounded rectangles with a single hairline border, which is how software has
 * looked since about 2012 and is nothing like the machine this is meant to be. Hardware
 * from the period this game is set in did not draw a 1px outline around a panel - it
 * pressed the panel out of the surface, and you read the shape from where the light
 * catches. Two inset shadows do the whole job: one light on the top-left, one black on the
 * bottom-right, with a dark ring outside to seat it.
 *
 * The radius goes because a bevel and a rounded corner are contradictory claims. A bevel
 * says the panel is a physical plate with a chamfered edge; a 6px radius says it is a
 * rectangle someone softened. Nothing in the reference frames has a rounded corner.
 */
.omni-card {
  width: 100%;
  padding: 9px 11px;
  background: rgba(9, 20, 13, 0.88);
  box-shadow:
    inset 1px 1px 0 #3f7a52,
    inset -1px -1px 0 #040906,
    0 0 0 1px #0b1a11;
  backdrop-filter: blur(2px);
}
.omni-card__label {
  display: block;
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #4f9a5e;
  margin-bottom: 5px;
}
.omni-card__value { display: block; font-size: 12px; color: #cfe6c4; }
.omni-card__sub { display: block; font-size: 10px; color: #6a8f72; margin-top: 3px; }
/*
 * The meter is a channel cut into the plate, with lamps in it.
 *
 * So its bevel runs the other way from the card's: dark on the top-left, light on the
 * bottom-right, which is what a recess looks like under a light from above. The card
 * stands proud and the meter sinks into it, and that one reversal is most of what makes a
 * bevelled interface read as a physical object rather than as a set of boxes.
 *
 * A lit segment gets a highlight along its top edge - the lamp is behind a lens, and the
 * lens catches. Unlit ones do not, so the difference between on and off is a change in
 * material and not only in colour.
 */
.omni-meter { display: flex; gap: 3px; margin-bottom: 5px; }
.omni-meter i {
  display: block;
  flex: 1;
  height: 9px;
  background: #16281c;
  box-shadow: inset 1px 1px 0 #040906, inset -1px -1px 0 #2a5138;
}
.omni-meter i.on {
  background: #4f9a5e;
  box-shadow: inset 1px 1px 0 #040906, inset -1px -1px 0 #2a5138, inset 0 2px 0 #7fc98d;
}
.omni-meter--trust i.on {
  background: #7fe08a;
  box-shadow: inset 1px 1px 0 #040906, inset -1px -1px 0 #2a5138, inset 0 2px 0 #c2f5c9;
}

/* Bottom-left controls, sitting over the scene. */
.omni-cv__actions {
  display: flex;
  gap: 8px;
  margin: 0 0 13px 13px;
  pointer-events: auto;
}
.omni-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 96px;
  padding: 8px 12px;
  font: inherit;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #8fbe93;
  background: rgba(11, 24, 15, 0.9);
  border: 0;
  /* Same plate as the cards, and it travels: pressed swaps the light to the other side,
     which is the one interaction 90s hardware UI always got right. */
  box-shadow:
    inset 1px 1px 0 #3f7a52,
    inset -1px -1px 0 #040906,
    0 0 0 1px #0b1a11;
  cursor: pointer;
}
.omni-action:hover { color: #d8ffb0; box-shadow:
  inset 1px 1px 0 #5fb277, inset -1px -1px 0 #040906, 0 0 0 1px #17402a; }
.omni-action:active {
  color: #d8ffb0;
  box-shadow:
    inset 1px 1px 0 #040906,
    inset -1px -1px 0 #3f7a52,
    0 0 0 1px #0b1a11;
  transform: translate(1px, 1px);
}
.omni-action__glyph { font-size: 15px; line-height: 1; }
.omni-action--end { color: #c2483a; }
.omni-action--end:hover { color: #e8877a; box-shadow:
  inset 1px 1px 0 #8a4438, inset -1px -1px 0 #040906, 0 0 0 1px #3a1c17; }

`;

/** Add the chrome stylesheet once, whichever screen asks for it first. */
export function injectConsoleChrome(): void {
  if (document.getElementById(CONSOLE_CHROME_ID)) return;
  const style = document.createElement('style');
  style.id = CONSOLE_CHROME_ID;
  style.textContent = CONSOLE_CHROME_CSS;
  document.head.appendChild(style);
}
