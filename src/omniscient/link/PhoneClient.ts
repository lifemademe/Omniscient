/**
 * The second screen itself (§222).
 *
 * Runs instead of the game, in the same page bundle at the same URL with a query flag -
 * which is exactly what a scanned code would open. No separate build, no second deploy,
 * and nothing to keep in sync: it renders with the same LocalSurface the desktop uses, so
 * the phone and the panel are the same code and cannot drift apart.
 *
 * The direction is simply inverted. Where the game presents state into a surface and
 * listens for messages, this listens for state off the wire and presents it, then sends
 * what the player types back.
 */

import { BroadcastTransport } from './BroadcastTransport.js';
import { LocalSurface } from './LocalSurface.js';

import type { ILinkTransport } from './transport.js';

/** Query flag that turns this page into the second screen rather than the game. */
export const PHONE_FLAG = 'surface';
export const PHONE_VALUE = 'phone';

/** True when this page was opened as a second screen. */
export function isPhoneRequested(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get(PHONE_FLAG) === PHONE_VALUE;
}

/** The URL a code would encode: this page, in second-screen mode. */
export function phoneUrl(href: string = window.location.href): string {
  const url = new URL(href);
  url.searchParams.set(PHONE_FLAG, PHONE_VALUE);
  return url.toString();
}

export class PhoneClient {
  private surface: LocalSurface | null = null;
  private release: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;

  public constructor(private readonly transport: ILinkTransport = new BroadcastTransport()) {}

  public async start(container: HTMLElement): Promise<void> {
    const surface = new LocalSurface(container);
    this.surface = surface;
    await surface.attach();
    surface.setVisible(true);

    this.release = this.transport.onFrame((frame) => {
      if (frame.kind === 'state') surface.present(frame.state);
    });

    // Anything typed here is the player speaking, indistinguishable from the desktop.
    this.unsubscribe = surface.onMessage((message) => {
      this.transport.send({ kind: 'message', message });
    });

    // Ask for the conversation so far, so scanning mid-request shows what has been said
    // rather than an empty screen until somebody next speaks.
    this.transport.send({ kind: 'hello' });
  }

  public stop(): void {
    this.release?.();
    this.unsubscribe?.();
    this.surface?.detach();
    this.transport.close();
  }
}
