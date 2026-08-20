/**
 * Ground cover, rocks and glass - the kit the outdoor dioramas were missing.
 *
 * ## What was wrong
 *
 * Four of the seven contact scenes are outside, and all four stood on a single flat plane
 * of one colour running to a horizon. That is not a stylistic choice, it is an absence:
 * §241 asks for depth from LAYERS and value, and a plane has exactly one of each. Adaeze's
 * field was the worst of them - nine metres of unbroken olive with the evidence arranged on
 * it like exhibits on a table.
 *
 * ## Why this is one module and not four
 *
 * §187 wants one small shared material family, and the same argument applies a level up:
 * grass built separately per scene would drift into four different grasses, and the four
 * outdoor sets would stop looking like the same country. A headland, a smallholding, a
 * street and a mill road should be recognisably the same world seen in four places.
 *
 * Everything here is flat-shaded blocks and triangles - no textures, no alpha cards, no
 * billboards. A grass card with a cutout would be the only thing in this game pretending
 * to be geometry it is not, and at this camera distance a tuft of four crossed blades
 * reads better anyway.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { jitter, range } from '../core/rng.js';

import type { Rng } from '../core/rng.js';

/** A patch of ground to scatter over, in scene space. */
export interface Patch {
  centre: THREE.Vector3;
  width: number;
  depth: number;
  /** Nothing is scattered inside this radius of the centre - paths, beds, doorways. */
  clear?: number;
}

/**
 * Tufts, not blades.
 *
 * A single blade is invisible at four metres and a thousand of them is a lawn. What reads
 * is the CLUMP: three or four blades from one root, splaying outward and leaning together,
 * which is how grass actually grows and which gives each tuft a silhouette instead of a
 * line. Tufts also let the density carry meaning - thick at the edges of a worked field,
 * bald where somebody walks - which a uniform carpet cannot do.
 */
export function grassTufts(
  rng: Rng,
  patch: Patch,
  options: { count?: number; height?: [number, number]; lean?: number } = {}
): THREE.BufferGeometry {
  const count = options.count ?? 120;
  const [low, high] = options.height ?? [0.09, 0.22];
  const lean = options.lean ?? 0.5;
  const pieces: THREE.BufferGeometry[] = [];

  for (let i = 0; i < count; i++) {
    const x = patch.centre.x + jitter(rng, patch.width / 2);
    const z = patch.centre.z + jitter(rng, patch.depth / 2);
    if (patch.clear && Math.hypot(x - patch.centre.x, z - patch.centre.z) < patch.clear) continue;

    const tall = range(rng, low, high);
    const blades = 2 + Math.floor(rng() * 3);
    const around = range(rng, 0, Math.PI * 2);

    for (let b = 0; b < blades; b++) {
      const h = tall * range(rng, 0.62, 1);
      // Tapered: a blade is wider at the root than at the tip, and two triangles of
      // taper is the difference between grass and a row of matchsticks.
      const blade = new THREE.CylinderGeometry(0.002, 0.011, h, 3);
      const away = around + (b / blades) * Math.PI * 2 + jitter(rng, 0.4);
      blade.translate(0, h / 2, 0);
      blade.rotateX(Math.cos(away) * lean * range(rng, 0.4, 1));
      blade.rotateZ(Math.sin(away) * lean * range(rng, 0.4, 1));
      blade.translate(x, patch.centre.y, z);
      pieces.push(blade);
    }
  }

  return mergeGeometries(pieces, false) ?? pieces[0];
}

/**
 * Rocks: faceted lumps, half-buried.
 *
 * Sunk below the ground line on purpose. A rock sitting ON grass reads as a prop dropped
 * into the scene; a rock with its bottom third underneath reads as something the field has
 * been growing around for a century, which is the difference between set dressing and
 * landscape. The non-uniform scale is what stops sixteen icosahedra from being sixteen
 * copies of one ball.
 */
export function rocks(
  rng: Rng,
  patch: Patch,
  options: { count?: number; size?: [number, number] } = {}
): THREE.BufferGeometry {
  const count = options.count ?? 9;
  const [small, big] = options.size ?? [0.08, 0.26];
  const pieces: THREE.BufferGeometry[] = [];

  for (let i = 0; i < count; i++) {
    const x = patch.centre.x + jitter(rng, patch.width / 2);
    const z = patch.centre.z + jitter(rng, patch.depth / 2);
    if (patch.clear && Math.hypot(x - patch.centre.x, z - patch.centre.z) < patch.clear) continue;

    const size = range(rng, small, big);
    const rock = new THREE.IcosahedronGeometry(size, 0);
    rock.scale(range(rng, 0.8, 1.4), range(rng, 0.45, 0.85), range(rng, 0.8, 1.4));
    rock.rotateY(range(rng, 0, Math.PI * 2));
    rock.rotateX(jitter(rng, 0.3));
    // Buried to a third, so the ground line cuts it rather than touching it.
    rock.translate(x, patch.centre.y - size * 0.3, z);
    pieces.push(rock);
  }

  return mergeGeometries(pieces, false) ?? pieces[0];
}

/** One glasshouse: frame, glazing and a door, as three separate runs. */
export interface Greenhouse {
  frame: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  base: THREE.BufferGeometry;
}

/**
 * A glasshouse for the middle distance.
 *
 * Built as a silhouette rather than as a building: what has to read at fifteen metres is
 * the RIDGE and the rhythm of the uprights, so those are heavy and everything else is a
 * pane. The glazing is one material the caller makes translucent - twenty separate panes
 * with gaps between them cost nothing here and are the only reason it reads as glass
 * rather than as a shed with a white wall.
 */
export function greenhouse(
  rng: Rng,
  options: { at: THREE.Vector3; width?: number; length?: number; wall?: number; ridge?: number }
): Greenhouse {
  const { at } = options;
  const width = options.width ?? 3.2;
  const length = options.length ?? 5.4;
  const wall = options.wall ?? 1.7;
  const ridge = options.ridge ?? 2.55;

  const frame: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];

  const bay = length / 5;
  for (let i = 0; i <= 5; i++) {
    const z = at.z - length / 2 + i * bay;
    for (const side of [-1, 1] as const) {
      const post = new THREE.BoxGeometry(0.07, wall, 0.07);
      post.translate(at.x + side * (width / 2), at.y + wall / 2, z);
      frame.push(post);

      // The rafter, from eaves to ridge. Length and pitch are solved rather than guessed
      // so the two sides always meet at the ridge whatever the caller asks for.
      const rise = ridge - wall;
      const run = width / 2;
      const rafter = new THREE.BoxGeometry(0.06, Math.hypot(rise, run), 0.06);
      rafter.rotateZ(side * Math.atan2(run, rise));
      rafter.translate(at.x + (side * width) / 4, at.y + wall + rise / 2, z);
      frame.push(rafter);
    }
  }

  const ridgeBeam = new THREE.BoxGeometry(0.08, 0.08, length);
  ridgeBeam.translate(at.x, at.y + ridge, at.z);
  frame.push(ridgeBeam);

  for (const side of [-1, 1] as const) {
    const eaves = new THREE.BoxGeometry(0.06, 0.06, length);
    eaves.translate(at.x + side * (width / 2), at.y + wall, at.z);
    frame.push(eaves);
  }

  // Panes: a little short of their bay so the frame shows between them.
  for (let i = 0; i < 5; i++) {
    const z = at.z - length / 2 + i * bay + bay / 2;
    for (const side of [-1, 1] as const) {
      const pane = new THREE.PlaneGeometry(bay * 0.9, wall * 0.88);
      pane.rotateY((side * Math.PI) / 2);
      pane.translate(at.x + side * (width / 2), at.y + wall * 0.5, z);
      glass.push(pane);

      const roof = new THREE.PlaneGeometry(bay * 0.9, Math.hypot(ridge - wall, width / 2) * 0.94);
      roof.rotateX(Math.PI / 2);
      roof.rotateZ(side * Math.atan2(width / 2, ridge - wall));
      roof.translate(at.x + (side * width) / 4, at.y + wall + (ridge - wall) / 2, z);
      glass.push(roof);
    }
  }

  /*
   * Gable ends, and a door in the near one.
   *
   * The apex triangle is new, and it was a hole rather than a shortcut: the gable was a
   * rectangle up to eaves height only, so everything above the eaves at both ends was OPEN
   * and you could see straight through the building along its length. Invisible while this
   * was scenery on a hill nine metres behind a tunnel; not invisible now that a camera pans
   * to it and it is the subject of a beat.
   */
  for (const end of [-1, 1] as const) {
    const z = at.z + (end * length) / 2;
    const gable = new THREE.PlaneGeometry(width, wall);
    gable.translate(at.x, at.y + wall / 2, z);
    glass.push(gable);

    // The triangle over it, built as a BufferGeometry because a pitched gable is not a quad.
    const apex = new THREE.BufferGeometry();
    apex.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          at.x - width / 2, at.y + wall, z,
          at.x + width / 2, at.y + wall, z,
          at.x, at.y + ridge, z,
        ],
        3
      )
    );
    /*
     * UV and INDEX, or the whole building refuses to merge.
     *
     * mergeGeometries requires every geometry in the batch to carry the SAME attribute
     * set and to agree about whether they are indexed. Every other piece of glass here is
     * a PlaneGeometry, which arrives with position, normal, uv AND an index; this apex was
     * hand-built with position only, normals computed after, and no index at all - so the
     * merge threw "All geometries must have compatible attributes" and named the apex's
     * position in the array, which is a hard error that takes the entire contact scene
     * down with it.
     *
     * A triangle's UVs are arbitrary here (the glass material is not textured), but they
     * have to EXIST for the attribute sets to match.
     */
    apex.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    apex.setIndex([0, 1, 2]);
    apex.computeVertexNormals();
    glass.push(apex);

    // And the two bargeboards under it, so the end reads as built rather than cut out.
    for (const side of [-1, 1] as const) {
      const rise = ridge - wall;
      const barge = new THREE.BoxGeometry(0.055, Math.hypot(rise, width / 2), 0.055);
      barge.rotateZ(side * Math.atan2(width / 2, rise));
      barge.translate(at.x + (side * width) / 4, at.y + wall + rise / 2, z);
      frame.push(barge);
    }
  }

  const door = new THREE.BoxGeometry(0.72, 1.5, 0.05);
  door.translate(at.x + 0.5, at.y + 0.75, at.z + length / 2 + 0.02);
  frame.push(door);

  /**
   * Two roof lights, propped open.
   *
   * The highest-value detail on the whole building and the cheapest. A glasshouse with
   * every pane flat is a MODEL of a glasshouse; one with its vents up on a hot afternoon is
   * a glasshouse somebody is working in - and this scene is specifically about a hot
   * afternoon and about somebody who is out here every day. It also breaks the roof's two
   * flat planes, which were the largest unbroken shapes in the silhouette.
   *
   * Hinged at the ridge and lifted, which is how a roof light actually opens. Different
   * angles on the two, because nobody sets them to match.
   */
  for (const [bayIndex, lift, side] of [
    [1, 0.42, -1],
    [3, 0.3, 1],
  ] as const) {
    const z = at.z - length / 2 + bayIndex * bay + bay / 2;
    const slope = Math.hypot(ridge - wall, width / 2) * 0.46;
    const vent = new THREE.PlaneGeometry(bay * 0.86, slope);
    vent.rotateX(Math.PI / 2);
    // The roof's own pitch, opened out by `lift` radians about the ridge.
    vent.rotateZ(side * (Math.atan2(width / 2, ridge - wall) - lift));
    const along = slope / 2;
    const pitch = side * (Math.atan2(width / 2, ridge - wall) - lift);
    vent.translate(
      at.x + Math.sin(pitch) * along,
      at.y + ridge - Math.cos(pitch) * along,
      z
    );
    glass.push(vent);

    // The stay holding it up. Two triangles of nothing, and it is what says "propped".
    const stay = new THREE.BoxGeometry(0.025, lift * 0.9, 0.025);
    stay.translate(at.x + side * (width / 5), at.y + ridge - 0.24, z);
    frame.push(stay);
  }

  /**
   * A bench down one side, with trays on it.
   *
   * Seen through glass at twelve metres this is three boxes, and three boxes is the
   * difference between a glass shed and a place where the tomatoes she mentions are away.
   * §187: the beat says the glasshouse is doing better than the tunnel, and the player
   * should be able to see that rather than take her word for it.
   */
  const benchTop = new THREE.BoxGeometry(width * 0.34, 0.05, length * 0.82);
  benchTop.translate(at.x - width * 0.28, at.y + 0.78, at.z);
  frame.push(benchTop);
  for (const end of [-1, 1] as const) {
    const leg = new THREE.BoxGeometry(0.06, 0.78, 0.06);
    leg.translate(at.x - width * 0.28, at.y + 0.39, at.z + end * length * 0.34);
    frame.push(leg);
  }
  for (let i = 0; i < 4; i++) {
    const tray = new THREE.BoxGeometry(width * 0.3, 0.12, length * 0.17);
    tray.translate(
      at.x - width * 0.28,
      at.y + 0.86,
      at.z - length * 0.3 + i * length * 0.2
    );
    frame.push(tray);
  }

  /**
   * A water butt on the near corner, under a downpipe off the eaves.
   *
   * Every glasshouse on every smallholding has one, and it does a job in the frame as well:
   * the building is a tall thin box on a base and there is nothing at ground level to give
   * it scale. A barrel is a known size.
   */
  const butt = new THREE.CylinderGeometry(0.29, 0.26, 0.86, 10);
  butt.translate(at.x - width / 2 - 0.34, at.y + 0.43, at.z + length / 2 - 0.5);
  frame.push(butt);
  const lid = new THREE.CylinderGeometry(0.31, 0.31, 0.04, 10);
  lid.translate(at.x - width / 2 - 0.34, at.y + 0.88, at.z + length / 2 - 0.5);
  frame.push(lid);
  const downpipe = new THREE.CylinderGeometry(0.035, 0.035, wall - 0.8, 6);
  downpipe.translate(at.x - width / 2 - 0.12, at.y + 0.8 + (wall - 0.8) / 2, at.z + length / 2 - 0.5);
  frame.push(downpipe);

  /*
   * A mid-rail down both sides.
   *
   * Glasshouse sidelights are two panes tall, not one, and the rail between them is the
   * horizontal that stops a 1.7m wall of glass reading as a single sheet. One box each side.
   */
  for (const side of [-1, 1] as const) {
    const rail = new THREE.BoxGeometry(0.05, 0.05, length);
    rail.translate(at.x + side * (width / 2), at.y + wall * 0.52, at.z);
    frame.push(rail);
  }

  // A low wall it stands on, because glass does not meet soil.
  const base = new THREE.BoxGeometry(width + 0.18, 0.22, length + 0.18);
  base.translate(at.x, at.y + 0.11, at.z + jitter(rng, 0.01));

  return {
    frame: mergeGeometries(frame, false) ?? frame[0],
    glass: mergeGeometries(glass, false) ?? glass[0],
    base,
  };
}
