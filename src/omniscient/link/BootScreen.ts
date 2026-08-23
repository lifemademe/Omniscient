/**
 * The machine coming on.
 *
 * ## What it is
 *
 * Black, a self-test typing itself out, and PRESS ANY KEY. Then the camera pulls back and
 * the boot screen turns out to have been the television on the desk all along.
 *
 * That reveal is the whole reason this exists. The player thinks they are looking at a
 * loading screen; they are looking at a tube in a room. It is this game's entire trick - the
 * console is a thing in a world rather than a UI drawn over one - delivered in eight seconds
 * before a word of dialogue.
 *
 * ## What it is NOT
 *
 * The first proposal was a flight through the ASCII city from mission 08, and it was the
 * wrong idea twice over. It spoils the payoff of the eighth of nine missions - the moment a
 * player discovers they can look THROUGH the network only lands if it arrives late, and a
 * splash screen turns it into "the menu thing". And it misrepresents the game: somebody
 * shown an ASCII cyberpunk city expects one, and this is a warm hand-painted room where you
 * talk to people on a radio.
 *
 * ## Why PRESS ANY KEY is load-bearing rather than decoration
 *
 * A browser will not let an AudioContext make a sound until a user gesture. So the keypress
 * is literally what gives the machine its voice - the mains hum, the carrier, the motif -
 * and the player switching it on is true in the fiction and true in the runtime at the same
 * time. That is a rare alignment and worth spending the screen on.
 *
 * ## What the self-test says
 *
 * Six lines, and two of them are the game. ANTENNA reports no signal and the knowledge base
 * reports empty: the machine starts knowing nothing and hearing nobody, which is exactly
 * where the player starts and exactly what the next four hours are about. Nothing else on
 * this screen has to work as hard.
 */

import {
  accessibleCameraDuration,
  accessibleTextMilliseconds,
} from '../accessibility/preferences.js';

const STYLE_ID = 'omniscient-boot-styles';

const CSS = `
.omni-boot {
  position: absolute;
  inset: 0;
  z-index: 90;
  display: flex;
  flex-direction: column;
  justify-content: center;
  /*
   * The BLOCK is centred; the TEXT is not.
   *
   * This was a flex column with a padding and no cross-axis alignment, so every child sat
   * hard against the left edge of a full-width box - a 320px column of text against two
   * thousand pixels of empty black on a wide window, which reads as a layout come unstuck
   * rather than as a margin somebody chose.
   *
   * Centring the text instead would be the wrong correction. Left-aligned rows with dot
   * leaders are what a terminal looks like; centred ones are what a title card looks like,
   * and this is a terminal. So the column is centred and its contents stay ranged left.
   */
  align-items: center;
  padding: 0 8vw;
  /*
   * Opaque from the first frame it exists.
   *
   * This faded in over a fifth of a second, on the theory that cutting to black over the
   * engine's first frame would be a seam. It was not a seam - it was a window, and what came
   * through it was the main menu, visibly, before the boot screen took over. Reported as the
   * menu flashing before the splash.
   *
   * A fade-in on a screen whose whole job is to be the FIRST thing is a contradiction. The
   * menu is also switched off underneath now, so there is nothing to see through even if
   * something ever makes this translucent again.
   */
  background: #040705;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  color: #7fe08a;
  cursor: default;
}
/*
 * ONE box holding everything, sized to its own contents.
 *
 * This was min(46ch, 84vw) on each child, and that is a trap rather than a typo. The ch
 * unit is the width of a zero in the element's OWN font, so the title - which is more than
 * twice the size of the self-test - got a box more than twice as wide. Centring three boxes
 * of three different widths splays their left edges apart by exactly half the difference,
 * which is what put OMNISCIENT_ a quarter of the way out into the margin while the rows
 * stayed put. Everything was correctly centred; the rule was simply measuring three
 * different things.
 *
 * fit-content on one wrapper cannot have that fault, because there is now one box and it
 * hugs whatever the widest line happens to be. Change any font size in this file and the
 * column follows it. Children are block level and fill the wrapper, so every line - the
 * header, the dotted rows, the title and the prompt - starts at one edge.
 *
 * (No backticks in this comment on purpose - the whole stylesheet is a template literal,
 * and one of them here closes it. Cost a build.)
 */
.omni-boot__column {
  display: flex;
  flex-direction: column;
  width: fit-content;
  max-width: 84vw;
}
.omni-boot__line {
  font-size: clamp(calc(11px + var(--omni-font-boost, 0px)), 1.15vw, calc(17px + var(--omni-font-boost, 0px)));
  letter-spacing: 0.09em;
  line-height: 1.85;
  white-space: pre;
}
/* The two lines that are the game, in the colour the console gives to knowledge. */
.omni-boot__line--told { color: #d8ffb0; }
.omni-boot__title {
  margin-top: 3vh;
  /*
   * Quieter than it was. At 3.4vw against the self-test's 1.15 the title was three times
   * the body on a wide window and shouted over the two lines that actually say something.
   * A machine printing its own name after a self-test is stating a fact, not announcing
   * itself.
   */
  font-size: clamp(calc(20px + var(--omni-font-boost, 0px)), 2.2vw, calc(38px + var(--omni-font-boost, 0px)));
  letter-spacing: 0.24em;
  color: #d8ffb0;
  /*
   * The trailing letter-space is real width, and at 0.24em it is nearly a third of a
   * character. Left unclaimed it makes the title look shifted a few pixels left of the
   * column it is supposed to be flush with - visible precisely because everything else on
   * this screen now agrees.
   */
  margin-right: -0.24em;
}
.omni-boot__prompt {
  margin-top: 3.2vh;
  font-size: clamp(calc(12px + var(--omni-font-boost, 0px)), 1.1vw, calc(16px + var(--omni-font-boost, 0px)));
  letter-spacing: 0.34em;
  color: rgba(127, 224, 138, 0.86);
  /*
   * Slow. A prompt that flashes is a warning; a prompt that breathes is an invitation, and
   * this one is being offered rather than demanded.
   */
  animation: omni-boot-breathe 1.9s ease-in-out infinite;
}
@keyframes omni-boot-breathe {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}
.omni-boot--going { animation: omni-boot-out 0.5s ease-in forwards; }
@keyframes omni-boot-out {
  to { opacity: 0; }
}
`;

/**
 * The self-test, in the order a machine would run one.
 *
 * Written as [label, result] so the dots between them are computed rather than typed - a
 * hand-aligned column drifts the moment anybody edits a word, and this one has to look
 * machine-set to work at all.
 */
const LINES: Array<[string, string, boolean]> = [
  ['CORE', 'OK', false],
  ['MEMORY', '640K OK', false],
  ['CARRIER', 'OK', false],
  ['TAPE', 'READY', false],
  ['ANTENNA', 'NO SIGNAL', true],
  ['KNOWLEDGE BASE', 'EMPTY', true],
];

/**
 * The dot-leader field width: label, dots and result together.
 *
 * A row is `label + ' ' + dots + ' ' + result` and `dots` is WIDTH minus the two ends, so a
 * finished row is WIDTH + 2 characters wide. The rule above them was drawn at WIDTH and
 * therefore stopped two characters short of the column it was ruling - small, and the exact
 * kind of small that reads as "somebody typed this" rather than "a machine printed it",
 * which is the one thing this screen has to be.
 */
const WIDTH = 34;
const RULE = WIDTH + 2;

export interface BootScreen {
  /** Begin from a non-pointer control, such as a gamepad face button. */
  begin: () => void;
  /** Take it down early - endPlay, or a scene change nobody expected. */
  dispose: () => void;
}

/**
 * Put the boot screen up.
 *
 * `onBegin` fires once, on the first press of anything, and is where the caller starts the
 * audio and pulls the camera back. Everything here is skippable from the first frame: a
 * judge playing twenty entries will not sit through a boot sequence twice, and they will
 * certainly replay.
 */
export function showBoot(container: HTMLElement, onBegin: () => void): BootScreen {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const root = document.createElement('div');
  root.className = 'omni-boot';

  // Every line goes in here, not on the root - see the note on .omni-boot__column.
  const column = document.createElement('div');
  column.className = 'omni-boot__column';
  root.appendChild(column);

  const head = document.createElement('div');
  head.className = 'omni-boot__line';
  head.textContent = 'OMNISCIENT OS';
  column.appendChild(head);

  const rule = document.createElement('div');
  rule.className = 'omni-boot__line';
  rule.textContent = '─'.repeat(RULE);
  column.appendChild(rule);

  const rows = LINES.map(([label, , told]) => {
    const row = document.createElement('div');
    row.className = `omni-boot__line${told ? ' omni-boot__line--told' : ''}`;
    row.textContent = '';
    column.appendChild(row);
    return row;
  });

  const title = document.createElement('div');
  title.className = 'omni-boot__title';
  title.textContent = '';
  column.appendChild(title);

  const prompt = document.createElement('div');
  prompt.className = 'omni-boot__prompt';
  prompt.textContent = '';
  column.appendChild(prompt);

  container.appendChild(root);

  const timers: number[] = [];
  const after = (ms: number, run: () => void): void => {
    timers.push(window.setTimeout(run, accessibleTextMilliseconds(ms)));
  };

  /*
   * Each line lands whole rather than typing character by character.
   *
   * A self-test is a machine reporting, not a person writing - it prints a line when it has
   * finished checking a thing. Typing them out letter by letter would be the wrong verb, and
   * six typed lines is also four seconds nobody wants. The TITLE types, because that is the
   * machine naming itself, which is the one line here that is a statement rather than a
   * result.
   */
  let at = 260;
  rows.forEach((row, index) => {
    const [label, result] = LINES[index];
    const dots = Math.max(3, WIDTH - label.length - result.length);
    after(at, () => {
      row.textContent = `${label} ${'.'.repeat(dots)} ${result}`;
    });
    // Irregular, because a real self-test does not check everything in the same time. The
    // antenna and the knowledge base take longest, which is also the truth about them.
    at += index === 4 ? 420 : index === 5 ? 480 : 190;
  });

  const NAME = 'OMNISCIENT_';
  after(at + 240, () => {
    const interval = accessibleTextMilliseconds(55);
    if (interval === 0) {
      title.textContent = NAME;
      return;
    }
    let shown = 0;
    const typing = window.setInterval(() => {
      shown += 1;
      title.textContent = NAME.slice(0, shown);
      if (shown >= NAME.length) window.clearInterval(typing);
    }, interval);
    timers.push(typing);
  });

  after(at + 240 + NAME.length * 55 + 300, () => {
    prompt.textContent = 'PRESS ANY KEY';
  });

  let begun = false;
  const begin = (): void => {
    if (begun) return;
    begun = true;
    detach();
    root.classList.add('omni-boot--going');
    // Removed after the fade rather than on the frame it starts, or the last thing the
    // player sees of the boot screen is it vanishing.
    window.setTimeout(
      () => root.remove(),
      Math.round(accessibleCameraDuration(0.52) * 1000)
    );
    onBegin();
  };

  const onKey = (): void => begin();
  const onPointer = (): void => begin();

  function detach(): void {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', onPointer);
  }

  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onPointer);

  return {
    begin,
    dispose: () => {
      detach();
      for (const timer of timers) window.clearTimeout(timer);
      root.remove();
    },
  };
}
