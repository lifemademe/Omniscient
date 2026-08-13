/**
 * Choosing the next request.
 *
 * §99: the globe is not a static level-select, it visualises human need. §52 asks it to
 * keep teasing - after one request resolves, more appear than can be answered, and not
 * all of them are explained.
 *
 * The board lists what is waiting and takes a typed selection, matched loosely against
 * the signal's location and label so the player can type what they see.
 */

import { normalise } from '../mission/intent.js';

import type { Signal } from '../crt/GlobeView.js';
import type { InterventionSurface, TranscriptEntry } from '../link/surface.js';

export class SignalBoard {
  private transcript: TranscriptEntry[] = [];

  constructor(
    private readonly surface: InterventionSurface,
    private readonly onSelect: (signalId: string) => void
  ) {}

  /** Show what is waiting. Openable signals are listed; the rest are atmosphere. */
  public present(signals: Signal[], openable: ReadonlySet<string>): void {
    this.transcript = [
      { source: 'system', name: 'OMNISCIENT_', body: 'earth network - signals waiting' },
    ];

    for (const signal of signals) {
      if (!openable.has(signal.id)) continue;
      this.transcript.push({ source: 'system', name: 'OMNISCIENT_', body: `  ${signal.label}` });
    }

    this.transcript.push({
      source: 'system',
      name: 'OMNISCIENT_',
      body: 'name a location to open it',
    });

    this.surface.present({
      mode: 'chat',
      contactName: '',
      transcript: this.transcript,
      awaitingInput: true,
      hint: 'choose a signal',
    });
  }

  /**
   * Try to resolve typed text to an openable signal.
   *
   * Matches on any word of four or more characters drawn from the signal's label, so
   * "portu", "vech", "harbour" or "beacon" all work. Short words are ignored to stop
   * "the" matching everything.
   */
  public handleText(text: string, signals: Signal[], openable: ReadonlySet<string>): boolean {
    const typed = normalise(text);

    for (const signal of signals) {
      if (!openable.has(signal.id)) continue;

      const words = normalise(signal.label)
        .split(' ')
        .filter((word) => word.length >= 4);

      if (words.some((word) => typed.includes(` ${word} `))) {
        this.onSelect(signal.id);
        return true;
      }
    }

    this.transcript.push({ source: 'omniscient', name: 'OMNISCIENT_', body: text });
    this.transcript.push({
      source: 'system',
      name: 'OMNISCIENT_',
      body: 'no signal by that name. name a location from the list.',
    });
    this.surface.present({
      mode: 'chat',
      contactName: '',
      transcript: this.transcript,
      awaitingInput: true,
      hint: 'choose a signal',
    });
    return false;
  }
}
