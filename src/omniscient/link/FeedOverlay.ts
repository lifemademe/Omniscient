/**
 * The camera feed, in the Contact View - the machine looking through a device.
 *
 * ## Why it is here and not in the console panel
 *
 * The first build put the ASCII picture inside the pursuit board, a strip a few hundred
 * pixels wide in the right-hand column. It rendered, and it was the wrong surface: the
 * Contact View is the window this game looks at the world through, and a camera on the
 * municipal network is a place the machine can look FROM. Putting the view in a widget
 * beside the conversation says "here is a diagram of a street". Putting it over the stage
 * says "you are on that street now", which is the thing worth building.
 *
 * It also lines the feature up with the tier the wireframe city was always aiming at -
 * wireCity's header calls the third tier "first person, OMNISCIENT inside a system that is
 * connected to it" - and with the resolve mission 08 was written to end on.
 *
 * ## Why it takes the whole stage
 *
 * Opaque, over the diorama. The machine is not observing the district any more, it is
 * looking through one of its cameras, and showing both at once would be two statements of
 * one idea with the weaker one on top. The wireframe comes back the moment the feed closes.
 *
 * ## What this file owns
 *
 * The clock, the paint loop, and the review playback. BoardPanel decides WHICH camera and
 * WHEN, and nothing else - it should not be running a frame timer, and the playback had no
 * business living in a class whose job is drawing option buttons.
 */

import { FEED_W, feedToHtml, renderFeed } from '../art/asciiFeed.js';

import type { HopFailure } from '../mission/pursuit.js';
import type { WireCity } from '../geometry/wireCity.js';

/** One camera in a review: where it looked and what it saw. */
export interface FeedStep {
  cell: { x: number; y: number };
  label: string;
  since: number;
  /** null on the camera that genuinely picked the car up. */
  fails: HopFailure | null;
}

/**
 * What a camera says once its footage has been watched.
 *
 * Each wrong answer is a SENTENCE, not a buzzer - the same discipline pursuit.ts sets out
 * in its header, where every decoy fails for exactly one nameable reason. The reason is
 * already in the data; this is the first place the player gets to hear it.
 */
const VERDICT: Record<HopFailure, string> = {
  behind: 'NOTHING. That is back the way he came.',
  unreachable: 'NOTHING. He could not have covered that ground yet.',
  'off-route': 'NOTHING. He would have had to turn, and nobody saw him turn.',
};

/**
 * How long one camera is held during a review, and what happens inside that window.
 *
 * The car crosses in the middle rather than immediately, because a street that is empty for
 * a beat first is what makes the crossing land - and on a wrong camera that same empty beat
 * IS the answer, arriving as a picture a second before the caption says it in words.
 */
const HOLD = 2.5;
const ENTER = 0.6;
const CROSS = 1.3;

export const FEED_STYLES = `
/*
 * The feed over the stage. A character grid, so monospace, and it must not wrap - a feed
 * that reflows is a feed that has stopped being a picture.
 */
.omni-feed {
  position: absolute;
  inset: 0;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #050a07;
  z-index: 4;
}
.omni-feed--on { display: flex; }
.omni-feed__screen {
  margin: 0;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  /* Set from measurement - see fit(). */
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0;
  white-space: pre;
  color: #2f4a37;
}
.omni-feed__caption {
  padding-top: 10px;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #3f6b4a;
}
/*
 * The two verdicts. Deliberately not red and green - this console has one accent, and a
 * miss reading as an ERROR would say the player did something wrong when what actually
 * happened is that a camera saw an empty street.
 */
.omni-feed__caption--hit { color: #d8ffb0; }
.omni-feed__caption--miss { color: #2f4a37; }
`;

class FeedOverlay {
  private root: HTMLElement | null = null;
  private screen: HTMLElement | null = null;
  private caption: HTMLElement | null = null;

  private city: WireCity | null = null;
  private cell: { x: number; y: number } | null = null;
  private label = '';
  private since = 0;

  private clock = 0;
  private timer: number | null = null;
  /** Last (width, playing) the glyph size was solved for, so it is not re-measured at 8fps. */
  private fitKey = '';

  private play: { steps: FeedStep[]; step: number; t: number; done: (() => void) | null } | null =
    null;

  /**
   * Attach to the Contact View's stage, if there is one on screen.
   *
   * Looked up rather than injected, the same way ScanTargets finds it: the stage belongs to
   * whichever screen is mounted, and a feed that held a reference across a screen change
   * would be drawing into a detached element.
   */
  private mount(): boolean {
    if (this.root?.isConnected === true) return true;
    const stage = document.querySelector('.omni-cv__stage');
    if (!stage) return false;

    const root = document.createElement('div');
    root.className = 'omni-feed';
    const screen = document.createElement('pre');
    screen.className = 'omni-feed__screen';
    const caption = document.createElement('div');
    caption.className = 'omni-feed__caption';
    root.append(screen, caption);
    // Skip. Someone replaying a chase for the fourth time has seen the footage.
    root.addEventListener('mousedown', () => {
      if (this.play) this.finish();
    });
    stage.appendChild(root);

    this.root = root;
    this.screen = screen;
    this.caption = caption;
    this.fitKey = '';
    return true;
  }

  /**
   * Point the feed at a camera and put it on screen.
   *
   * There is no suspect argument and that is deliberate rather than incidental - see
   * asciiFeed's header. Mission 08 is won by narrowing rather than searching, and a feed
   * that showed the car before the player committed would turn three hops of inference into
   * "pick the one with the car in it". The only route by which a car reaches this picture
   * is `review`, which is called after the route has been sent.
   */
  public aim(city: WireCity, step: Omit<FeedStep, 'fails'>): void {
    if (!this.mount()) return;
    this.city = city;
    this.cell = step.cell;
    this.label = step.label;
    this.since = step.since;
    this.root?.classList.add('omni-feed--on');
    this.start();
    this.paint();
  }

  /** Take the feed down and give the diorama back. */
  public hide(): void {
    this.cancel();
    this.stop();
    this.root?.classList.remove('omni-feed--on');
    this.cell = null;
  }

  /**
   * Play a committed route back, camera by camera, then hand control to `done`.
   *
   * Stops on the first camera that saw nothing: that is where he was lost, and continuing
   * past it would be showing footage of a car nobody has eyes on any more.
   */
  public review(city: WireCity, steps: FeedStep[], done: () => void): void {
    if (steps.length === 0 || !this.mount()) {
      done();
      return;
    }
    this.city = city;
    this.play = { steps, step: 0, t: 0, done };
    this.root?.classList.add('omni-feed--on');
    this.start();
    this.paint();
  }

  public get reviewing(): boolean {
    return this.play !== null;
  }

  /**
   * Eight frames a second.
   *
   * Not requestAnimationFrame: this is a surveillance monitor, and a low, slightly uneven
   * frame rate is most of what makes a picture read as a live feed rather than as an
   * illustration. It is also far cheaper than a per-frame raycast of the district would be.
   */
  private start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => {
      this.clock += 0.125;
      if (this.play) this.step(0.125);
      this.paint();
    }, 125);
  }

  private stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private step(dt: number): void {
    const play = this.play;
    if (!play) return;
    play.t += dt;
    if (play.t < HOLD) return;

    const current = play.steps[play.step];
    if (current.fails !== null || play.step + 1 >= play.steps.length) {
      this.finish();
      return;
    }
    play.step += 1;
    play.t = 0;
  }

  /** End the review now - the timer running out, or a click to skip. */
  private finish(): void {
    const play = this.play;
    if (!play) return;
    this.play = null;
    this.fitKey = '';
    const done = play.done;
    play.done = null;
    done?.();
  }

  /**
   * Drop a review without completing it.
   *
   * A screen closing mid-review CANCELS rather than submits: firing the callback would
   * grade a route while the player is looking at something else and move the mission on
   * behind their back. Nothing is lost - the picks survive, and the board re-enables send
   * on the way back in.
   */
  private cancel(): void {
    if (!this.play) return;
    this.play.done = null;
    this.finish();
  }

  /**
   * Size the glyphs to the stage.
   *
   * The feed is a fixed 88-column picture and the stage is not a fixed width - it is a `1fr`
   * column beside the conversation, on whatever window the player has. A hard-coded font
   * size is therefore a guess that is wrong on some layouts, and being wrong here does not
   * degrade gracefully: one column too many and the road's vanishing point is off the edge.
   *
   * The advance width is MEASURED rather than assumed at the usual 0.6em, because the stack
   * falls through ui-monospace, Menlo and Consolas and those do not agree.
   */
  private fit(): void {
    const root = this.root;
    const screen = this.screen;
    if (!root || !screen) return;
    const room = root.clientWidth - 24;
    if (room < 60) return;
    const key = `${String(room)}:${String(this.play !== null)}`;
    if (key === this.fitKey) return;
    this.fitKey = key;

    const base = 10;
    screen.style.fontSize = `${String(base)}px`;
    const advance = screen.scrollWidth / FEED_W;
    if (advance <= 0) return;
    const fit = Math.max(6, Math.min(22, (base * room) / (advance * FEED_W)));
    screen.style.fontSize = `${fit.toFixed(2)}px`;
  }

  private paint(): void {
    const screen = this.screen;
    const caption = this.caption;
    const city = this.city;
    if (!screen || !caption || !city) return;

    if (this.play) {
      const play = this.play;
      const step = play.steps[play.step];
      /*
       * The car's position across the frame, or nothing at all. Only ever non-null on a
       * camera that genuinely picked him up - `fails === null` is the same field the
       * runtime grades against, so the picture cannot disagree with the verdict.
       */
      const during = play.t >= ENTER && play.t <= ENTER + CROSS;
      const suspect = step.fails === null && during ? (play.t - ENTER) / CROSS : null;

      // Authored markup only - every character in it came from asciiFeed, which escapes.
      screen.innerHTML = feedToHtml(
        renderFeed(city, step.cell, {
          clock: this.clock,
          suspect,
          label: step.label,
          since: step.since,
        })
      );
      this.fit();

      const settled = play.t > ENTER + CROSS;
      const verdict = step.fails === null ? 'THERE HE IS.' : VERDICT[step.fails];
      caption.textContent = settled
        ? `${step.label} - ${verdict}`
        : `${step.label} - REVIEWING ${String(play.step + 1)}/${String(play.steps.length)}`;
      caption.className = settled
        ? `omni-feed__caption omni-feed__caption--${step.fails === null ? 'hit' : 'miss'}`
        : 'omni-feed__caption';
      return;
    }

    if (!this.cell) return;
    screen.innerHTML = feedToHtml(
      renderFeed(city, this.cell, { clock: this.clock, label: this.label, since: this.since })
    );
    this.fit();
    caption.textContent = `${this.label} - LIVE`;
    caption.className = 'omni-feed__caption';
  }
}

/** One overlay, because there is one Contact View stage to hang it on. */
export const feedOverlay = new FeedOverlay();
