/**
 * Measured, code-only reconstruction contract for the Mirela experiment.
 *
 * The GLB is an offline ruler. Runtime construction uses only this specification and the
 * procedural factory beside it. Mirela's source is a single merged mesh/material, so hair,
 * clothing and face labels are authored hypotheses rather than claims about source topology.
 */

export interface MirelaProceduralSpec {
  schemaVersion: 1;
  source: {
    sha256: string;
    meshCount: number;
    primitiveCount: number;
    materialCount: number;
    jointCount: number;
    animationCount: number;
    semanticConfidence: 'merged-source';
  };
  anatomy: {
    height: number;
    hipHeightRatio: number;
    torsoHeightRatio: number;
    headHeightRatio: number;
    shoulderWidthRatio: number;
    hipWidthRatio: number;
    upperArmToTorso: number;
    forearmToTorso: number;
  };
  palette: {
    skin: string;
    skinShadow: string;
    shirt: string;
    apron: string;
    apronEdge: string;
    pants: string;
    hair: string;
    hairHighlight: string;
    headband: string;
    boots: string;
    eyes: string;
    lips: string;
    metal: string;
  };
  reconstruction: {
    mode: 'measured-parametric';
    runtimeModelAsset: null;
    densityCeilingSpokes: number;
    limitations: readonly string[];
  };
}

export const MIRELA_PROCEDURAL_SPEC: MirelaProceduralSpec = {
  schemaVersion: 1,
  source: {
    sha256: '8c27be5f1f306d57c14a2a93850666323439ba57ce43f87af088e2eed14ba3ed',
    meshCount: 1,
    primitiveCount: 1,
    materialCount: 1,
    jointCount: 65,
    animationCount: 4,
    semanticConfidence: 'merged-source',
  },
  anatomy: {
    height: 1.66,
    hipHeightRatio: 0.556,
    torsoHeightRatio: 0.22,
    headHeightRatio: 0.152,
    shoulderWidthRatio: 0.246,
    hipWidthRatio: 0.76,
    upperArmToTorso: 0.61,
    forearmToTorso: 0.55,
  },
  palette: {
    skin: '#b97852',
    skinShadow: '#8e513b',
    shirt: '#1e2c31',
    apron: '#4c4039',
    apronEdge: '#7b5b47',
    pants: '#242728',
    hair: '#2a1b17',
    hairHighlight: '#533329',
    headband: '#a83224',
    boots: '#1a1817',
    eyes: '#19130f',
    lips: '#743f36',
    metal: '#abb7b1',
  },
  reconstruction: {
    mode: 'measured-parametric',
    runtimeModelAsset: null,
    densityCeilingSpokes: 4,
    limitations: [
      'The reference is one merged skinned mesh, so topology does not prove semantic regions.',
      'Whole-mesh horizontal sections merge limbs and torso; anatomy is reconstructed by rig landmarks.',
      'Materials are independently authored from the visible character palette rather than copied textures.',
    ],
  },
};
