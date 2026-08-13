/**
 * The wire between the game and a second-screen surface (§222).
 *
 * The whole point of InterventionSurface was that the thing the player types into does not
 * have to be in the same window as the world they are typing about. That only pays off if
 * the transport is swappable, so everything above this line is transport-agnostic: the
 * game sends surface states, the surface sends player messages, and neither knows whether
 * that crossed a process, a network or nothing at all.
 *
 * Deliberately tiny. Two message kinds in one direction, one in the other. A second screen
 * that needs a protocol version negotiation is a second screen that will not ship.
 */

import type { PlayerMessage, SurfaceState } from './surface.js';

/** Game -> surface. */
export interface StateFrame {
  kind: 'state';
  state: SurfaceState;
}

/** Surface -> game. */
export interface MessageFrame {
  kind: 'message';
  message: PlayerMessage;
}

/**
 * Surface -> game, on connect.
 *
 * The phone announces itself so the game can send it the current state immediately rather
 * than leaving it blank until the next thing happens. A player who scans a code mid-
 * conversation should see the conversation, not an empty screen until somebody speaks.
 */
export interface HelloFrame {
  kind: 'hello';
}

export type LinkFrame = StateFrame | MessageFrame | HelloFrame;

/**
 * A duplex channel carrying LinkFrames.
 *
 * Implementations decide what "connected" means and how frames travel. The only contract
 * is that send() reaches the other end and onFrame() hears what the other end sent.
 */
export interface ILinkTransport {
  /** Human-readable, for the pairing UI. */
  readonly description: string;
  /** True once frames can be expected to arrive. */
  readonly connected: boolean;
  send(frame: LinkFrame): void;
  onFrame(handler: (frame: LinkFrame) => void): () => void;
  close(): void;
}
