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
  background: linear-gradient(#060d08, #060d08);
  border-bottom: 1px solid #1d3325;
  color: #4f9a5e;
}
.omni-cv__foot {
  border-bottom: none;
  border-top: 1px solid #1d3325;
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
.omni-cv__stage {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 0;
}
.omni-cv__readouts {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  width: min(23vw, 260px);
}
.omni-card {
  width: 100%;
  padding: 9px 11px;
  background: rgba(6, 14, 9, 0.82);
  border: 1px solid #23422c;
  border-radius: 6px;
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
.omni-meter { display: flex; gap: 3px; margin-bottom: 5px; }
.omni-meter i {
  display: block;
  flex: 1;
  height: 9px;
  background: #1d3325;
  border-radius: 1px;
}
.omni-meter i.on { background: #4f9a5e; }
.omni-meter--trust i.on { background: #7fe08a; }

/* Bottom-left controls, sitting over the scene. */
.omni-cv__actions {
  display: flex;
  gap: 8px;
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
  background: rgba(6, 14, 9, 0.86);
  border: 1px solid #23422c;
  border-radius: 6px;
  cursor: pointer;
}
.omni-action:hover { border-color: #4f9a5e; color: #d8ffb0; }
.omni-action__glyph { font-size: 15px; line-height: 1; }
.omni-action--end { color: #c2483a; border-color: #4d2a25; }
.omni-action--end:hover { border-color: #c2483a; color: #e8877a; }

`;

/** Add the chrome stylesheet once, whichever screen asks for it first. */
export function injectConsoleChrome(): void {
  if (document.getElementById(CONSOLE_CHROME_ID)) return;
  const style = document.createElement('style');
  style.id = CONSOLE_CHROME_ID;
  style.textContent = CONSOLE_CHROME_CSS;
  document.head.appendChild(style);
}
