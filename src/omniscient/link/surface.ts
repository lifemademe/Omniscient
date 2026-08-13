/**
 * The intervention surface - OMNISCIENT_'s phone.
 *
 * Gauntlet §222: the real QR-paired device is the target, but it is built as a
 * progressive enhancement behind this interface and never as a load-bearing dependency.
 * Gameplay talks to `InterventionSurface` and never to a transport, so:
 *
 *   - LocalSurface (on-screen phone) always works and always ships.
 *   - RemoteSurface (paired device) can be added, or cut on 30 August, without touching
 *     a single line of mission or session code.
 *
 * §91 keeps the division of labour: the PC shows the world and the consequence, the
 * phone is where the player intervenes.
 */

/** §162: the phone changes tool mode as the mission demands. */
export type SurfaceMode = 'chat' | 'notes' | 'action';

export type TranscriptSource = 'contact' | 'omniscient' | 'system';

export interface TranscriptEntry {
  source: TranscriptSource;
  /**
   * Speaker label. UNTRUSTED for HTML - contact names are content and, on a remote
   * surface, arrive over the network. Renderers must use textContent.
   */
  name: string;
  body: string;
}

export interface SurfaceState {
  mode: SurfaceMode;
  contactName: string;
  /** Full exchange so far. Renderers may diff or redraw. */
  transcript: TranscriptEntry[];
  /** True when the surface should accept a response. */
  awaitingInput: boolean;
  /** Optional hint under the input, e.g. the current tempo. */
  hint?: string;
}

/** §160: gestures compress an instruction into an immediate machine command. */
export type Gesture = 'swipe-left' | 'swipe-right' | 'swipe-up' | 'swipe-down' | 'hold' | 'tap';

export type PlayerMessage =
  | { kind: 'text'; text: string }
  | { kind: 'gesture'; gesture: Gesture }
  | { kind: 'mode'; mode: SurfaceMode };

export interface InterventionSurface {
  /** Which transport this is. Diagnostics and telemetry only - gameplay must not branch on it. */
  readonly kind: 'local' | 'remote';

  /** True once the surface can present and receive. */
  readonly connected: boolean;

  attach(): Promise<void>;
  detach(): void;

  /** Render the current state. Called whenever the session advances. */
  present(state: SurfaceState): void;

  /** Subscribe to player input. Returns an unsubscribe function. */
  onMessage(handler: (message: PlayerMessage) => void): () => void;
}
