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
  font-size: calc(12px + var(--omni-font-boost, 0px));
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
  font-size: calc(11px + var(--omni-font-boost, 0px));
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
  grid-template-columns: 1fr min(29vw, 390px);
  gap: 14px;
  padding: 14px 18px;
  min-height: 0;
  transition: grid-template-columns 320ms ease;
}
.omni-cv--device-focus .omni-cv__body {
  grid-template-columns: 1fr min(38vw, 520px);
}
.omni-cv--resolving .omni-cv__body {
  grid-template-columns: 1fr min(31vw, 440px);
}
.omni-cv--connecting .omni-cv__body,
.omni-cv--acquiring .omni-cv__body {
  grid-template-columns: 1fr 0;
}

/*
 * A contact arrives as a place first and an interface second.
 *
 * CONNECTING leaves only the viewport brackets. ACQUIRING brings up the link readouts and
 * machine frame. READY reveals the transcript after the caller has had a clean moment to
 * acknowledge the connection. The motion is deliberately tiny: hardware warming up, not a
 * web page sliding into place.
 */
.omni-cv__top,
.omni-cv__foot,
.omni-cv__readouts,
.omni-cv__actions,
.omni-objective,
.omni-terminal {
  transition: opacity 220ms ease, transform 280ms ease;
}
.omni-cv--connecting .omni-cv__top,
.omni-cv--connecting .omni-cv__foot,
.omni-cv--connecting .omni-cv__readouts,
.omni-cv--connecting .omni-cv__actions,
.omni-cv--connecting .omni-objective,
.omni-cv--connecting .omni-terminal,
.omni-cv--acquiring .omni-cv__actions,
.omni-cv--acquiring .omni-objective,
.omni-cv--acquiring .omni-terminal {
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
}

/*
 * Resolution belongs to the room, not to the dashboard.
 *
 * The transcript and verdict stay at full strength. Everything the player could operate
 * recedes, making the authored final gesture and physical result the largest live things
 * in the frame while also making it impossible to send a stray input after the outcome.
 */
.omni-cv--resolving .omni-cv__readouts,
.omni-cv--resolving .omni-cv__actions,
.omni-cv--resolving .omni-objective,
.omni-cv--resolving .omni-tabs,
.omni-cv--resolving .omni-suggest,
.omni-cv--resolving .omni-terminal__input,
.omni-cv--resolving .omni-terminal__hint {
  opacity: 0.28;
  pointer-events: none;
}
.omni-cv--resolving .omni-terminal {
  box-shadow: 0 0 0 1px rgba(127, 224, 138, 0.08), 0 12px 30px rgba(0, 0, 0, 0.42);
}
/*
 * The left column: readouts at the top, controls at the bottom, air in between.
 *
 * Layout and decoration are deliberately two rules now, and the reason is a bug that cost
 * a screen. They started as one, and when the brackets below were scoped away from the
 * globe the space-between went with them - so the globe's controls stopped being pushed to
 * the floor of the column and rode up under the status cards. The button back to the
 * machine moved several hundred pixels because of a change to a border.
 *
 * A rule that says where things go and a rule that says what they look like should not be
 * able to break each other. Separated, and to stay that way.
 */
.omni-cv__stage {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
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
 * Scoped away from the globe. The two screens use the same class for different things: on
 * the Contact View __stage is the hole the diorama shows through, and on the globe it is
 * the left readout column - so inheriting this put a viewport frame around three status
 * cards and left two bracket corners floating in the middle of the screen. The globe's own
 * frame goes on .omni-globe__stage, in the globe's own file, which is what this module's
 * header says should happen to anything screen-specific.
 */
.omni-cv:not(.omni-cv--globe) .omni-cv__stage {
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
/*
 * Arriving.
 *
 * Nothing in this console ever staggered - every panel, card and line was present and
 * complete on the first frame it existed. That is what made connecting to somebody feel
 * like a cut rather than a connection: a link that establishes instantly is not a link, it
 * is a screenshot.
 *
 * One animation, and the ORDER is authored by whoever sets the delay. It is deliberately
 * short and deliberately does not move much - 4px and a fade. A console assembling itself
 * with any real motion in it reads as a website, and this is meant to be a machine coming
 * up rather than a page loading.
 */
/*
 * Leaving, which is the arrival run backwards and faster.
 *
 * Faster because a departure that lingers is a hesitation, and this machine does not
 * hesitate - it loses a line. Staggered in the same order the cards arrived, so the
 * CONNECTION STRENGTH card is first out as well as first in: it is the one that is about
 * the link, and the link is the thing that just went.
 *
 * The stage - the room and whoever is in it - is deliberately absent from this. It is left
 * standing while everything the console drew over it goes.
 */
.omni-cv--leaving .omni-cv__readouts > *,
.omni-cv--leaving .omni-cv__actions,
.omni-cv--leaving .omni-objective,
.omni-cv--leaving .omni-board,
.omni-cv--leaving .omni-cv__top {
  animation: omni-leave 220ms ease-in forwards;
  pointer-events: none;
}
.omni-cv--leaving .omni-cv__readouts > *:nth-child(2) { animation-delay: 60ms; }
.omni-cv--leaving .omni-cv__readouts > *:nth-child(3) { animation-delay: 120ms; }
.omni-cv--leaving .omni-cv__actions { animation-delay: 90ms; }
.omni-cv--leaving .omni-cv__top { animation-delay: 150ms; }
@keyframes omni-leave {
  to { opacity: 0; transform: translateY(3px); }
}
@keyframes omni-arrive {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
.omni-arrive {
  opacity: 0;
  animation: omni-arrive 260ms ease-out forwards;
}
.omni-cv__readouts {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  width: min(21vw, 248px);
  margin: 13px 0 0 13px;
  transition: width 280ms ease, opacity 220ms ease, transform 280ms ease;
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
  font-size: calc(10px + var(--omni-font-boost, 0px));
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #4f9a5e;
  margin-bottom: 5px;
}
.omni-card__value { display: block; font-size: calc(13px + var(--omni-font-boost, 0px)); color: #cfe6c4; }
.omni-card__sub { display: block; font-size: calc(11px + var(--omni-font-boost, 0px)); color: #6a8f72; margin-top: 3px; }

/* Telemetry teaches itself at full size, then gets out of the room's way. */
.omni-cv--compact .omni-cv__readouts {
  width: min(17vw, 196px);
  gap: 5px;
}
.omni-cv--compact .omni-card {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  column-gap: 8px;
  padding: 6px 8px;
}
.omni-cv--compact .omni-card__label { margin: 0; font-size: calc(9px + var(--omni-font-boost, 0px)); }
.omni-cv--compact .omni-card__value { font-size: calc(11px + var(--omni-font-boost, 0px)); }
.omni-cv--compact .omni-meter,
.omni-cv--compact .omni-card__sub { display: none; }
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
/*
 * A meter that is telling you something is wrong.
 *
 * Added for the warehouse's integrity seals, and deliberately the only place red enters the
 * margin readouts. The game reserves red for security and anomaly states; a permanently
 * amber status banner - which is what Warehouse 07 shipped with - spends that meaning on a
 * number that is usually fine, so by the time something IS wrong the colour has nothing
 * left to say.
 */
.omni-meter--warn i.on {
  background: #b8564b;
  box-shadow: inset 1px 1px 0 #1a0605, inset -1px -1px 0 #6d2f28, inset 0 2px 0 #ff897b;
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
  font-size: calc(10px + var(--omni-font-boost, 0px));
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
.omni-action:focus-visible {
  outline: 2px solid #d8ffb0;
  outline-offset: 3px;
}
.omni-action__glyph { font-size: calc(15px + var(--omni-font-boost, 0px)); line-height: 1; }
.omni-action--end { color: #c2483a; }
.omni-action--end:hover { color: #e8877a; box-shadow:
  inset 1px 1px 0 #8a4438, inset -1px -1px 0 #040906, 0 0 0 1px #3a1c17; }


/*
 * A locked exit.
 *
 * Dimmed and struck through rather than hidden: the player has to see that the way out
 * still exists and is temporarily closed, or the console looks like it has lost a control.
 * pointer-events stays ON so the click still lands and still gets an answer in the log - a
 * button that swallows the press teaches nothing.
 */
.omni-exit--locked {
  opacity: 0.4;
  cursor: not-allowed;
  position: relative;
}
.omni-exit--locked::after {
  content: '';
  position: absolute;
  left: 14%;
  right: 14%;
  top: 52%;
  height: 1px;
  background: currentColor;
  opacity: 0.75;
  pointer-events: none;
}

/*
 * The right-hand column.
 *
 * A bare grid cell - the frame decides how wide it is and the screen decides what goes in
 * it. Its own rule rather than nothing at all, so a panel that forgets to set a height
 * cannot stretch the body grid.
 */
.omni-cv__column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.omni-objective {
  display: flex;
  gap: 12px;
  align-items: baseline;
  margin: 14px 18px 0;
  padding: 9px 14px;
  border: 1px solid #2b5c39;
  border-left: 3px solid #7fe08a;
  background: linear-gradient(90deg, rgba(30, 74, 44, 0.55), rgba(13, 28, 20, 0.35));
  box-shadow: inset 0 0 22px rgba(0, 0, 0, 0.45);
}
.omni-objective[hidden] { display: none; }
.omni-objective__text {
  color: #d8ffb0;
  font-size: calc(15px + var(--omni-font-boost, 0px));
  line-height: 1.35;
  letter-spacing: 0.02em;
}
.omni-objective__tag {
  flex: none;
  color: #5f9c6c;
  font-size: calc(11px + var(--omni-font-boost, 0px));
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
`;

/** Add the chrome stylesheet once, whichever screen asks for it first. */
export function injectConsoleChrome(): void {
  if (document.getElementById(CONSOLE_CHROME_ID)) return;
  const style = document.createElement('style');
  style.id = CONSOLE_CHROME_ID;
  style.textContent = CONSOLE_CHROME_CSS;
  document.head.appendChild(style);
}

/**
 * A margin readout: label, eight-segment meter, value, and a lowercase line under it.
 *
 * Extracted because it existed twice, character for character, in `LocalSurface` and
 * `GlobeScreen` - and the warehouse was about to become the third. This file's own header
 * already says the margin readouts belong here; only the CSS had made the trip.
 *
 * The duplication was not harmless. Two identical private methods are two places a segment
 * count or a class name can change independently, and the whole reason this module exists is
 * that the globe and the Contact View drifted apart while nobody was looking at both at once.
 */
export interface ReadoutCard {
  card: HTMLDivElement;
  meter: HTMLDivElement;
  value: HTMLSpanElement;
  sub: HTMLSpanElement;
}

export function buildReadoutCard(label: string): ReadoutCard {
  const card = document.createElement('div');
  card.className = 'omni-card';

  const caption = document.createElement('span');
  caption.className = 'omni-card__label';
  caption.textContent = label;

  const meter = document.createElement('div');
  meter.className = 'omni-meter';
  for (let i = 0; i < 8; i++) meter.appendChild(document.createElement('i'));

  const value = document.createElement('span');
  value.className = 'omni-card__value';

  const sub = document.createElement('span');
  sub.className = 'omni-card__sub';

  card.append(caption, meter, value, sub);
  return { card, meter, value, sub };
}

/** Light the first `filled` segments of a meter and clear the rest. */
export function fillMeter(meter: HTMLDivElement, filled: number, extraClass = ''): void {
  meter.className = `omni-meter${extraClass ? ` ${extraClass}` : ''}`;
  const segments = meter.children;
  for (let i = 0; i < segments.length; i++) {
    segments[i].className = i < filled ? 'on' : '';
  }
}

/**
 * A console control - a glyph and a word.
 *
 * `mousedown` rather than `click`, with both `preventDefault` and `stopPropagation`, because
 * these sit over a canvas that is picking. A press that reaches the world behind the button
 * is a call ended and a request opened on the same click.
 */
export function buildAction(
  glyph: string,
  label: string,
  onPress: () => void,
  modifier = ''
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `omni-action${modifier ? ` ${modifier}` : ''}`;

  const icon = document.createElement('span');
  icon.className = 'omni-action__glyph';
  icon.textContent = glyph;

  const text = document.createElement('span');
  text.textContent = label;

  button.append(icon, text);
  button.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onPress();
  });
  return button;
}

export interface ConsoleFrame {
  /** The full-screen shell. Append it to the game container. */
  shell: HTMLDivElement;
  /** The hole the world shows through. Anything over the scene goes in here. */
  stage: HTMLDivElement;
  /** Top of the stage column: the margin cards. */
  readouts: HTMLDivElement;
  /** Foot of the stage column: the call controls. */
  actions: HTMLDivElement;
  /** The right-hand column, handed back empty for the caller to fill. */
  column: HTMLDivElement;
  /** The plate above both panels. Write to it through `setObjective`. */
  objective: HTMLDivElement;
  setObjective: (tag: string, text: string) => void;
}

/**
 * The whole console frame, minus whatever fills the right-hand column.
 *
 * ## Why this exists
 *
 * Warehouse 07 arrived with a parallel `warehouse-hud` vocabulary: its own top strip, its own
 * footer saying almost exactly what this one says in different words, a briefing card where
 * the readouts go, and four keyboard-hint buttons stacked down the left over the scene. It
 * used the right colours and none of the right grammar, so it read as a different game
 * wearing this one's palette - which is precisely the drift the note at the top of this file
 * was written about, happening again one folder over.
 *
 * The frame is not decoration. It is the argument that OMNISCIENT_ is ONE instrument looking
 * at different places: same bar, same margins, same footer, and a hole in the middle where
 * this time there is a warehouse instead of a workshop. A screen that rebuilds the frame is
 * a screen saying it is somewhere else.
 *
 * ## What it deliberately does not do
 *
 * It does not build the right-hand column. The Contact View puts a transcript there and the
 * warehouse an operations panel, and below the class name those have nothing in common.
 *
 * `LocalSurface` still builds its own copy of this inline. It was left alone in the pass that
 * added this: its shell is threaded through connection-state classes, the objective plate and
 * an END CALL reference in ways that want their own change, and a refactor that breaks the
 * main Contact View to tidy the bonus one has the priorities backwards. Switching it over is
 * the obvious next tidy-up.
 */
export function buildConsoleFrame(options: { brand: string; network: string }): ConsoleFrame {
  injectConsoleChrome();

  const shell = document.createElement('div');
  shell.className = 'omni-cv';

  const top = document.createElement('div');
  top.className = 'omni-cv__top';
  const brand = document.createElement('span');
  brand.className = 'omni-cv__brand';
  brand.textContent = options.brand;
  const net = document.createElement('span');
  net.className = 'omni-cv__net';
  const bars = document.createElement('span');
  bars.className = 'omni-cv__bars';
  for (let i = 0; i < 4; i++) bars.appendChild(document.createElement('i'));
  const netName = document.createElement('span');
  netName.textContent = options.network;
  net.append(bars, netName);
  const secure = document.createElement('span');
  secure.textContent = 'Secure link';
  top.append(brand, net, secure);

  /*
   * Sentence case in the markup, capitals from the stylesheet.
   *
   * The chrome's `text-transform: uppercase` carries 0.16em of letter-spacing with it, so a
   * string typed in capitals renders at a different rhythm from one the CSS raised. The
   * warehouse HUD typed every one of its labels in capitals, and that is one of the reasons
   * it did not sit right beside the rest of the game even where the colours already matched.
   */
  const objective = document.createElement('div');
  objective.className = 'omni-objective';
  objective.hidden = true;
  const objectiveTag = document.createElement('span');
  objectiveTag.className = 'omni-objective__tag';
  const objectiveText = document.createElement('span');
  objectiveText.className = 'omni-objective__text';
  objective.append(objectiveTag, objectiveText);

  const body = document.createElement('div');
  body.className = 'omni-cv__body';

  const stage = document.createElement('div');
  stage.className = 'omni-cv__stage';
  const readouts = document.createElement('div');
  readouts.className = 'omni-cv__readouts';
  const actions = document.createElement('div');
  actions.className = 'omni-cv__actions';
  stage.append(readouts, actions);

  const column = document.createElement('div');
  column.className = 'omni-cv__column';

  body.append(stage, column);

  const foot = document.createElement('div');
  foot.className = 'omni-cv__foot';
  const version = document.createElement('span');
  version.textContent = 'Omniscient OS';
  const notice = document.createElement('span');
  notice.textContent = 'All handling decisions are monitored and recorded.';
  const corp = document.createElement('span');
  corp.textContent = 'Omniscient';
  foot.append(version, notice, corp);

  shell.append(top, objective, body, foot);

  return {
    shell,
    stage,
    readouts,
    actions,
    column,
    objective,
    setObjective: (tag, text) => {
      objectiveTag.textContent = tag;
      objectiveText.textContent = text;
      objective.hidden = !text;
    },
  };
}
