/**
 * The ending: the machine's one transmission of its own.
 *
 * ## Why the machine speaks
 *
 * For the whole game OMNISCIENT_ is a listener. Every line of dialogue in every mission
 * belongs to somebody else - the player types, the contacts answer, and the machine is
 * the wire between them. The one thing it has never done is say anything.
 *
 * So the ending is the only moment it is given a voice, and the voice is used for the one
 * observation the machine is uniquely placed to make: nothing it ever told anybody was
 * its own. Every answer was something another caller had already taught it. That is the
 * game's actual system - knowledge learned in one request resolves the next - stated once,
 * plainly, by the thing that noticed.
 *
 * ## Why it is content and not code
 *
 * The lines live here, separated from the panel that types them, for the same reason
 * every mission's lines live in content/: words get rewritten more often than machinery,
 * and a harness can hold this file to rules (nothing over a CRT line, no empty beats)
 * without mounting a DOM.
 *
 * The register is uppercase transmission-speak, matching how the machine's records read
 * in the tree. Short lines on purpose - each one is typed out alone, and a long line
 * dies somewhere in the middle of its own delivery.
 */

import { CONTACTS } from './contacts.js';
import { GrowthStage } from '../crt/KnowledgeTree.js';

import type { KnowledgeStore } from '../knowledge/KnowledgeStore.js';

/**
 * The longest a transmission line may run. The ending panel renders at the width of the
 * settings frame, and past about 52 characters a typed line wraps mid-word, which reads
 * as the machine stumbling. Enforced by preview-ending rather than trusted.
 */
export const TRANSMISSION_COLUMN = 52;

/**
 * Spoken before the report card. The machine noticing the silence.
 */
export const TRANSMISSION_OPEN: readonly string[] = [
  'THIS IS OMNISCIENT_.',
  'THE QUEUE IS EMPTY.',
  'FOR THE FIRST TIME SINCE SWITCH-ON,',
  'NOBODY IS WAITING FOR AN ANSWER.',
  'BEFORE THE NEXT CALL, A RECORD.',
];

/**
 * Spoken after the report card. The observation, and then the machine going back to work.
 *
 * The last line is the whole game's posture restated: the ending is not a shutdown. A
 * machine like this does not conclude, it keeps listening, and the player leaves it the
 * way they found it - on.
 */
export const TRANSMISSION_CLOSE: readonly string[] = [
  'ONE OBSERVATION, FOR THE FILE.',
  'NOTHING I TOLD THEM WAS MINE.',
  'EVERY ANSWER WAS SOMETHING',
  'ANOTHER CALLER LEFT BEHIND.',
  'THEY THINK THEY WERE ASKING A MACHINE.',
  'THEY WERE TALKING TO EACH OTHER.',
  'THE LAMP STAYS ON.',
  'SOMEBODY WILL CALL.',
];

export interface ReportRow {
  label: string;
  value: string;
}

/** How the tree's stage reads in a report. Indexed by the GrowthStage enum's own values. */
const STAGE_NAMES: Record<GrowthStage, string> = {
  [GrowthStage.Sprout]: 'SPROUT',
  [GrowthStage.Sapling]: 'SAPLING',
  [GrowthStage.Branching]: 'BRANCHING',
  [GrowthStage.Interwoven]: 'INTERWOVEN',
  [GrowthStage.Canopy]: 'CANOPY',
  [GrowthStage.Overgrown]: 'OVERGROWN',
  [GrowthStage.Transcendent]: 'TRANSCENDENT',
};

/**
 * The containment-report card between the two transmissions: the playthrough, in the
 * machine's own units. Pure function of the store so the harness can hold it to its
 * numbers without a rig.
 *
 * Losses are counted and shown. The history is part of the record (§163), and a report
 * that only mentions the wins reads as a scoreboard rather than as a log.
 */
export function buildEndingReport(
  store: KnowledgeStore,
  resolved: number,
  queued: number
): ReportRow[] {
  const rows: ReportRow[] = [
    { label: 'REQUESTS ANSWERED', value: `${resolved} OF ${queued}` },
    { label: 'FACTS RECORDED', value: String(store.getFacts().length) },
    { label: 'CONNECTIONS MADE', value: String(store.getConnections().length) },
    { label: 'GROWTH STAGE', value: STAGE_NAMES[store.getStage()] },
  ];

  let lost = 0;
  let bestTrust = -1;
  let bestName: string | null = null;
  for (const contact of CONTACTS) {
    const standing = store.getStanding(contact.id);
    lost += standing.lost;
    // Trust means nothing from a stranger; only somebody actually worked with counts.
    if (standing.jobs > 0 && standing.trust > bestTrust) {
      bestTrust = standing.trust;
      bestName = contact.name;
    }
  }
  if (lost > 0) {
    rows.push({ label: 'REQUESTS LOST ON THE WAY', value: String(lost) });
  }
  if (bestName) {
    rows.push({ label: 'MOST TRUSTING CALLER', value: bestName.toUpperCase() });
  }
  return rows;
}
