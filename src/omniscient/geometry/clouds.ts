/**
 * Clouds, in the same language as everything else that grows in this game.
 *
 * ## Faceted lumps, not sprites
 *
 * The obvious way to do a cloud is a soft alpha card. It would be the only soft-edged thing
 * in a game whose trees, hedges and rocks are all faceted polyhedra, and it would fight the
 * flat-shaded look everywhere it appeared. So clouds here are built the way the tree
 * canopies are - overlapping low-poly blobs, squashed hard on the vertical - which makes
 * them read as this world's weather rather than as stock sky.
 *
 * ## Why they are unlit
 *
 * They sit well past the range of any light in these scenes and past the fog. Lighting them
 * would mean either lighting nothing, because they are outside the lamp, or inventing a
 * light for the sky. They carry their own two-tone shading instead: a lit top and a cooler
 * underside, chosen by the caller to sit against that scene's own sky. Flat colour, hard
 * edge, exactly like the hills they float over.
 *
 * ## They move, but barely
 *
 * A cloud that does not move is a painted backdrop. A cloud that moves visibly is a
 * distraction during a conversation about somebody's dying seedlings. They drift on the
 * shared wind clock at a fraction of its rate - enough that a player who looks up twice in
 * a minute sees a difference, not enough to pull the eye while they are reading.
 */

import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { jitter, range } from '../core/rng.js';

import { WIND } from './meadow.js';

import type { Rng } from '../core/rng.js';

export interface CloudOptions {
  /** How many separate clouds. Each is several overlapping lumps. */
  count?: number;
  /** Height above the ground. */
  height?: number;
  /**
   * How far out the ring of cloud stands. Must sit INSIDE the backdrop's sky shell.
   *
   * The backdrop is a cylinder of radius 52, and this is the single number that decides
   * whether any of this works. Put the clouds outside it and they are hidden behind the sky
   * entirely; put them close in and they subtend the whole frame. Both of those happened
   * before this comment existed.
   */
  radius?: number;
  /**
   * Radius of a single lump, before the squashing.
   *
   * Small. A cloud reads as distant because of ANGULAR size, and there is only 52 units of
   * depth to play with here - so the difference between "cloud on the horizon" and "purple
   * slab across the sky" is entirely in this number. At radius 44, a 6-unit lump subtends
   * about 8 degrees, which is a cloud. A 20-unit one subtends 26 degrees, which is weather
   * happening directly on top of the player.
   */
  size?: number;
  /** The sunlit top. */
  top: string;
  /** The cooler underside, which is what makes them read as volumes rather than shapes. */
  underside: string;
  /** Metres per second of drift. Small. */
  drift?: number;
}

export interface CloudLayer {
  root: ENGINE.SceneNode;
  /** Registered as a prop idle by the scene, the same way the meadow's wind is. */
  idle: (deltaTime: number) => void;
}

/**
 * A sky's worth of cloud, as one node with two draw calls.
 *
 * Two meshes rather than one because tops and undersides are different colours, and two
 * flat colours is the cheapest possible way to say "these have a shape" without a light
 * touching them.
 */
export function clouds(rng: Rng, options: CloudOptions): CloudLayer {
  const count = options.count ?? 9;
  const height = options.height ?? 30;
  const radius = options.radius ?? 44;
  const size = options.size ?? 6;
  const drift = options.drift ?? 0.35;

  const tops: THREE.BufferGeometry[] = [];
  const bellies: THREE.BufferGeometry[] = [];

  for (let c = 0; c < count; c++) {
    /*
     * On a ring rather than scattered through the volume.
     *
     * A cloud directly above a camera that is looking at the horizon is off-frame at best
     * and a ceiling at worst. Everything a ground-level shot actually sees is in a band
     * around the outside, so that is the only place worth spending polygons.
     */
    const theta = range(rng, 0, Math.PI * 2);
    const dist = radius * range(rng, 0.74, 1);
    const cx = Math.sin(theta) * dist;
    const cz = Math.cos(theta) * dist;
    const cy = height + jitter(rng, height * 0.3);
    const lumpSize = size * range(rng, 0.7, 1.3);

    for (let i = 0; i < 3 + Math.floor(rng() * 4); i++) {
      const lump = new THREE.IcosahedronGeometry(lumpSize * range(rng, 0.5, 1), 0);
      /*
       * Squashed hard. A cloud is far wider than it is tall, and an unsquashed icosahedron
       * reads as a boulder in the sky.
       */
      lump.scale(range(rng, 1.3, 2.1), range(rng, 0.34, 0.5), range(rng, 0.9, 1.4));
      lump.rotateY(range(rng, 0, Math.PI * 2));
      lump.translate(
        cx + range(rng, -lumpSize, lumpSize) * 1.2,
        cy + jitter(rng, lumpSize * 0.16),
        cz + range(rng, -lumpSize, lumpSize) * 0.7
      );
      tops.push(lump);

      /*
       * The underside, pulled in hard so the lit colour survives as a rim.
       *
       * At 0.94 the belly was almost the same footprint as the top, and since the camera is
       * always BELOW these it covered the warm colour completely - the `top` option was
       * paying for geometry nobody could ever see. Shrunk to four fifths, the top now shows
       * as a bright edge all the way around every silhouette, which is exactly what a low
       * sun does to cloud and the one detail that separates evening from overcast.
       */
      const belly = lump.clone();
      belly.scale(0.8, 0.5, 0.8);
      belly.translate(0, -lumpSize * 0.16, 0);
      bellies.push(belly);
    }
  }

  const flat = (color: string): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color), fog: false });

  const root = ENGINE.SceneNode.create({ name: 'Clouds', position: new THREE.Vector3() });
  root.add(new THREE.Mesh(mergeGeometries(bellies, false) ?? bellies[0], flat(options.underside)));
  root.add(new THREE.Mesh(mergeGeometries(tops, false) ?? tops[0], flat(options.top)));

  /**
   * Drift as rotation, not translation.
   *
   * Sliding the ring sideways would carry half of it out through the sky shell and it would
   * vanish mid-shot. Turning it keeps every cloud at the distance it was authored for,
   * forever, and needs no wrap - the sky simply never runs out. At this radius a hundredth
   * of a radian per second is a few metres of travel, which is the pace of real high cloud
   * and slow enough that nobody notices it during a conversation.
   *
   * Driven off the shared wind clock rather than its own, so the clouds and the grass are
   * moved by the same weather - which costs nothing and is the sort of agreement nobody
   * notices except when it is missing.
   */
  return {
    root,
    idle: (): void => {
      root.rotation.y = WIND.uTime.value * drift * 0.01;
    },
  };
}
