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
/* One width for every row, so the column has an edge rather than a ragged left margin. */
.omni-boot > * { width: min(46ch, 84vw); }
.omni-boot__line {
  font-size: clamp(11px, 1.15vw, 17px);
  letter-spacing: 0.09em;
  line-height: 1.85;
  white-space: pre;
}
/* The two lines that are the game, in the colour the console gives to knowledge. */
.omni-boot__line--told { color: #d8ffb0; }
.omni-boot__title {
  margin-top: 2.2vh;
  /*
   * Quieter than it was. At 3.4vw against the self-test's 1.15 the title was three times
   * the body on a wide window and shouted over the two lines that actually say something.
   * A machine printing its own name after a self-test is stating a fact, not announcing
   * itself.
   */
  font-size: clamp(20px, 2.2vw, 38px);
  letter-spacing: 0.24em;
  color: #d8ffb0;
}
.omni-boot__prompt {
  margin-top: 3.2vh;
  font-size: clamp(10px, 1vw, 15px);
  letter-spacing: 0.34em;
  color: rgba(127, 224, 138, 0.72);
  /*
   * Slow. A prompt that flashes is a warning; a prompt that breathes is an invitation, and
   * this one is being offered rather than demanded.
   */
  animation: omni-boot-breathe 1.9s ease-in-out infinite;
}
@keyframes omni-boot-breathe {
  0%, 100% { opacity: 0.28; }
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

const WIDTH = 34;

export interface BootScreen {
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

  const head = document.createElement('div');
  head.className = 'omni-boot__line';
  head.textContent = 'OMNISCIENT OS';
  root.appendChild(head);

  const rule = document.createElement('div');
  rule.className = 'omni-boot__line';
  rule.textContent = '─'.repeat(WIDTH);
  root.appendChild(rule);

  const rows = LINES.map(([label, , told]) => {
    const row = document.createElement('div');
    row.className = `omni-boot__line${told ? ' omni-boot__line--told' : ''}`;
    row.textContent = '';
    root.appendChild(row);
    return row;
  });

  const title = document.createElement('div');
  title.className = 'omni-boot__title';
  title.textContent = '';
  root.appendChild(title);

  const prompt = document.createElement('div');
  prompt.className = 'omni-boot__prompt';
  prompt.textContent = '';
  root.appendChild(prompt);

  container.appendChild(root);

  const timers: number[] = [];
  const after = (ms: number, run: () => void): void => {
    timers.push(window.setTimeout(run, ms));
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
    let shown = 0;
    const typing = window.setInterval(() => {
      shown += 1;
      title.textContent = NAME.slice(0, shown);
      if (shown >= NAME.length) window.clearInterval(typing);
    }, 55);
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
    window.setTimeout(() => root.remove(), 520);
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
    dispose: () => {
      detach();
      for (const timer of timers) window.clearTimeout(timer);
      root.remove();
    },
  };
}
