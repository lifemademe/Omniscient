/**
 * A link between two windows of the same origin, using BroadcastChannel.
 *
 * This is the transport that needs no infrastructure at all, and it exists to answer the
 * §222 question honestly. The unknown in second-screen play was never the UI or the
 * protocol - it was whether a phone can reach the running game, and that is a hosting
 * question with no answer inside this repo.
 *
 * So this proves everything except the network hop: real frames, real surface, real
 * mission, driven from a window that is not the game's. If a reachable transport ever
 * exists, it drops in behind ILinkTransport and nothing above it changes. If one never
 * does, this still works as a second-monitor setup and nothing was wasted.
 *
 * BroadcastChannel is same-origin only, which is exactly the limit being documented.
 */

import type { ILinkTransport, LinkFrame } from './transport.js';

const CHANNEL = 'omniscient-link';

export class BroadcastTransport implements ILinkTransport {
  public readonly description = 'same-device second window';
  private channel: BroadcastChannel | null = null;
  private readonly handlers = new Set<(frame: LinkFrame) => void>();

  public constructor() {
    if (typeof BroadcastChannel === 'undefined') return;

    this.channel = new BroadcastChannel(CHANNEL);
    this.channel.onmessage = (event: MessageEvent<LinkFrame>) => {
      const frame = event.data;
      // Frames arrive from an origin we control, but the surface renders contact names and
      // player text, so anything shaped wrong is dropped rather than trusted. See the
      // Safe UI note in LocalSurface - this is the same rule one layer earlier.
      if (!frame || typeof frame !== 'object' || typeof frame.kind !== 'string') return;
      this.handlers.forEach((handler) => handler(frame));
    };
  }

  public get connected(): boolean {
    return this.channel !== null;
  }

  public send(frame: LinkFrame): void {
    this.channel?.postMessage(frame);
  }

  public onFrame(handler: (frame: LinkFrame) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  public close(): void {
    this.channel?.close();
    this.channel = null;
    this.handlers.clear();
  }
}
