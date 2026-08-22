/**
 * The save system, which is one small JSON blob and two rules.
 *
 * ## Why this exists
 *
 * OMNISCIENT_ is a two-to-four-hour narrative game played in typed conversation, and until
 * this file the only thing in it that survived a refresh was the volume slider. The menu
 * has had a tape deck labelled "Restore from memory" since the day it was built - disabled,
 * with a comment apologising that there was no save system. This is the save system.
 *
 * ## What is saved, and what is deliberately not
 *
 * The whole game state that matters is small, by architecture rather than by luck: the
 * knowledge store (facts, connections, standings), the signal states on the globe, how far
 * the queue has been offered, which signals may be opened, and which M4SS stage the
 * specimen file is on. Everything else - camera, screen, scene, the CRT - is derived from
 * those on the way in, exactly as it is on a fresh boot.
 *
 * Mid-mission state is NOT saved. A save taken halfway through a conversation would need
 * the whole beat graph position, the device state, the contact scene - and restoring into
 * the middle of a conversation is a worse experience than restoring to the machine with
 * the request still waiting. A refresh mid-request costs the attempt, never the progress.
 * The same rule the pit uses.
 *
 * Cooldowns are also not saved: a signal mid-cooldown restores as Waiting. Serialising a
 * deadline means either trusting the wall clock (exploitable by anyone who can set their
 * watch, punishing to anyone who closes the tab for a week) or freezing the countdown
 * (which makes the cooldown a "go away" screen). Forgiveness is cheaper than either.
 *
 * ## The two rules
 *
 * Nothing here throws. Private mode, a sandboxed host, a full quota - none of these is a
 * reason to crash a game that was working; a failed save is a missed convenience, not an
 * error. Same policy as the volume in ConsoleAudio.
 *
 * And nothing here is trusted. `load` validates the version and the shape before handing
 * anything back, because the one guarantee about localStorage is that something else may
 * have written to it.
 */

import { Certainty, KnowledgeDomain } from '../knowledge/KnowledgeStore.js';

import type { Connection, ContactStanding, Fact } from '../knowledge/KnowledgeStore.js';
import type { SignalState } from '../crt/GlobeView.js';

const SAVE_KEY = 'omniscient.save';
/** Bump when the shape changes. A save from another version is ignored, not migrated. */
const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  facts: Fact[];
  connections: Connection[];
  standings: Array<{ contactId: string; standing: ContactStanding }>;
  /** The knowledge store's monotonic sequence counter, so learn order stays stable. */
  sequence: number;
  signals: Array<{ id: string; state: SignalState; hidden: boolean }>;
  /** How far the request queue has been offered. */
  offered: number;
  /** Signal ids the player is allowed to open. */
  openable: string[];
  /** Which M4SS stage the specimen file is on. */
  m4ssStage: number;
  /**
   * The contact whose request the player most recently OPENED. CONTINUE uses it: if that
   * request is still unresolved, restoring drops the player into its contact view rather
   * than onto the globe, because "where was I" is the first question a returning player
   * asks and the globe answers it with seven dots. Null when the last thing played was
   * finished - a finished story has no "where was I".
   */
  lastPlayedContactId?: string | null;
  /**
   * Contact ids in the order their requests were answered.
   *
   * Nothing recorded this before, because nothing needed it: the signals carry a state and
   * the globe only ever asked "is this one resolved". The record strip asks a different
   * question - "what did I do, and when" - and completion order cannot be recovered from a
   * set of flags afterwards.
   *
   * OPTIONAL, and read with a default, so a save written before this existed still loads.
   * Bumping SAVE_VERSION for an additive field would throw away every save in existence to
   * gain a list that starts empty anyway.
   */
  answered?: string[];
}

/**
 * Write the save, and say whether it actually landed.
 *
 * It used to return void and swallow every failure - quota, private mode, no storage at all
 * - on the reasoning that the game keeps playing either way. That is still true and the
 * catch stays, but a silent failure became a lie the moment anything on screen claimed the
 * save had happened. A receipt that cannot be wrong is not a receipt.
 *
 * Read back rather than trusting setItem. A quota failure throws and is caught, but a
 * storage that accepts a write and returns nothing does not - and that is exactly the
 * failure a player would report as "I don't think the game is saving".
 */
export function saveGame(data: Omit<SaveData, 'version'>): boolean {
  try {
    const payload = JSON.stringify({ version: SAVE_VERSION, ...data });
    window.localStorage?.setItem(SAVE_KEY, payload);
    return window.localStorage?.getItem(SAVE_KEY) === payload;
  } catch {
    return false;
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = window.localStorage?.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data?.version !== SAVE_VERSION) return null;
    if (!Array.isArray(data.facts) || !Array.isArray(data.signals)) return null;
    if (typeof data.offered !== 'number' || !Array.isArray(data.openable)) return null;
    // Facts are the deepest structure that later code indexes into; check the fields the
    // knowledge store will actually read rather than trusting the cast.
    for (const fact of data.facts) {
      if (typeof fact?.id !== 'string' || typeof fact?.label !== 'string') return null;
      if (!Object.values(KnowledgeDomain).includes(fact.domain)) return null;
      if (!Object.values(Certainty).includes(fact.certainty)) return null;
    }
    return data;
  } catch {
    return null;
  }
}

/** True if there is something to continue from. Cheap enough to call at menu build. */
export function hasSave(): boolean {
  return loadGame() !== null;
}

/** New game. The cartridge wipes the tape. */
export function clearSave(): void {
  try {
    window.localStorage?.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do - if storage is unreadable the save is unreachable anyway.
  }
}

// -- The M4SS stage, from the other side ---------------------------------------------------

/**
 * M4SSRig reads and writes its stage through these rather than through SaveData, because
 * the two games boot separately - `?game=m4ss` never constructs OmniscientRig - and the
 * one thing they must not do is each own a copy of the other's state. The stage lives in
 * its own key; SaveData carries it only so `clearSave` semantics stay honest (a new game
 * resets the specimen too, via clearM4ssStage below).
 */
const M4SS_KEY = 'omniscient.m4ss.stage';

export function loadM4ssStage(): number {
  try {
    const raw = window.localStorage?.getItem(M4SS_KEY);
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function saveM4ssStage(stage: number): void {
  try {
    window.localStorage?.setItem(M4SS_KEY, String(stage));
  } catch {
    // See saveGame.
  }
}

/**
 * Set the day stage two's portal is reached. This is the flag Keller's desktop reads:
 * the specimen file flips from BREACHED to CONTAINED, which is M4SS closing its own loop
 * inside the fiction - the game the console launched reports back to the console.
 */
const CONTAINED_KEY = 'omniscient.m4ss.contained';

export function saveM4ssContained(): void {
  try {
    window.localStorage?.setItem(CONTAINED_KEY, '1');
  } catch {
    // See saveGame.
  }
}

export function isM4ssContained(): boolean {
  try {
    return window.localStorage?.getItem(CONTAINED_KEY) === '1';
  } catch {
    return false;
  }
}

/** A new game resets the whole specimen record: the stage AND the containment. */
export function clearM4ssStage(): void {
  try {
    window.localStorage?.removeItem(M4SS_KEY);
    window.localStorage?.removeItem(CONTAINED_KEY);
  } catch {
    // See clearSave.
  }
}
