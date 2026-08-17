/**
 * The eight rooms, in mission order.
 *
 * Split out from `scenes.ts` because that file is five thousand lines and importing it
 * pulls the whole geometry pipeline in with it - which is fine for the rig and absurd for
 * a debug listener that only needs eight strings.
 *
 * These are the same ids the mission content declares. They are duplicated here rather
 * than derived, which §254 would normally object to; the alternative is importing eight
 * mission modules to read one field from each, and the failure mode of this copy drifting
 * is a scene jump that lands nowhere, which is instant and harmless to notice.
 */
export const SCENE_IDS = [
  'scene-repair-shop',
  'scene-cleared-house',
  'scene-beacon-mast',
  'scene-seedling-tunnel',
  'scene-flooded-cellar',
  'scene-night-door',
  'scene-mill-road',
  'scene-wire-city',
] as const;

export type SceneId = (typeof SCENE_IDS)[number];
