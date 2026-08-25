import type { WarehouseCaseDefinition, WarehouseMovementDefinition, WarehouseTool } from './types.js';

export const WAREHOUSE_COORDINATES = { latitude: -11.5, longitude: -57.0 } as const;
export const WAREHOUSE_DECK_VERSION = 7;

export const STORY_MOVEMENTS: readonly WarehouseMovementDefinition[] = [
  {
    id: 'orientation',
    title: 'MOVEMENT 01 // COLLECTION',
    objective: 'Locate the visitor, verify both records, and dock package 2034 at the assigned secure transfer platform.',
    caseIds: ['valid-collection'],
    tutorial: true,
  },
  {
    id: 'judgement',
    title: 'MOVEMENT 02 // JUDGEMENT',
    objective: 'Quarantine a mass anomaly and isolate a compromised seal.',
    caseIds: ['weight-mismatch', 'broken-seal'],
  },
  {
    id: 'freight',
    title: 'QUEST 04 // INBOUND AUDIT',
    objective: 'Audit five worker deliveries. Sort verified packages and reject confirmed contradictions.',
    caseIds: ['freight-sort'],
  },
  {
    id: 'overlap',
    title: 'MOVEMENT 04 // OVERLAP',
    objective: 'Maintain collections, verify personnel, and contain an unauthorized door attempt.',
    caseIds: ['valid-collection', 'temporary-worker', 'door-tamper'],
    inboundIn: 9,
  },
  {
    id: 'breach',
    title: 'MOVEMENT 05 // BREACH',
    objective: 'Reconstruct the rear entry, locate the unlisted person, and contain the correct security sector.',
    caseIds: ['internal-breach'],
    inboundIn: 3,
  },
  {
    id: 'package-5018',
    title: 'MOVEMENT 06 // 5018',
    objective: 'One warehouse record produced two physical packages claiming identity 5018. Scan and secure both at Service C.',
    caseIds: ['package-5018'],
    finale: true,
  },
] as const;

/** Total individual cases in Story mode; these are what the player experiences as quests. */
export const STORY_QUEST_COUNT = STORY_MOVEMENTS.reduce((total, movement) => total + movement.caseIds.length, 0);

export function storyQuestNumber(movementIndex: number, caseIndex: number): number {
  const completedBeforeMovement = STORY_MOVEMENTS
    .slice(0, Math.max(0, movementIndex))
    .reduce((total, movement) => total + movement.caseIds.length, 0);
  return completedBeforeMovement + Math.max(0, caseIndex) + 1;
}

export const CASE_DECK: readonly WarehouseCaseDefinition[] = [
  {
    id: 'valid-collection',
    title: 'Authorized collection',
    briefing: 'Recipient identity, inbound record, mass, and seal agree with the visitor record.',
    subjectType: 'cargo',
    requiredTools: ['optical'],
    correctDecision: 'release',
    anomaly: 'none',
    baseSeconds: 35,
  },
  {
    id: 'weight-mismatch',
    title: 'Mass discrepancy',
    briefing: 'Recipient identity and inbound record match, but measured mass contradicts the declaration.',
    subjectType: 'cargo',
    requiredTools: ['optical'],
    correctDecision: 'quarantine',
    anomaly: 'mass',
    baseSeconds: 40,
  },
  {
    id: 'broken-seal',
    title: 'Compromised seal',
    briefing: 'Identity matches. The security seal has been opened since intake.',
    subjectType: 'cargo',
    requiredTools: ['optical'],
    correctDecision: 'quarantine',
    anomaly: 'seal',
    baseSeconds: 40,
  },
  {
    id: 'freight-sort',
    title: 'Inbound worker audit',
    briefing: 'Compare each worker badge, assigned package, recorded deliverer, and security seal before sorting.',
    subjectType: 'mixed',
    requiredTools: ['optical'],
    correctDecision: 'release',
    anomaly: 'none',
    baseSeconds: 70,
  },
  {
    id: 'temporary-worker',
    title: 'Unlisted substitution',
    briefing: 'The badge is valid but the person is absent from the issued crew list.',
    subjectType: 'worker',
    requiredTools: ['optical'],
    correctDecision: 'hold',
    anomaly: 'identity',
    baseSeconds: 42,
  },
  {
    id: 'door-tamper',
    title: 'Unauthorized service-door attempt',
    briefing: 'The visitor acted before authorization, the credential route disagrees, and the door recorded a forced-handle event.',
    subjectType: 'visitor',
    requiredTools: ['optical'],
    correctDecision: 'deny-lockdown',
    anomaly: 'tamper',
    baseSeconds: 48,
    critical: true,
  },
  {
    id: 'identity-impostor',
    title: 'Recipient identity mismatch',
    briefing: 'The visitor claims the package identifier, but the recipient identity belongs to somebody else.',
    subjectType: 'visitor',
    requiredTools: ['optical'],
    correctDecision: 'deny-lockdown',
    anomaly: 'identity',
    baseSeconds: 46,
    critical: true,
  },
  {
    id: 'internal-breach',
    title: 'Internal personnel breach',
    briefing: 'Rear-camera history, personnel beam count, and a live optical tag must agree before a security sector can be sealed.',
    subjectType: 'intruder',
    requiredTools: ['optical', 'history'],
    correctDecision: 'sector-lockdown',
    anomaly: 'breach',
    baseSeconds: 82,
    critical: true,
  },
  {
    id: 'historical-gap',
    title: 'Historical discontinuity',
    briefing: 'The current package has no arrival event in historical CCTV.',
    subjectType: 'cargo',
    requiredTools: ['history'],
    correctDecision: 'quarantine',
    anomaly: 'camera',
    baseSeconds: 45,
  },
  {
    id: 'thermal-leak',
    title: 'Thermal variance',
    briefing: 'A sealed passive shipment is producing a localized heat signature.',
    subjectType: 'cargo',
    requiredTools: ['thermal'],
    correctDecision: 'quarantine',
    anomaly: 'thermal',
    baseSeconds: 48,
  },
  {
    id: 'uv-reseal',
    title: 'Reprinted seal',
    briefing: 'Visible markings pass, but alternate light exposes a second seal beneath them.',
    subjectType: 'cargo',
    requiredTools: ['uv'],
    correctDecision: 'quarantine',
    anomaly: 'seal',
    baseSeconds: 50,
  },
  {
    id: 'xray-partition',
    title: 'Internal partition',
    briefing: 'The package mass is correct, but the internal structure contradicts its record.',
    subjectType: 'cargo',
    requiredTools: ['xray'],
    correctDecision: 'quarantine',
    anomaly: 'internal',
    baseSeconds: 52,
  },
  {
    id: 'resonant-package',
    title: 'Unpowered resonance',
    briefing: 'The package answers the dock beacon at a frequency absent from its manifest.',
    subjectType: 'cargo',
    requiredTools: ['acoustic'],
    correctDecision: 'quarantine',
    anomaly: 'resonance',
    baseSeconds: 55,
  },
  {
    id: 'package-5018',
    title: 'Duplicate identity',
    briefing: 'One warehouse record produced two physical packages claiming identity 5018. Their combined mass is conserved.',
    subjectType: 'mixed',
    requiredTools: ['optical', 'history'],
    correctDecision: 'quarantine',
    anomaly: 'mass',
    baseSeconds: 90,
    critical: true,
  },
] as const;

export const TOOL_UNLOCK_STAGE: Readonly<Partial<Record<WarehouseTool, number>>> = {
  history: 1,
  thermal: 10,
  uv: 18,
  xray: 24,
  acoustic: 30,
};
