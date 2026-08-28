import * as THREE from 'three';

import type { RiggedContact } from './riggedContact.js';

/** Scene-owned choreography; the shared rig owns the walk, crouch and arm solve. */
export function doorstepPerformance(
  rig: RiggedContact | null,
  hands: { left?: THREE.Vector3; right?: THREE.Vector3 },
  pick: THREE.Object3D
) {
  const home = new THREE.Vector3(0.75, 0, 0.7);
  const work = new THREE.Vector3(0.26, 0, 0.5);
  const threshold = new THREE.Vector3(-0.15, 0, 0.38);
  const inside = new THREE.Vector3(-0.15, 0, -1.1);
  let phase: 'idle' | 'approach' | 'work' | 'release' | 'align' | 'enter' | 'inside' = 'idle';
  let elapsed = 0;
  const left = new THREE.Vector3();
  const right = new THREE.Vector3();
  const clearHands = () => { delete hands.left; delete hands.right; };
  const near = (to: THREE.Vector3) => !!rig && Math.hypot(
    rig.root.position.x - to.x, rig.root.position.z - to.z
  ) < 0.025;

  return {
    work() {
      if (!rig || phase === 'work' || phase === 'approach') return;
      phase = 'approach';
      rig.walk(work, { facing: -Math.PI, pace: 0.55, interrupt: true });
    },
    open() {
      clearHands();
      phase = 'release';
      elapsed = 0;
      rig?.setStance('stand');
    },
    idle(dt: number) {
      if (!rig) return;
      elapsed += dt;
      if (phase === 'approach' && near(work)) {
        rig.setStance('crouch');
        phase = 'work';
      }
      if (phase === 'work') {
        // These targets follow the tools as the cylinder gives, not a point on the wall.
        pick.updateWorldMatrix(true, false);
        pick.localToWorld(left.set(-0.045, -0.035, 0.11));
        pick.localToWorld(right.set(0.035, -0.005, 0.15));
        hands.left = left;
        hands.right = right;
      }
      if (phase === 'release' && elapsed >= 3.8) {
        phase = 'align';
        rig.walk(threshold, { facing: -Math.PI, pace: 0.55, interrupt: true });
      } else if (phase === 'align' && near(threshold)) {
        phase = 'enter';
        rig.walk(inside, { facing: -Math.PI, pace: 0.55, interrupt: true });
      } else if (phase === 'enter') {
        // Walk clips are level: follow the one shallow stone step with the root.
        rig.root.position.y = 0.14 * (1 - THREE.MathUtils.smoothstep(rig.root.position.z, 0.08, 0.3));
        if (near(inside)) {
          rig.root.position.y = 0.14;
          phase = 'inside';
        }
      }
    },
    reset() {
      clearHands();
      phase = 'idle';
      elapsed = 0;
      if (!rig) return;
      rig.setStance('stand');
      rig.root.position.copy(home);
      rig.root.rotation.set(0, -Math.PI * 0.42, 0);
      // Interrupt a previous visit's route at the restored origin.
      rig.walk(home, { facing: -Math.PI * 0.42, interrupt: true });
    },
  };
}
