/**
 * §222 feasibility, proved in data.
 *
 * The unknown in second-screen play was never the protocol or the UI - it is whether a
 * phone can reach the running game, which is a hosting question with no answer inside
 * this repo. Everything else can be settled here: that a surface on the far end of a wire
 * is indistinguishable from the panel on the desktop, that both can drive the same
 * request, and that losing the remote one does not take the request with it.
 *
 * Runs against a loopback transport - the same ILinkTransport the BroadcastChannel
 * implementation satisfies, with the network hop replaced by a function call. If a
 * reachable transport ever exists, it drops in here and these checks still hold.
 */

import { MIRELA } from '../src/omniscient/content/contacts.js';
import { MISSION_01 } from '../src/omniscient/content/mission-01-transmitter.js';
import { KnowledgeStore } from '../src/omniscient/knowledge/KnowledgeStore.js';
import { RemoteSurface } from '../src/omniscient/link/RemoteSurface.js';
import { SurfaceGroup } from '../src/omniscient/link/SurfaceGroup.js';
import { SessionController } from '../src/omniscient/session/SessionController.js';

import type {
  InterventionSurface,
  PlayerMessage,
  SurfaceState,
} from '../src/omniscient/link/surface.js';
import type { ILinkTransport, LinkFrame } from '../src/omniscient/link/transport.js';

const SEED = 0x0c151e;

/** Array.prototype.at is newer than this project's lib target. */
function last<T>(items: readonly T[]): T | undefined {
  return items[items.length - 1];
}
let failures = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
}

/** Two ends of one wire, with the network replaced by a direct call. */
function loopback(): [ILinkTransport, ILinkTransport] {
  const handlers: [Set<(f: LinkFrame) => void>, Set<(f: LinkFrame) => void>] = [
    new Set(),
    new Set(),
  ];
  let open = true;

  const end = (self: 0 | 1): ILinkTransport => ({
    description: 'loopback',
    get connected() {
      return open;
    },
    send: (frame) => {
      if (!open) return;
      // Serialised on the way through, because a real wire does that and it is where a
      // state carrying anything unserialisable would blow up.
      const copy = JSON.parse(JSON.stringify(frame)) as LinkFrame;
      handlers[self === 0 ? 1 : 0].forEach((h) => h(copy));
    },
    onFrame: (handler) => {
      handlers[self].add(handler);
      return () => handlers[self].delete(handler);
    },
    close: () => {
      open = false;
    },
  });

  return [end(0), end(1)];
}

/** A surface that records what it was shown and can speak back. */
function stub(): InterventionSurface & { seen: SurfaceState[]; say: (m: PlayerMessage) => void } {
  const handlers = new Set<(m: PlayerMessage) => void>();
  const seen: SurfaceState[] = [];
  return {
    kind: 'local',
    connected: true,
    seen,
    attach: async () => {},
    detach: () => handlers.clear(),
    present: (state) => seen.push(state),
    onMessage: (h) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    say: (message) => handlers.forEach((h) => h(message)),
  };
}

console.log('\n=== SECOND SCREEN (§222) ===\n');

const [gameEnd, phoneEnd] = loopback();

// The phone: whatever arrives is rendered, whatever is typed goes back.
const phoneSeen: SurfaceState[] = [];
const phoneSend: Array<(m: PlayerMessage) => void> = [];
phoneEnd.onFrame((frame) => {
  if (frame.kind === 'state') phoneSeen.push(frame.state);
});
phoneSend.push((message) => phoneEnd.send({ kind: 'message', message }));

const desktop = stub();
const remote = new RemoteSurface(gameEnd);
const group = new SurfaceGroup([desktop, remote]);
// Awaited, not fired and forgotten: the group subscribes to its members after an await,
// so a session started before that resolves is talking to nobody. The rig awaits it too.
await group.attach();

const store = new KnowledgeStore(SEED);
const session = new SessionController(group, store);
session.start(MISSION_01, MIRELA);

check('The desktop panel is presented to', desktop.seen.length > 0);
check('The second screen receives the same state', phoneSeen.length > 0);
check(
  'Both ends agree on who is calling',
  last(desktop.seen)?.contactName === last(phoneSeen)?.contactName,
  last(phoneSeen)?.contactName
);
check(
  'The opening line crossed the wire intact',
  (last(phoneSeen)?.transcript.length ?? 0) >= 2,
  `${last(phoneSeen)?.transcript.length} lines`
);
check(
  'Suggestions crossed too - the phone is playable, not just readable',
  (last(phoneSeen)?.suggestions?.length ?? 0) > 0
);

// Now drive the mission FROM the phone.
const before = phoneSeen.length;
phoneSend[0]({ kind: 'text', text: 'look at the back of the set' });
check('A reply typed on the phone reaches the game', phoneSeen.length > before);
const tail = last(phoneSeen)?.transcript ?? [];
check(
  'and the contact answered it',
  tail.length >= 4 && last(tail)?.source === 'contact',
  last(tail)?.body?.slice(0, 50)
);
check(
  'the phone shows what the player said, not just the reply',
  tail.some((line) => line.body === 'look at the back of the set')
);
check('The desktop saw the same exchange', last(desktop.seen)?.transcript.length === last(phoneSeen)?.transcript.length);

// Losing the second screen must not take the request with it.
phoneEnd.close();
const desktopBefore = desktop.seen.length;
desktop.say({ kind: 'text', text: 'turn the power off first' });
check('The desktop still works after the phone drops', desktop.seen.length > desktopBefore);
check('The request is still live', !session.isFinished, 'pairing adds a screen, it does not move one');

console.log(
  failures === 0
    ? '\nALL CHECKS PASSED - everything except the network hop\n'
    : `\n${failures} CHECK(S) FAILED\n`
);
process.exit(failures === 0 ? 0 : 1);
