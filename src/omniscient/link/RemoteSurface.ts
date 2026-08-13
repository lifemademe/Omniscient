/**
 * The game's end of a second-screen link (§222).
 *
 * Implements exactly the same InterventionSurface the on-screen panel does, so the session
 * cannot tell the difference: it presents state and receives player messages, and whether
 * those crossed a window, a network or nothing is not its problem. That separation was
 * designed in from the start; this is the thing that proves it was worth it.
 *
 * Pairs rather than replaces. The local panel keeps running, because a second screen that
 * disconnects mid-request must not take the request with it - and because the desktop
 * still has to show the transcript to anybody watching over the player's shoulder.
 */

import type { InterventionSurface, PlayerMessage, SurfaceState } from './surface.js';
import type { ILinkTransport } from './transport.js';

export class RemoteSurface implements InterventionSurface {
  public readonly kind = 'remote' as const;
  private readonly handlers = new Set<(message: PlayerMessage) => void>();
  private unsubscribe: (() => void) | null = null;
  /** The last state sent, replayed to a surface that joins mid-conversation. */
  private latest: SurfaceState | null = null;

  public constructor(private readonly transport: ILinkTransport) {}

  public get connected(): boolean {
    return this.transport.connected;
  }

  public async attach(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = this.transport.onFrame((frame) => {
      if (frame.kind === 'message') {
        this.handlers.forEach((handler) => handler(frame.message));
        return;
      }
      // A surface that arrives mid-request gets the conversation so far rather than a
      // blank screen until somebody next speaks.
      if (frame.kind === 'hello' && this.latest) {
        this.transport.send({ kind: 'state', state: this.latest });
      }
    });
  }

  public detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.handlers.clear();
  }

  public present(state: SurfaceState): void {
    this.latest = state;
    this.transport.send({ kind: 'state', state });
  }

  public onMessage(handler: (message: PlayerMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
