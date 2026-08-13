/**
 * The first ten seconds.
 *
 * Gauntlet §7 specifies this beat by beat, and §196 requires the opening to already
 * demonstrate the final target rather than saving polish for later. It is also the part
 * of the build most likely to decide the entry: a judge who bounces here never reaches
 * the callback.
 *
 * The sequence is deliberately quiet. §168: use silence to make the first signal matter.
 * Nothing here asks for input - it plays, and then a human needs something.
 */

import type { InterventionSurface, TranscriptEntry } from '../link/surface.js';

interface BootStep {
  /** Seconds to wait before this line appears. */
  delay: number;
  entry: TranscriptEntry;
}

const SYSTEM = (body: string): TranscriptEntry => ({
  source: 'system',
  name: 'OMNISCIENT_',
  body,
});

/**
 * §7's opening, with the population line as the last beat: the player has just answered
 * one person, and then learns how many more there are.
 */
const STEPS: BootStep[] = [
  { delay: 0.8, entry: SYSTEM('OMNISCIENT_') },
  { delay: 1.4, entry: SYSTEM('knowledge network initializing') },
  { delay: 1.2, entry: SYSTEM('circuit integrity ......... nominal') },
  { delay: 0.7, entry: SYSTEM('memory ..................... empty') },
  { delay: 1.1, entry: SYSTEM('earth network .............. listening') },
  { delay: 1.8, entry: SYSTEM('1 human request detected') },
];

export class BootSequence {
  private index = 0;
  private elapsed = 0;
  private finished = false;
  private readonly transcript: TranscriptEntry[] = [];

  constructor(
    private readonly surface: InterventionSurface,
    private readonly onComplete: () => void
  ) {}

  public get isFinished(): boolean {
    return this.finished;
  }

  /** Present the empty terminal so the machine reads as awake but idle. */
  public start(): void {
    this.present();
  }

  public update(deltaTime: number): void {
    if (this.finished) return;

    this.elapsed += deltaTime;

    const step = STEPS[this.index];
    if (!step || this.elapsed < step.delay) return;

    this.elapsed = 0;
    this.index += 1;
    this.transcript.push(step.entry);
    this.present();

    if (this.index >= STEPS.length) {
      this.finished = true;
      this.onComplete();
    }
  }

  private present(): void {
    this.surface.present({
      mode: 'chat',
      contactName: '',
      transcript: this.transcript,
      // Nothing to type yet. The input stays dead until a person is on the line.
      awaitingInput: false,
      hint: this.finished ? 'incoming' : 'booting',
    });
  }
}
