/** A short Pelagic-terminal handoff masking the camera ownership swap into and out of M4SS. */

const STYLE_ID = 'omniscient-m4ss-handoff-style';

const CSS = `
.m4ss-handoff {
  position: absolute;
  inset: 0;
  z-index: 55;
  display: grid;
  place-items: center;
  overflow: hidden;
  pointer-events: none;
  background:
    repeating-linear-gradient(0deg, rgba(143,224,162,0.025) 0 1px, transparent 1px 4px),
    radial-gradient(circle at 50% 48%, rgba(47,95,143,0.2), transparent 46%),
    #0b0e12;
  opacity: 1;
  transition: opacity 520ms ease;
}
.m4ss-handoff--away { opacity: 0; }
.m4ss-handoff__window {
  width: min(440px, 74vw);
  border: 1px solid #2f5f8f;
  background: rgba(27,35,49,0.96);
  box-shadow: 0 0 0 1px rgba(143,224,162,0.18), 0 18px 60px rgba(0,0,0,0.72);
  transform: scale(0.88);
  opacity: 0;
  transition: transform 460ms cubic-bezier(.16,1,.3,1), opacity 180ms ease;
}
.m4ss-handoff--seat .m4ss-handoff__window { transform: scale(1); opacity: 1; }
.m4ss-handoff__bar {
  display: flex;
  justify-content: space-between;
  padding: 5px 9px;
  color: #fff;
  background: #2f5f8f;
  font: 10px/1.4 "Courier New", monospace;
  letter-spacing: 1.4px;
}
.m4ss-handoff__body {
  padding: 18px 20px 16px;
  color: #dfe7f0;
  font: 11px/1.55 "Courier New", monospace;
  letter-spacing: 1.2px;
}
.m4ss-handoff__status { color: #8fe0a2; }
.m4ss-handoff__track {
  height: 6px;
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid #3a4d6b;
  background: #090c10;
}
.m4ss-handoff__fill {
  width: 100%;
  height: 100%;
  transform-origin: left;
  background: linear-gradient(90deg, #2f5f8f, #8fe0a2);
  animation: m4ss-handoff-fill 760ms cubic-bezier(.2,.7,.2,1) both;
}
@keyframes m4ss-handoff-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
`;

export type M4SSHandoffMode = 'opening' | 'returning';

export function playM4SSHandoff(container: HTMLElement, mode: M4SSHandoffMode): void {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  container.querySelector('.m4ss-handoff')?.remove();

  const root = document.createElement('div');
  root.className = 'm4ss-handoff';
  root.setAttribute('aria-hidden', 'true');

  const windowFrame = document.createElement('div');
  windowFrame.className = 'm4ss-handoff__window';
  const bar = document.createElement('div');
  bar.className = 'm4ss-handoff__bar';
  const station = document.createElement('span');
  station.textContent = 'PELAGIC STATION 9';
  const live = document.createElement('span');
  live.textContent = mode === 'opening' ? 'REMOTE FILE' : 'RECORD SEALED';
  bar.append(station, live);

  const body = document.createElement('div');
  body.className = 'm4ss-handoff__body';
  const file = document.createElement('div');
  file.textContent = 'SPECIMEN_M4SS // CHAMBER FEED 02';
  const status = document.createElement('div');
  status.className = 'm4ss-handoff__status';
  status.textContent =
    mode === 'opening' ? 'NEGOTIATING REMOTE DECODE…' : 'VERIFYING CONTAINMENT RECORD…';
  const track = document.createElement('div');
  track.className = 'm4ss-handoff__track';
  const fill = document.createElement('div');
  fill.className = 'm4ss-handoff__fill';
  track.appendChild(fill);
  body.append(file, status, track);
  windowFrame.append(bar, body);
  root.appendChild(windowFrame);
  container.appendChild(root);

  requestAnimationFrame(() => root.classList.add('m4ss-handoff--seat'));
  window.setTimeout(() => {
    status.textContent = mode === 'opening' ? 'FEED ACQUIRED  //  CONTROL PASSED' : 'FILE CLOSED  //  RETURNING TO OPERATOR';
  }, 520);
  window.setTimeout(() => root.classList.add('m4ss-handoff--away'), 900);
  window.setTimeout(() => root.remove(), 1480);
}
