/**
 * Free-text -> intent resolution.
 *
 * Gauntlet §157 is the governing rule: THE LANGUAGE EVALUATOR INTERPRETS WHAT THE PLAYER
 * MEANT. IT DOES NOT INVENT WHAT IS TRUE IN THE MISSION. Mission truth is authored and
 * deterministic; this module only maps a sentence onto one of the intents the mission
 * already declares.
 *
 * §157 also explicitly sanctions this implementation: "If semantic evaluation is
 * unavailable, unreliable or too expensive in the runtime environment, provide a
 * deterministic fallback using authored intent matching / structured responses." There is
 * no model at runtime, so authored matching is the whole mechanism - which has the
 * advantage of being unit-testable and reproducible, as §163 requires.
 *
 * §164 QA: equivalent phrasings must resolve to the same intent, and genuine ambiguity
 * must ask for clarification rather than failing arbitrarily.
 */

export interface IntentDefinition {
  /** Stable identifier, e.g. INSPECT_CONNECTOR_B. */
  id: string;
  /**
   * Mandatory term groups. Every group must be satisfied by at least one of its terms -
   * an AND of ORs. This is what makes "check the plug next to the battery" and "show me
   * the connector beside the battery" land on the same intent.
   */
  requires: string[][];
  /** Optional groups that raise the score without being required to match. */
  boosts?: string[][];
  /** If any of these appear, the intent is rejected outright. */
  excludes?: string[];
  /** Tie-break when several intents match equally. Higher wins. */
  priority?: number;
}

export interface IntentMatch {
  intentId: string;
  /** Matched required groups plus boosts. Only meaningful relative to other candidates. */
  score: number;
}

export type IntentResolution =
  | { kind: 'matched'; intentId: string; score: number }
  /** Several intents tied. §164: ask what they meant, do not guess. */
  | { kind: 'ambiguous'; candidates: IntentMatch[] }
  /** Nothing matched. The contact should ask for clarification, not report failure. */
  | { kind: 'unrecognised' };

/**
 * Lowercase, strip punctuation, collapse whitespace, and pad so that whole-word matching
 * can be done with plain substring search on ' term '.
 */
export function normalise(input: string): string {
  return ` ${input
    .toLowerCase()
    .replace(/['`’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')} `;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whole-word match tolerating common English inflections, so an author writes
 * "connector" once and the player may type connectors / connected / connecting.
 *
 * Without this the matcher is brittle in exactly the way §164 forbids: "look at the
 * connectors" failing while "look at the connector" succeeds is indistinguishable from
 * a broken game.
 */
function termMatches(haystack: string, term: string): boolean {
  const normalised = normalise(term).trim();
  if (!normalised) return false;
  return new RegExp(`\\s${escapeRegex(normalised)}(s|es|ed|d|ing)?\\s`).test(haystack);
}

/** True when any term in the group appears. */
function groupMatches(haystack: string, group: string[]): boolean {
  return group.some((term) => termMatches(haystack, term));
}

function scoreIntent(haystack: string, intent: IntentDefinition): number | null {
  if (intent.excludes?.some((term) => termMatches(haystack, term))) {
    return null;
  }

  for (const group of intent.requires) {
    if (!groupMatches(haystack, group)) return null;
  }

  let score = intent.requires.length;
  for (const group of intent.boosts ?? []) {
    if (groupMatches(haystack, group)) score += 1;
  }
  return score;
}

/**
 * Resolve player text against the intents this mission beat allows.
 *
 * Returns `ambiguous` when the leaders tie on both score and priority. Callers must turn
 * that into an in-fiction clarification request - the contact asking what the player
 * means - never into a failure state (§159: no red X feedback).
 */
export function resolveIntent(text: string, intents: readonly IntentDefinition[]): IntentResolution {
  const haystack = normalise(text);
  if (haystack.trim().length === 0) return { kind: 'unrecognised' };

  const matches: Array<IntentMatch & { priority: number }> = [];
  for (const intent of intents) {
    const score = scoreIntent(haystack, intent);
    if (score !== null) {
      matches.push({ intentId: intent.id, score, priority: intent.priority ?? 0 });
    }
  }

  if (matches.length === 0) return { kind: 'unrecognised' };

  matches.sort((a, b) => b.score - a.score || b.priority - a.priority);
  const leader = matches[0];
  const tied = matches.filter((m) => m.score === leader.score && m.priority === leader.priority);

  if (tied.length > 1) {
    return { kind: 'ambiguous', candidates: tied.map(({ intentId, score }) => ({ intentId, score })) };
  }

  return { kind: 'matched', intentId: leader.intentId, score: leader.score };
}

/**
 * Shared vocabulary, so missions do not each reinvent "look at".
 * §163 asks for a shared intent vocabulary across missions with room for
 * mission-specific additions.
 */
export const TERMS = {
  inspect: ['check', 'look', 'inspect', 'examine', 'see', 'show', 'view', 'open', 'find'],
  describe: ['describe', 'tell', 'explain', 'what'],
  // 'off' and 'down' are broad on their own, but every intent using this group also
  // requires a power term, so "take the power off" resolves while "off the coast" cannot.
  remove: ['remove', 'disconnect', 'unplug', 'pull', 'cut', 'kill', 'isolate', 'shut', 'off', 'down', 'dead'],
  power: ['power', 'battery', 'cell', 'mains', 'supply', 'current', 'electricity'],
  connector: ['connector', 'plug', 'terminal', 'contact', 'socket', 'pin', 'lead'],
  corrosion: ['corrosion', 'corroded', 'rust', 'rusty', 'green', 'crust', 'oxidised', 'oxidized'],
  clean: ['clean', 'scrape', 'wipe', 'brush', 'dry'],
  water: ['water', 'wet', 'damp', 'rain', 'moisture', 'flood', 'submerged', 'soaked'],
  uncertain: ['unsure', 'dont know', 'do not know', 'not sure', 'uncertain', 'no idea'],
  affirm: ['yes', 'yeah', 'correct', 'right', 'confirm', 'ok', 'okay'],
} as const;
