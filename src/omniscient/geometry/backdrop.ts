/**
 * The night behind Tomas's mast.
 *
 * ## What was wrong
 *
 * §241: backgrounds are value and layers, not more props. This scene had neither. Behind
 * the lattice there was a three-metre slab, one flat plane out at z = -19 standing in for
 * the sea, and then nothing - and because the atmosphere fades everything to a neutral by
 * twenty-six units, that plane arrived on screen as a sheet of pale grey with pure black
 * above it. The player spends an entire mission looking at a light going out, framed
 * against a void.
 *
 * ## What §230 took from the reference frame, restated as geometry
 *
 * "The figure as a black silhouette against the only bright thing in the frame; the town
 * as a band of small warm lights at the base of a cold picture; layered depth - rail,
 * figure, sea, light, cloud." Every one of those is a LAYER at a different distance, and
 * the scene owned two of them. This module adds the rest, in four draw calls:
 *
 *   sky       a painted vertical gradient on a cylinder at 52 units, with a soft cloud
 *             band and a glow where the moon actually is
 *   sea       a disc with a painted radial gradient - darker underfoot, lifting toward
 *             the horizon, which is the cheapest depth cue there is
 *   coast     a broken silhouette across the far arc, so the horizon is a coastline
 *             rather than a ruled line
 *   town      the band of small warm lights, at the foot of the coast
 *
 * The default shot points 2° below horizontal with a 46° lens, so the horizon sits about
 * a quarter of the way up the frame and roughly three quarters of what the player sees is
 * sky. That is the whole argument for painting it.
 *
 * ## §231, and why all of this is unlit
 *
 * There is no post-process, no fog exemption by depth and no volumetrics. Distance here
 * is not simulated, it is painted: every surface below is a MeshBasicMaterial carrying a
 * canvas, with `fog: false` because the atmosphere is tuned for a diorama eight units
 * across and would flatten a forty-unit backdrop into one colour, and `toneMapped: false`
 * because the entire point of authoring a gradient is that the value you paint is the
 * value that arrives.
 *
 * ## §232
 *
 * Nothing here is allowed above 0.32 luma except the town lights. The beacon is the
 * brightest thing on this headland and must stay so through the three and a half seconds
 * in every eleven when it is out - so the backdrop's ceiling is set below the beacon's
 * dark-phase floor, and the lights that break it are four pixels across.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { createDecal } from '../art/surface.js';
import { fbm, smoothstep } from '../art/noise.js';
import { createRng, range, seedFrom } from '../core/rng.js';

export interface BackdropPart {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/** Where the backdrop's shells live. Everything is measured off these. */
const SKY_RADIUS = 52;
const SKY_BOTTOM = -7;
/**
 * High enough for the beacon shot.
 *
 * That camera sits at y 4.6 and pitches 16° up at a 46° lens, so the top of its frame
 * reaches 39° above horizontal - which at 52 units out is y = 47. A cylinder that stopped
 * at 30 would have shown its own open rim across the top of the one shot in this mission
 * that looks at the sky.
 */
const SKY_TOP = 50;
const SEA_Y = -5.5;
/**
 * Where the near coast stands. Well inside the sky shell, and that clearance is the point.
 *
 * The far ridge was first placed at COAST_RADIUS + 5 with COAST_RADIUS at 41, which is 46
 * - the sky's own radius. It spent a whole iteration invisible inside the cylinder wall
 * while its height was blamed for it. There is now six units of ridge separation and
 * still eight units of clearance to the sky, so nothing can wander into it.
 */
const COAST_RADIUS = 38;

/**
 * The near ridge's own shape, named because the town stands on it.
 *
 * These were literals in two places and the coast changed height without the town being
 * told, which put a dozen streetlights back in the sky - the exact bug the shared
 * `coastProfile` was extracted to prevent, reintroduced through the parameters instead of
 * through the function.
 */
const NEAR_COAST = { lift: 2.54, relief: 3.04 } as const;

/**
 * The arc the cameras look into.
 *
 * All three shots sit out at +x +z and aim at the mast, so the background they see is the
 * opposite quadrant. The coast and the town are built across that arc only - a full ring
 * would enclose the headland in land and lose the open sea, which is half of why anybody
 * puts a light here.
 *
 * Cylinder convention: theta 0 is +z and increases toward +x, so the direction away from
 * the cameras is atan2(-1, -1) wrapped into [0, 2pi).
 */
const AWAY = Math.atan2(-1, -1) + Math.PI * 2;
const COAST_ARC = 2.0;

function basic(map: THREE.Texture, side: THREE.Side = THREE.FrontSide): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map, side, fog: false, toneMapped: false });
}

function flat(color: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    fog: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

/** World height -> the cylinder's own v, so the gradient can be authored in metres. */
function skyV(y: number): number {
  return (y - SKY_BOTTOM) / (SKY_TOP - SKY_BOTTOM);
}

/**
 * The sky.
 *
 * Three things, in order of how much work they do:
 *
 * 1. A vertical gradient, authored in world height rather than in texture space. A night
 *    sky is lightest at the horizon and darkest overhead, and getting that one relation
 *    right is most of what makes a painted sky read as sky rather than as a wall.
 * 2. A cloud band, soft and low-contrast. §230 keeps the cloud LAYER and abandons the
 *    cloud detail, which is exactly this: something is up there, and it has no edges.
 * 3. A glow where the moon is. The scene is lit by a point light and until now the sky had
 *    no idea - so the BEARING is read off that light's position rather than typed in, and
 *    if the moon moves round the headland the glow moves with it.
 */
export function skyTexture(moon: THREE.Vector3): THREE.CanvasTexture | null {
  // Same convention as the cylinder: theta measured from +z toward +x.
  const moonU = ((Math.atan2(moon.x, moon.z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
  /**
   * The glow's HEIGHT is authored, not derived, and that is deliberate.
   *
   * The moonlight is a point light five units from the mast at y 5.5, which is a
   * forty-five degree elevation - a moon nearly overhead. But that position was chosen to
   * put a cool rim on the lattice and on Tomas, not to say where the moon is; taken
   * literally it would paint the glow at the top of the shell where no shot ever looks.
   *
   * A low moon over the sea is both the better picture and the more honest reading of the
   * lighting, because a low moon is what puts a rim on the seaward side of everything -
   * which is what the SeaGlow light in this scene is already standing in for.
   */
  const moonV = skyV(9);

  const texture = createDecal(512, 512, (ctx, w, h) => {
    // -- The gradient, in metres --------------------------------------------
    const sky = ctx.createLinearGradient(0, h, 0, 0);
    const stops: ReadonlyArray<readonly [number, string]> = [
      // Lifted hard at the bottom after a capture. The first set put the horizon at
      // #313d4b, which left the far ridge four per cent off the sky it was supposed to
      // stand against - present in the buffer, invisible to a person. A night sky IS much
      // lighter at the horizon than overhead, and that difference is what a silhouette
      // needs to exist at all. Ceiling is 0.29 luma, under the §232 limit at the top.
      [SKY_BOTTOM, '#43505f'],
      [SEA_Y, '#404d5c'],
      [0, '#2e3948'],
      [8, '#1e2734'],
      [22, '#161c28'],
      [SKY_TOP, '#10141d'],
    ];
    for (const [y, color] of stops) sky.addColorStop(skyV(y), color);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // -- Moon glow ----------------------------------------------------------
    // Wide and weak. A tight halo would read as a second beacon, and there is only one
    // light in this mission that is allowed to be the brightest thing in the frame.
    const glow = ctx.createRadialGradient(
      moonU * w,
      (1 - moonV) * h,
      0,
      moonU * w,
      (1 - moonV) * h,
      w * 0.42
    );
    glow.addColorStop(0, 'rgba(150,176,205,0.30)');
    glow.addColorStop(0.45, 'rgba(120,146,180,0.11)');
    glow.addColorStop(1, 'rgba(120,146,180,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // -- Cloud band ---------------------------------------------------------
    const seed = seedFrom('headland-cloud');
    const grain = createRng(seedFrom('headland-sky-grain'));
    const image = ctx.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      // Canvas row 0 is the top, and createDecal has already arranged for that to land at
      // the top of the cylinder, so v here counts down from the zenith.
      const v = 1 - y / h;
      // Two bands: a broad one low over the sea and a thinner one above it. Both die out
      // well before the zenith, because cloud at the zenith is just noise on a dark field.
      const low = smoothstep(skyV(-2), skyV(6), v) * (1 - smoothstep(skyV(9), skyV(17), v));
      const high = smoothstep(skyV(12), skyV(19), v) * (1 - smoothstep(skyV(22), skyV(31), v));
      const band = low * 0.85 + high * 0.4;

      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;

        if (band > 0.002) {
          const u = x / w;
          // Stretched hard along u: cloud is wider than it is tall, and the same noise
          // that reads as smoke at 1:1 reads as weather pulled out sideways.
          const shape = fbm(seed, u * 2.4, v * 7, { frequency: 3, octaves: 4 });
          const lift = Math.max(0, shape - 0.44) * band * 96;
          if (lift > 0) {
            image.data[p] = Math.min(255, image.data[p] + lift * 0.86);
            image.data[p + 1] = Math.min(255, image.data[p + 1] + lift * 0.94);
            image.data[p + 2] = Math.min(255, image.data[p + 2] + lift);
          }
        }

        /**
         * Dither.
         *
         * A gradient this shallow across this many pixels is the textbook case for 8-bit
         * banding, and the first capture had visible steps across the upper sky. Two
         * levels of per-pixel noise costs nothing, is invisible at any distance, and is
         * the difference between a painted sky and a contour map.
         */
        const n = (grain() - 0.5) * 3.2;
        image.data[p] = Math.max(0, Math.min(255, image.data[p] + n));
        image.data[p + 1] = Math.max(0, Math.min(255, image.data[p + 1] + n));
        image.data[p + 2] = Math.max(0, Math.min(255, image.data[p + 2] + n));
      }
    }
    ctx.putImageData(image, 0, 0);
  });

  if (texture) {
    // The cylinder wraps a full turn, so the texture has to as well or there is a seam
    // down the sky at theta = 0.
    texture.wrapS = THREE.RepeatWrapping;
    texture.needsUpdate = true;
  }
  return texture;
}

/**
 * The sea.
 *
 * A radial gradient, darkest under the mast and lifting toward the horizon. That single
 * relation does the whole job: an evenly coloured plane reads as a floor at whatever
 * distance the eye guesses, and one that gets lighter as it recedes reads as water going
 * away from you. It is also the honest version of the effect the atmosphere was producing
 * by accident before - the difference being that this one stops at the right value
 * instead of continuing until the sea is brighter than the sky.
 *
 * §230 abandoned the wet specular on the sea, so there is no moon path on the water. The
 * temptation is real and it is a lens effect on a surface that has no waves.
 */
export function seaTexture(): THREE.CanvasTexture | null {
  return createDecal(256, 256, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.5);
    gradient.addColorStop(0, '#141d27');
    gradient.addColorStop(0.22, '#18222d');
    // The horizon sits at 46 of the disc's 55-unit half-width.
    gradient.addColorStop((SKY_RADIUS / 55) * 0.5, '#2a3542');
    gradient.addColorStop(1, '#2a3542');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * The shape of a coastline, as one continuous function of how far round the arc you are.
 *
 * Shared, because the town has to stand ON the coast rather than near it. The first
 * version scattered lights between two heights chosen by eye and put a dozen of them
 * above the silhouette, hanging in the sky - which is the sort of thing that looks like a
 * rendering bug rather than like a mistake, and is therefore worse than one.
 *
 * Two sine terms at incommensurate rates make the headlands and a third roughens the top
 * line. No RNG: a coastline is continuous, and a per-sample random height turns a ridge
 * into a saw.
 */
function coastProfile(t: number, radius: number, lift: number, relief: number): {
  theta: number;
  radius: number;
  top: number;
} {
  /**
   * Rates chosen against the ARC IN VIEW, not against the whole ribbon.
   *
   * The coast runs 229 degrees and the camera sees about 46 of them, so t only moves
   * through a fifth of its range on screen. At the first rates the visible stretch got
   * less than one full swell and the horizon came out as a single smooth curve - the
   * geometry of a circle in perspective, not a coastline. These are roughly tripled, so
   * three or four headlands fall inside the frame.
   */
  const swell = Math.max(0, Math.sin(t * 21 + 1.2) * 0.5 + Math.sin(t * 6.4) * 0.5);
  return {
    theta: AWAY - COAST_ARC + t * COAST_ARC * 2,
    radius: radius + Math.sin(t * 15 + 0.7) * 2.4 + Math.sin(t * 34) * 0.9,
    top: SEA_Y + lift + swell * relief + Math.sin(t * 71) * 0.18,
  };
}

/**
 * A coast, as a ribbon.
 *
 * The first attempt built this from boxes and it came out crenellated: adjacent blocks
 * sat at different radii, so the arc opened gaps that showed sky THROUGH the land, and
 * every block's flat top met its neighbour's in a visible step. From the camera it read
 * as a battlement. A silhouette is the one thing that has to be continuous, so this is
 * one triangle strip - two vertices per sample, no seams available to open.
 *
 * DoubleSide, and that is load-bearing rather than lazy. The ribbon is a curve that bends
 * both ways round a circle, so a single winding faces the camera on one part of the arc
 * and away from it on another. `flat()` said DoubleSide in this comment and did not set
 * it, and the far ridge was silently culled for two iterations while its height and then
 * its colour were both blamed - it only came out under a magenta test material, which is
 * the tool to reach for the moment "it should be there and it is not" happens twice.
 */
function silhouetteRibbon(
  name: string,
  base: number,
  color: string,
  arc: number,
  sample: (t: number) => { theta: number; radius: number; top: number },
  /**
   * Optional colour at the top edge, blended from `color` at the base.
   *
   * A ribbon is two rows of vertices, so a colour attribute across them is a free vertical
   * gradient - no texture, no extra draw call, and it interpolates in the same space the
   * geometry does. Used for the far shore, where a hard line between sand and grass is the
   * one thing a shoreline never has.
   */
  topColor?: string
): BackdropPart {
  // Enough to resolve the roughest term in any profile without stepping it.
  const samples = 260;
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  void arc;

  const low = new THREE.Color(color);
  const high = topColor ? new THREE.Color(topColor) : null;

  for (let i = 0; i <= samples; i++) {
    const p = sample(i / samples);
    const x = Math.sin(p.theta) * p.radius;
    const z = Math.cos(p.theta) * p.radius;
    positions.push(x, base, z, x, p.top, z);
    if (high) colors.push(low.r, low.g, low.b, high.r, high.g, high.b);
  }
  for (let i = 0; i < samples; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (high) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  const material = flat(color);
  if (high) {
    material.vertexColors = true;
    // The base colour is carried by the attribute now; leaving it on the material as well
    // would multiply the two and darken the whole ribbon.
    material.color.set('#ffffff');
  }
  return { name, geometry, material };
}

function coastRibbon(
  name: string,
  radius: number,
  lift: number,
  relief: number,
  color: string
): BackdropPart {
  return silhouetteRibbon(name, SEA_Y - 1.4, color, COAST_ARC, (t) =>
    coastProfile(t, radius, lift, relief)
  );
}

/**
 * Two coasts, at two distances and two values.
 *
 * This is the cheapest depth in the whole scene. One ridge is a horizon; two ridges with
 * the further one lighter is aerial perspective, and the eye reads the gap between them
 * as kilometres without being told anything. Both stay well under the beacon - see the
 * §232 note at the top of the file.
 */
function coastParts(): BackdropPart[] {
  /*
   * Heights worked backwards from the default camera rather than picked by eye. It sits
   * at y 3.9 and the sea's visible edge - where the water passes behind the sky shell -
   * is 11.6 degrees below horizontal, so:
   *
   *   near ridge, 38 units out: base at the waterline, headlands 4.5 degrees above it
   *   far ridge,  44 units out: base 3 degrees above it, peaks 8
   *
   * With the sky shell at 52 the sea's edge is 10.2 degrees below horizontal, which is
   * where those numbers come from. Move SKY_RADIUS and these have to be re-derived.
   *
   * Which puts the near coast exactly on the horizon line the sea already draws, and the
   * far one clear above it in a lighter value. That is the whole illusion.
   */
  return [
    coastRibbon('CoastFar', COAST_RADIUS + 6, 3.81, 3.87, '#212b38'),
    coastRibbon('Coast', COAST_RADIUS, NEAR_COAST.lift, NEAR_COAST.relief, '#10161e'),
  ];
}

/**
 * The town.
 *
 * §230's single most valuable note about this frame: the town as a band of small warm
 * lights at the base of a cold picture. It is the only warm thing here other than the
 * beacon, and unlike the beacon it never goes out - which matters more than it sounds,
 * because for three and a half seconds in every eleven these lights are the only evidence
 * that the harbour Tomas is fixing this for has anybody in it.
 *
 * Clustered rather than scattered. Towns are clusters; an even sprinkle along a coast
 * reads as runway markers. Two brightness groups at two sizes, and each is one merged
 * geometry, so the whole town is two draw calls.
 *
 * Sizes are set against the shimmer they cause, not against realism: at forty units a
 * 16cm box is four or five pixels, which survives the camera pushing in. Anything smaller
 * crawls in and out of existence as the lens moves, and a light that flickers when the
 * camera moves is worse than no light at all in a mission about a light that flickers.
 */
function townParts(): BackdropPart[] {
  const rng = createRng(seedFrom('headland-town'));

  const dim: THREE.BufferGeometry[] = [];
  const bright: THREE.BufferGeometry[] = [];

  // Four settlements along the shore, of different sizes, plus the harbour.
  const clusters: ReadonlyArray<readonly [number, number, number]> = [
    // [offset along the arc in radians, spread, count]
    [-1.35, 0.16, 12],
    [-0.55, 0.26, 22],
    [0.15, 0.34, 30],
    [1.05, 0.2, 14],
  ];

  // Arc position, expressed the way coastProfile wants it, so a light can ask the coast
  // how high the land is underneath it.
  const asT = (offset: number): number => (offset + COAST_ARC) / (COAST_ARC * 2);

  for (const [offset, spread, count] of clusters) {
    for (let i = 0; i < count; i++) {
      const jitterOffset = offset + range(rng, -spread, spread);
      const ground = coastProfile(asT(jitterOffset), COAST_RADIUS, NEAR_COAST.lift, NEAR_COAST.relief);
      // Between the waterline and the top of the land at this bearing, weighted low -
      // towns are on the shore and only a few houses are up the hill. Clamped to the
      // silhouette, because a light above the ridge is a light in the sky.
      const climb = rng() < 0.78 ? rng() * 0.3 : 0.3 + rng() * 0.55;
      const y = SEA_Y + 0.2 + climb * Math.max(0.4, ground.top - SEA_Y - 0.6);

      const isBright = rng() < 0.28;
      const size = isBright ? 0.24 : 0.16;
      const light = new THREE.BoxGeometry(size, size * 0.8, size);
      // Slightly in front of the ridge it stands on, or z-fighting decides which of a
      // light and a hillside the player sees.
      const radius = ground.radius - range(rng, 0.4, 1.8);
      light.translate(Math.sin(ground.theta) * radius, y, Math.cos(ground.theta) * radius);
      (isBright ? bright : dim).push(light);
    }
  }

  // The harbour itself: a tight line of lights along a quay, which is the one piece of
  // the town that should read as a made thing rather than as a scatter.
  for (let i = 0; i < 9; i++) {
    const t = asT(0.15 - 0.09 + (i / 8) * 0.18);
    const quay = coastProfile(t, COAST_RADIUS, NEAR_COAST.lift, NEAR_COAST.relief);
    const light = new THREE.BoxGeometry(0.2, 0.16, 0.2);
    light.translate(
      Math.sin(quay.theta) * (quay.radius - 1.6),
      SEA_Y + 0.3,
      Math.cos(quay.theta) * (quay.radius - 1.6)
    );
    bright.push(light);
  }

  return [
    { name: 'TownFar', geometry: mergeGeometries(dim, false) ?? dim[0], material: flat('#8a6134') },
    {
      name: 'TownNear',
      geometry: mergeGeometries(bright, false) ?? bright[0],
      material: flat('#e2ac68'),
    },
  ];
}

/**
 * Everything behind the mast, as parts the caller turns into meshes.
 *
 * Returns nothing without a canvas to paint on, which is what the preview harnesses have.
 * They walk the mission graph and never render, so a backdrop they cannot paint is a
 * backdrop they do not need.
 */
// ---------------------------------------------------------------------------------------
// Daylight
// ---------------------------------------------------------------------------------------

const FIELD_SKY_RADIUS = 62;
const FIELD_SKY_BOTTOM = -3;
const FIELD_SKY_TOP = 60;
/** Where the hedgerow that closes the field stands. */
const HEDGE_RADIUS = 42;

function fieldSkyV(y: number): number {
  return (y - FIELD_SKY_BOTTOM) / (FIELD_SKY_TOP - FIELD_SKY_BOTTOM);
}

/**
 * Daylight sky.
 *
 * Adaeze's tunnel is an outdoor scene at midday and it was standing in a void: nine metres
 * of ground and then pure black in every direction, with a tree whose canopy floated
 * unattached above the frame because there was nothing behind it to attach to. It had
 * become the weakest scene in the game the moment the mast stopped being it.
 *
 * The same three moves as the night sky and one addition. Lightest at the horizon and
 * deepest overhead, which is the relation that makes a painted sky read as sky; a warm
 * pale band low down, because haze at the horizon is what puts distance into a landscape;
 * a soft cloud layer; and per-pixel dither, because a shallow gradient across this many
 * pixels bands in eight bits and does it worse in daylight than at night.
 *
 * §232 for a daylight backdrop is the awkward one: a real sky is brighter than anything in
 * the scene, and this scene's hero is a difference between two beds of seedlings on the
 * GROUND. So the sky is deliberately hazed rather than saturated, and it is kept out of
 * the lower third of every registered shot by the hedgerow - the player looks down at the
 * rows and the sky is above and behind, doing its job as depth rather than as subject.
 */
export function fieldSkyTexture(sun: THREE.Vector3): THREE.CanvasTexture | null {
  const sunU = ((Math.atan2(sun.x, sun.z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);

  const texture = createDecal(512, 512, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, h, 0, 0);
    /**
     * Evening, not afternoon.
     *
     * This scene is the one with a horizon in it - every other set is a room or a road with
     * something across the end of it - so it is the only one that can carry a sky. The
     * gradient does the work: hot near the ground where the sun is, through amber and a
     * rose band, into a blue that is already going violet at the top.
     *
     * Six stops rather than four, and they are close together low down. A sunset is not a
     * smooth ramp from orange to blue; almost all of the colour happens in the ten degrees
     * above the horizon, and spacing the stops evenly is what makes a sky look like a
     * gradient somebody applied.
     */
    const stops: ReadonlyArray<readonly [number, string]> = [
      /*
       * Afternoon, not sunset.
       *
       * The gradient still runs warm-to-cool bottom-to-top, because that is what any sky
       * does - the horizon is always paler and warmer than the zenith, since you are looking
       * through far more atmosphere at it. What changes is where the whole ramp sits: a
       * sunset is orange at the bottom and violet at the top, an afternoon is a pale warm
       * haze at the bottom and a strong blue overhead. Same shape, different register.
       */
      [FIELD_SKY_BOTTOM, '#e8eef0'],
      [0, '#d6e5ef'],
      [4, '#bcd8ec'],
      [10, '#9cc4e6'],
      [20, '#74a9db'],
      [36, '#5189c9'],
      [FIELD_SKY_TOP, '#3f74b6'],
    ];
    for (const [y, color] of stops) sky.addColorStop(fieldSkyV(y), color);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Where the sun is. Not a disc - a disc in an unlit backdrop is a sticker, and the
    // §230 line about abandoning anything a lens did applies to flare as much as bloom.
    // This is the brightening AROUND a sun, which is something the air does.
    const glow = ctx.createRadialGradient(
      sunU * w,
      (1 - fieldSkyV(14)) * h,
      0,
      sunU * w,
      (1 - fieldSkyV(14)) * h,
      w * 0.46
    );
    glow.addColorStop(0, 'rgba(255,246,222,0.42)');
    glow.addColorStop(0.4, 'rgba(255,242,214,0.14)');
    glow.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    const seed = seedFrom('field-cloud');
    const grain = createRng(seedFrom('field-sky-grain'));
    const image = ctx.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      const v = 1 - y / h;
      const band =
        smoothstep(fieldSkyV(4), fieldSkyV(16), v) * (1 - smoothstep(fieldSkyV(26), fieldSkyV(48), v));

      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        if (band > 0.002) {
          const shape = fbm(seed, (x / w) * 2.2, v * 6, { frequency: 3, octaves: 4 });
          const lift = Math.max(0, shape - 0.5) * band * 150;
          if (lift > 0) {
            image.data[p] = Math.min(255, image.data[p] + lift);
            image.data[p + 1] = Math.min(255, image.data[p + 1] + lift * 0.98);
            image.data[p + 2] = Math.min(255, image.data[p + 2] + lift * 0.92);
          }
        }
        const n = (grain() - 0.5) * 3.2;
        for (let c = 0; c < 3; c++) {
          image.data[p + c] = Math.max(0, Math.min(255, image.data[p + c] + n));
        }
      }
    }
    ctx.putImageData(image, 0, 0);
  });

  if (texture) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.needsUpdate = true;
  }
  return texture;
}

/**
 * The field, running out to the hedge.
 *
 * Radial gradient again, and for the same reason: dry ground under the camera, hazing to
 * the colour of the sky at the horizon. That gradient IS aerial perspective, and with the
 * atmosphere switched off on this surface there is nothing else to supply it.
 */
export function fieldTexture(): THREE.CanvasTexture | null {
  return createDecal(256, 256, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.5);
    /**
     * Greener, and it matters more than it sounds.
     *
     * These were olive-greys - 0x6b6a45 at the centre out to a near-neutral 0xa3aa96 - and
     * with the sky above them at a similar value the whole scene sat in a ten-point band of
     * desaturated grey-green. Nothing was wrong with any single colour; the problem was
     * that the field, the hills and the sky were all the SAME colour at slightly different
     * brightnesses, so there was no depth to read and nothing for a person standing on it
     * to be a different colour from.
     *
     * Saturated near the camera and desaturating with distance, which is what aerial
     * perspective actually does, and now the far end genuinely reads as far rather than as
     * a slightly lighter version of the near end.
     */
    // Evening green: cooler and darker, because the light is coming from the side now and
    // the field is mostly in its own shadow. See the sky stops above.
    gradient.addColorStop(0, '#4a5a2d');
    gradient.addColorStop(0.18, '#66753a');
    gradient.addColorStop((HEDGE_RADIUS / 70) * 0.5, '#84906a');
    gradient.addColorStop(1, '#a2ac95');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * Everything behind Adaeze's tunnel.
 *
 * The hedge is one ribbon rather than two, unlike the coast: it is the boundary of one
 * field, so a second line behind it would read as a second hedge rather than as distance.
 * The depth here comes from the field's own gradient instead.
 */
export function createFieldBackdrop(sun: THREE.Vector3): BackdropPart[] {
  const sky = fieldSkyTexture(sun);
  const field = fieldTexture();
  if (!sky || !field) return [];

  const parts: BackdropPart[] = [];

  const shell = new THREE.CylinderGeometry(
    FIELD_SKY_RADIUS,
    FIELD_SKY_RADIUS,
    FIELD_SKY_TOP - FIELD_SKY_BOTTOM,
    48,
    1,
    true
  );
  shell.translate(0, (FIELD_SKY_TOP + FIELD_SKY_BOTTOM) / 2, 0);
  parts.push({ name: 'Sky', geometry: shell, material: basic(sky, THREE.BackSide) });

  // Just below the scene's own ground slab, whose top face is y = 0. A centimetre of step
  // at forty metres is nothing; z-fighting across a nine-metre plane is not.
  const ground = new THREE.PlaneGeometry(140, 140);
  ground.rotateX(-Math.PI / 2);
  ground.translate(0, -0.02, 0);
  parts.push({ name: 'Field', geometry: ground, material: basic(field) });

  // The hedge and the trees in it. All the way round: unlike the headland there is no
  // reason for a field to be open on one side, and closing it is what makes the tunnel
  // sit IN somewhere rather than ON something.
  /**
   * A far range, hazed, standing behind the hedge.
   *
   * ## Why it exists
   *
   * There was one ribbon and it was doing two jobs: the boundary of the field and the
   * landscape beyond it. One silhouette at one distance in one colour cannot be both, so the
   * far country had no depth - it read as a green wall with bumps on it.
   *
   * ## The haze is the whole point
   *
   * Distance in a landscape is not size, it is CONTRAST. Air scatters light, so the further
   * something is the more sky gets mixed into it: it goes paler, bluer and lower in contrast
   * until it disappears into the horizon. That is the only cue the eye needs, and it works
   * even when everything is a flat colour - which is lucky, because everything here is.
   *
   * So this range is authored most of the way toward the sky it stands against. It is barely
   * separable from the sky on purpose. Anything more definite reads as near.
   *
   * ## Shape
   *
   * Ridges, not bumps. A single sine gives circles, which is what the hedge's tree term was
   * producing and why the far country looked like a row of green balls. Real ranges are
   * asymmetric - a long shoulder up to a summit and a shorter drop off it - so the profile
   * here stacks three frequencies and then raises the result to a power, which sharpens the
   * peaks and flattens the valleys between them. That one exponent is most of the difference
   * between hills and beads.
   */
  parts.push(
    silhouetteRibbon('FarRange', -0.6, '#9db4c4', Math.PI, (t) => {
      const theta = t * Math.PI * 2;
      const ridge =
        Math.sin(t * 5.3 + 0.4) * 0.55 + Math.sin(t * 11.7 + 2.2) * 0.3 + Math.sin(t * 2.1) * 0.4;
      // Raised to a power to sharpen summits and flatten the ground between them.
      const shaped = Math.pow(Math.max(0, ridge * 0.5 + 0.5), 1.9);
      return {
        theta,
        radius: HEDGE_RADIUS + 11,
        top: 3.0 + shaped * 12.5,
      };
    })
  );

  /**
   * A middle range, half-hazed, between the far one and the hedge.
   *
   * §241: depth in a background comes from LAYERS at separated values, not from detail. Two
   * ribbons is a backdrop; three is a landscape, and the middle one is what turns the gap
   * between the other two into distance rather than into a gap.
   */
  parts.push(
    silhouetteRibbon('MidRange', -0.6, '#6f8a76', Math.PI, (t) => {
      const theta = t * Math.PI * 2;
      const ridge = Math.sin(t * 8.1 + 1.9) * 0.5 + Math.sin(t * 17.3 + 0.7) * 0.28;
      const shaped = Math.pow(Math.max(0, ridge * 0.5 + 0.5), 1.6);
      return {
        theta,
        radius: HEDGE_RADIUS + 5,
        top: 2.4 + shaped * 7.0,
      };
    })
  );

  /**
   * The far bank.
   *
   * The near shore fades sand to grass across the ground mesh, and the far side had the
   * water meeting a dark hedge at a hard line - which is the one thing a shoreline never
   * does. This is a short ribbon just inside the hedge, so the hedge still closes the
   * field behind it and this only fills the half-metre where the water arrives.
   *
   * It works everywhere without an arc test because of what is in front of it: the water
   * runs out to z = -95, well past this ring, so wherever the lake is visible this is the
   * first thing that stops it, and wherever the lake is not visible the meadow ground is
   * already covering this height. The band is only ever seen where there is water to meet.
   *
   * Both colours are pulled toward the sky the way §261's distances are - a beach at forty
   * metres is not the colour of a beach at four. The near sand is #e0cfae; this is that
   * with a third of the haze already mixed in, so it belongs to the same shore seen from
   * further off rather than reading as a brighter one.
   */
  parts.push(
    silhouetteRibbon(
      'FarShore',
      -0.6,
      '#cdc4a8',
      Math.PI,
      (t) => ({
        theta: t * Math.PI * 2,
        radius: HEDGE_RADIUS - 0.6,
        // Wanders, because a bank cut to a constant height is a kerb. The fine term keeps
        // the fade line from being straight enough to read as geometry.
        top: 0.62 + Math.sin(t * 21 + 0.9) * 0.16 + Math.sin(t * 61) * 0.06,
      }),
      '#8b9a72'
    )
  );

  // The hedge and the trees in it. All the way round: unlike the headland there is no
  // reason for a field to be open on one side, and closing it is what makes the tunnel
  // sit IN somewhere rather than ON something.
  parts.push(
    silhouetteRibbon('Hedge', -0.6, '#4a5744', Math.PI, (t) => {
      const theta = t * Math.PI * 2;
      // A hedge is a hedge with trees standing in it. The low term is the hedge, the
      // sparse high one is the trees, and the fine term keeps the top from being a rule.
      const trees = Math.max(0, Math.sin(t * 47 + 0.6) * 0.6 + Math.sin(t * 13 + 2.1) * 0.5 - 0.35);
      return {
        theta,
        radius: HEDGE_RADIUS + Math.sin(t * 9 + 1.4) * 2.6,
        top: 2.1 + trees * 7.5 + Math.sin(t * 130) * 0.3,
      };
    })
  );

  return parts;
}

export function createNightBackdrop(moon: THREE.Vector3): BackdropPart[] {
  const sky = skyTexture(moon);
  const sea = seaTexture();
  if (!sky || !sea) return [];

  const parts: BackdropPart[] = [];

  const shell = new THREE.CylinderGeometry(
    SKY_RADIUS,
    SKY_RADIUS,
    SKY_TOP - SKY_BOTTOM,
    48,
    1,
    true
  );
  shell.translate(0, (SKY_TOP + SKY_BOTTOM) / 2, 0);
  parts.push({ name: 'Sky', geometry: shell, material: basic(sky, THREE.BackSide) });

  // Wider than the sky shell on purpose: the visible horizon is then the line where the
  // water passes behind the cylinder wall, which is a clean circle at a known radius,
  // rather than the far edge of a plane that has to be positioned to fake one.
  const water = new THREE.PlaneGeometry(110, 110);
  water.rotateX(-Math.PI / 2);
  water.translate(0, SEA_Y, 0);
  parts.push({ name: 'Sea', geometry: water, material: basic(sea) });

  parts.push(...coastParts());
  parts.push(...townParts());

  return parts;
}
