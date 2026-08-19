/**
 * The playable shell: input, camera, and drawing the slime.
 *
 * Deliberately thin. Everything that decides anything lives in sim.mjs, so that what is
 * measured headlessly and what is played here cannot drift apart - the whole reason the
 * simulation has no canvas in it.
 *
 * Greybox art on purpose. The question today is whether reaching feels good, and a pretty
 * slime would only make that harder to judge honestly.
 */

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
const level = freshLevel();
const state = makeState(level, 45);

const keys = new Set();
let anchor = null;
let splitHold = 0;
let recall = false;
let message = '';
let messageFor = 0;

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyQ') recall = true;
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyQ') recall = false;
  if (e.code === 'Space') {
    // Release: hand over however much the bar had filled.
    const shed = split(state, splitHold);
    if (shed > 0) say(`split off ${shed}`);
    splitHold = 0;
  }
});

canvas.addEventListener('mousedown', (e) => {
  const r = canvas.getBoundingClientRect();
  const mx = ((e.clientX - r.left) / r.width) * canvas.width;
  const my = ((e.clientY - r.top) / r.height) * canvas.height;
  // Nearest growth point within a generous radius - this is a feel test, not a mouse test.
  let best = null;
  let bestD = 60;
  for (const a of level.anchors) {
    const d = Math.hypot(a.x - mx, a.y - my);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  anchor = best;
});
addEventListener('mouseup', () => {
  anchor = null;
});

function say(text) {
  message = text;
  messageFor = 2;
}

function bodyBounds() {
  const mine = state.particles.filter((p) => state.owned.has(p.id));
  if (mine.length === 0) return { x: level.start.x, y: level.start.y };
  return centroid(mine);
}

// -- drawing -----------------------------------------------------------------------------

function drawBlob(list, fill, edge) {
  if (list.length === 0) return;
  // Two passes: a fat dark pass for the silhouette, then the fill inside it. Overlapping
  // circles of one colour read as a single body, which is all a greybox needs.
  ctx.fillStyle = edge;
  for (const p of list) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, TUNING.rest * 0.78, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = fill;
  for (const p of list) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, TUNING.rest * 0.58, 0, Math.PI * 2);
    ctx.fill();
  }
}

function draw() {
  ctx.fillStyle = '#171226';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#2c2a3f';
  for (const t of level.tiles) ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.fillStyle = '#3d5a3a';
  for (const t of level.tiles) ctx.fillRect(t.x, t.y, t.w, 5);

  for (const f of level.food) {
    if (f.eaten) continue;
    ctx.fillStyle = '#e8c15a';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 4 + f.mass * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  const mine = state.particles.filter((p) => state.owned.has(p.id));
  const home = bodyBounds();

  /*
   * Growth points, coloured by whether the body could actually get there.
   *
   * This is the one piece of help the greybox gives, and it is here to make the TEST work:
   * a player who cannot see what is in range cannot tell a mechanic from a bug in the two
   * minutes they will spend with this.
   */
  for (const a of level.anchors) {
    const d = Math.hypot(a.x - home.x, a.y - home.y);
    const within = d <= mine.length * TUNING.reachPerMass;
    ctx.strokeStyle = a === anchor ? '#ffffff' : within ? '#7fe08a' : '#7a4a58';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }

  // the tendril, drawn from the body to wherever it has got to
  if (state.tip && !state.attached) {
    ctx.strokeStyle = state.strain > 0 ? '#d1614a' : '#8fd6e8';
    ctx.lineWidth = Math.max(2, 10 - state.tendril / 40);
    ctx.beginPath();
    ctx.moveTo(home.x, home.y);
    ctx.lineTo(state.tip.x, state.tip.y);
    ctx.stroke();
  }

  drawBlob(
    state.particles.filter((p) => !state.owned.has(p.id)),
    '#5c6b7a',
    '#2b3540'
  );
  drawBlob(mine, '#8fe3c2', '#2f6b57');

  // -- readouts --------------------------------------------------------------------------
  ctx.font = '15px "Courier New", monospace';
  ctx.fillStyle = '#cfe9d2';
  ctx.fillText(`MASS ${mine.length}`, 16, 26);
  ctx.fillStyle = '#8fd6e8';
  ctx.fillText(`REACH ${Math.round(mine.length * TUNING.reachPerMass)}px`, 16, 46);

  const loose = state.particles.length - mine.length;
  if (loose > 0) {
    ctx.fillStyle = '#d1a04a';
    ctx.fillText(`LEFT BEHIND ${loose}   (Q to call it back)`, 16, 66);
  }

  if (splitHold > 0) {
    const w = 220;
    ctx.strokeStyle = '#cfe9d2';
    ctx.strokeRect(16, 84, w, 14);
    ctx.fillStyle = '#e8c15a';
    ctx.fillRect(18, 86, (w - 4) * splitHold, 10);
    ctx.fillStyle = '#cfe9d2';
    ctx.fillText(`SPLIT ${Math.round(splitHold * 100)}%`, 16 + w + 12, 96);
  }

  if (messageFor > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillText(message, 16, canvas.height - 46);
  }

  ctx.fillStyle = 'rgba(207,233,210,0.5)';
  ctx.fillText('A / D move    LMB a growth point to reach    hold SPACE to split    Q recall', 16, canvas.height - 20);
}

// -- loop ---------------------------------------------------------------------------------

let last = performance.now();
let carry = 0;

function frame(now) {
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  carry += elapsed;
  if (messageFor > 0) messageFor -= elapsed;

  if (keys.has('Space')) splitHold = Math.min(1, splitHold + elapsed * 0.8);

  const move = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);

  const before = state.snapped ?? 0;
  // Fixed step, the same one verify.mjs uses, so what is played is what was measured.
  while (carry >= TUNING.dt) {
    step(state, { move, anchor, recall });
    carry -= TUNING.dt;
  }
  if ((state.snapped ?? 0) > before) say(`TOO FAR - lost ${(state.snapped ?? 0) - before}`);

  if (recall) absorbTouching(state);

  draw();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
