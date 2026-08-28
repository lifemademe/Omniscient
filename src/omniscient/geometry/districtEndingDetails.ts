/** Physical fittings for Lucian's captured cabin; no mission state or scene overrides. */
import * as THREE from 'three';

const matte = (color: string): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({
  color, roughness: 0.94, metalness: 0.06, flatShading: true,
});

/** A tracked saloon in the city's reconstruction language. Front is +Z. */
export function districtTrackedCar(): THREE.Group {
  const root = new THREE.Group();
  const ink = new THREE.LineBasicMaterial({ color: '#bfe9c8' });
  const points: number[] = [];
  const segment = (a: number[], b: number[]): void => { points.push(...a, ...b); };
  const profile = [[0.82, -0.24, -1.6], [0.82, 0.06, -1.6], [0.78, 0.14, -0.95],
    [0.63, 0.60, -0.55], [0.63, 0.60, 0.40], [0.78, 0.14, 0.90],
    [0.82, 0.01, 1.6], [0.82, -0.24, 1.6]];
  for (const side of [-1, 1]) {
    for (let i = 0; i < profile.length; i++) {
      const [w, y, z] = profile[i];
      const [nw, ny, nz] = profile[(i + 1) % profile.length];
      segment([side * w, y, z], [side * nw, ny, nz]);
    }
    segment([side * 0.81, 0.08, -1.45], [side * 0.81, 0.08, 1.35]);
    segment([side * 0.63, 0.60, -0.05], [side * 0.80, -0.20, -0.05]);
    for (const z of [-1.05, 1.05]) for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const b = (i + 1) * Math.PI / 6;
      segment([side * 0.835, -0.25 + Math.sin(a) * 0.25, z + Math.cos(a) * 0.25],
        [side * 0.835, -0.25 + Math.sin(b) * 0.25, z + Math.cos(b) * 0.25]);
    }
  }
  for (const [w, y, z] of profile) segment([-w, y, z], [w, y, z]);
  root.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',
    new THREE.Float32BufferAttribute(points, 3)), ink));
  const lampMaterial = new THREE.MeshBasicMaterial({ color: '#e4efc2' });
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.11, 0.04), lampMaterial);
    lamp.position.set(x, -0.03, 1.62);
    root.add(lamp);
  }
  return root;
}

export function districtCabinDetails(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'CabinFittings';
  const rubber = matte('#242b2c');
  const trim = matte('#68736e');
  const recess = matte('#080e12');
  const metal = matte('#707a78');
  const dial = new THREE.MeshBasicMaterial({ color: '#182d28' });
  const ink = new THREE.MeshBasicMaterial({ color: '#83997d' });
  const needle = new THREE.MeshBasicMaterial({ color: '#c39b65' });
  const box = (parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  // Windscreen demister trough and split fascia trim follow the moulded shell.
  box(root, 0, -0.217, -0.838, 1.22, 0.008, 0.034, recess);
  for (let i = 0; i < 13; i++) box(root, -0.57 + i * 0.095, -0.211, -0.838, 0.008, 0.006, 0.032, trim);
  for (const [x, width] of [[-0.49, 0.30], [0.40, 0.46]]) {
    box(root, x, -0.325, -0.574, width, 0.009, 0.009, trim);
  }
  // A shallow rubber phone tray supports the handset on the sloping dash.
  box(root, -0.40, -0.238, -0.68, 0.18, 0.035, 0.26, rubber);
  for (const x of [-0.59, 0.43]) {
    box(root, x, -0.291, -0.579, 0.145, 0.047, 0.027, recess);
    for (let i = 0; i < 5; i++) box(root, x - 0.056 + i * 0.028, -0.291, -0.560, 0.006, 0.037, 0.012, trim);
  }
  // Recessed instrument binnacle: the hood catches the outside light, dials remain dim.
  const hoodShape = new THREE.Shape();
  hoodShape.moveTo(-0.20, -0.085);
  hoodShape.lineTo(-0.20, 0.025);
  hoodShape.lineTo(-0.155, 0.085);
  hoodShape.lineTo(0.155, 0.085);
  hoodShape.lineTo(0.20, 0.025);
  hoodShape.lineTo(0.20, -0.085);
  hoodShape.closePath();
  const hood = new THREE.Mesh(new THREE.ExtrudeGeometry(hoodShape, {
    depth: 0.13, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.009, bevelSegments: 1, steps: 1,
  }), matte('#505a5b'));
  hood.position.set(-0.075, -0.249, -0.704);
  root.add(hood);
  box(root, -0.075, -0.249, -0.559, 0.345, 0.125, 0.015, recess);
  for (const [index, x] of [-0.165, 0.02].entries()) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.052, 20), dial);
    face.position.set(x, -0.249, -0.548);
    root.add(face);
    for (let i = 0; i < 9; i++) {
      const angle = -Math.PI * 0.8 + i * Math.PI * 0.2;
      const tick = box(root, x + Math.sin(angle) * 0.043, -0.249 + Math.cos(angle) * 0.043, -0.545, 0.003, 0.009, 0.002, ink);
      tick.rotation.z = -angle;
    }
    const hand = box(root, x - 0.012, -0.242, -0.541, 0.032, 0.003, 0.002, needle);
    hand.rotation.z = index ? 0.65 : -0.45;
  }
  // A faceted, worn three-spoke wheel at a plausible reach from the eye.
  const wheel = new THREE.Group();
  wheel.position.set(-0.08, -0.29, -0.46);
  wheel.rotation.x = -0.24;
  root.add(wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.174, 0.018, 6, 24), rubber);
  wheel.add(rim);
  // Polished-through hand grips, with irregular breaks rather than a glossy whole wheel.
  const wornRubber = matte('#626052');
  for (const angle of [0.43, 2.31]) {
    const wear = new THREE.Mesh(new THREE.TorusGeometry(0.174, 0.0185, 5, 5, 0.30), wornRubber);
    wear.rotation.z = angle;
    wheel.add(wear);
  }
  for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
    const spoke = box(wheel, Math.sin(angle) * 0.083, -Math.cos(angle) * 0.083, -0.002, 0.028, 0.16, 0.022, trim);
    spoke.rotation.z = angle;
  }
  box(wheel, 0, 0, 0.012, 0.10, 0.058, 0.032, rubber);
  box(wheel, 0, 0, 0.030, 0.025, 0.009, 0.002, metal);
  // Fine physical seams, two rubbed spots: no broad glossy coating.
  for (const x of [-0.13, 0.16]) box(root, x, -0.224, -0.80, 0.007, 0.003, 0.13, recess);
  for (const x of [-0.38, 0.28]) box(root, x, -0.219, -0.76, 0.07, 0.003, 0.006, trim);
  // Small windscreen registration slip; a human trace, not another glowing display.
  const slip = box(root, -0.54, -0.157, -0.81, 0.09, 0.05, 0.002, matte('#8a876b'));
  slip.rotation.z = -0.08;
  for (let i = 0; i < 3; i++) box(root, -0.54, -0.145 - i * 0.011, -0.806, 0.055 - i * 0.008, 0.003, 0.002, recess);
  // A folded street slip wedged beside the phone tray: the driver still uses paper routes.
  const paper = new THREE.Group();
  paper.position.set(-0.59, -0.218, -0.68);
  paper.rotation.y = -0.16;
  root.add(paper);
  const paperMat = matte('#a29b7b');
  const routeInk = matte('#525f5a');
  box(paper, 0, 0, 0, 0.14, 0.004, 0.20, paperMat);
  box(paper, 0, 0.004, -0.005, 0.006, 0.003, 0.18, trim);
  for (const x of [-0.047, 0.025, 0.050]) box(paper, x, 0.004, 0, 0.003, 0.002, 0.15, routeInk);
  for (const z of [-0.065, -0.018, 0.038, 0.068]) box(paper, 0, 0.004, z, 0.115, 0.002, 0.003, routeInk);
  const route = box(paper, -0.018, 0.007, 0.010, 0.006, 0.002, 0.12, matte('#827047'));
  route.rotation.y = 0.35;
  // Two old tape tabs and scuffed dash shoulders locate wear where things are handled.
  for (const x of [-0.63, -0.55]) box(root, x, -0.214, -0.77, 0.027, 0.003, 0.028, matte('#7d7961'));
  for (const [x, z, width] of [[-0.30, -0.746, 0.050], [-0.32, -0.730, 0.023], [0.21, -0.735, 0.040]]) {
    box(root, x, -0.217, z, width, 0.002, 0.006, trim);
  }
  return root;
}

/** The same moving bridge root carries fittings and their lights during deceleration. */
export function dressDistrictBridge(root: THREE.Group): void {
  const steel = new THREE.MeshBasicMaterial({ color: '#293c41' });
  const edge = new THREE.MeshBasicMaterial({ color: '#435256' });
  const stone = matte('#4c5150');
  const joint = new THREE.MeshBasicMaterial({ color: '#111c21' });
  const rust = matte('#584333');
  const reflector = new THREE.MeshBasicMaterial({ color: '#b49a61' });
  const bulb = new THREE.MeshBasicMaterial({ color: '#cdb480' });
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  const beam = (a: THREE.Vector3, b: THREE.Vector3, width: number, material: THREE.Material): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, a.distanceTo(b), width), material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    root.add(mesh);
  };
  for (const side of [-1, 1]) {
    box(side * 2.37, -1.12, -30, 0.30, 0.26, 60, stone);
    for (let z = -2; z > -59; z -= 5) {
      box(side * 2.37, -0.984, z, 0.3, 0.006, 0.027, joint);
      box(side * 2.27, -0.55, z, 0.025, 0.10, 0.07, reflector);
    }
    for (let z = -15; z >= -55; z -= 20) {
      box(side * 2.60, 0.60, z, 0.22, 3.6, 0.25, steel);
      box(side * 2.60, -0.98, z, 0.38, 0.30, 0.45, rust);
      box(side * 2.60, 2.2, z - 7, 0.18, 0.22, 14, edge);
      beam(new THREE.Vector3(side * 2.60, -0.8, z), new THREE.Vector3(side * 2.60, 2.2, z - 14), 0.095, steel);
    }
  }
  for (const [index, z] of [-15, -35, -55].entries()) {
    box(0, 2.30, z, 5.42, 0.22, 0.24, steel);
    box(0, 2.18, z, 5.36, 0.05, 0.27, edge);
    const lampX = index % 2 ? 1.85 : -1.85;
    box(lampX, 2.10, z, 0.52, 0.10, 0.25, joint);
    box(lampX, 2.035, z, 0.42, 0.017, 0.18, bulb);
    const light = new THREE.SpotLight('#dfbd84', 48, 24, 0.8, 0.65, 2);
    light.position.set(lampX, 1.99, z);
    light.target.position.set(0, -1.2, z + 2);
    root.add(light, light.target);
    // Dark transverse expansion joint, with a narrow metal lip rather than a painted bar.
    box(0, -1.192, z + 2.2, 4.45, 0.008, 0.06, joint);
    box(0, -1.189, z + 2.25, 4.45, 0.007, 0.014, edge);
  }
  // Sparse repairs break the regular road rhythm without obscuring lane markings.
  const patch = matte('#222e32');
  for (const [x, z, width, length] of [[-0.8, -11, 0.75, 1.8], [1.5, -27, 0.3, 2.4], [-1.4, -43, 0.9, 1.1]]) {
    const repair = box(x, -1.194, z, width, 0.006, length, patch);
    repair.rotation.y = 0.12;
  }
  // Guardrail bolt plates: enough mid-scale construction to survive the pixel grid.
  for (const side of [-1, 1]) for (let z = -8; z > -60; z -= 12) {
    box(side * 2.3, -0.56, z, 0.105, 0.15, 0.26, edge);
    box(side * 2.23, -0.56, z, 0.015, 0.045, 0.045, joint);
  }
}
