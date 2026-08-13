/**
 * One surface made of several.
 *
 * The session owns a single InterventionSurface, and second-screen play does not change
 * that: it changes how many places that surface appears. Everything presented goes to all
 * members, and a message from any member is a message from the player.
 *
 * Pairing ADDS a screen rather than moving one. If the phone is the only surface then
 * losing it mid-request strands the player inside a conversation with no way to answer -
 * and the desktop still needs to show the transcript to anyone watching, which for a jam
 * being judged over somebody's shoulder is most of the point.
 */

import type { InterventionSurface, PlayerMessage, SurfaceState } from './surface.js';

export class SurfaceGroup implements InterventionSurface {
  public readonly kind = 'local' as const;
  private readonly handlers = new Set<(message: PlayerMessage) => void>();
  private readonly releases: Array<() => void> = [];

  public constructor(private readonly members: InterventionSurface[]) {}

  /** True when any member can carry a conversation. */
  public get connected(): boolean {
    return this.members.some((member) => member.connected);
  }

  public async attach(): Promise<void> {
    await Promise.all(this.members.map((member) => member.attach()));

    for (const member of this.members) {
      this.releases.push(
        member.onMessage((message) => {
          this.handlers.forEach((handler) => handler(message));
        })
      );
    }
  }

  public detach(): void {
    while (this.releases.length) this.releases.pop()?.();
    this.members.forEach((member) => member.detach());
    this.handlers.clear();
  }

  public present(state: SurfaceState): void {
    this.members.forEach((member) => member.present(state));
  }

  public onMessage(handler: (message: PlayerMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
