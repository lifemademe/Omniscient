/**
 * Hand-drawn overlays for specific faces of specific props.
 *
 * A decal exists because box UVs are shared across all six faces: anything that belongs to
 * one face only - a rating plate, a bloom of corrosion around one connector - has to be a
 * separate quad or the housing ends up wearing six of them. That constraint happens to
 * match how these things work in life, where the plate was riveted on after the paint and
 * the corrosion arrived a long time after that.
 */

import * as THREE from 'three';

import { clamp01, fbm, smoothstep } from './noise.js';
import { ACCENT } from './palette.js';
import { createDecal } from './surface.js';
import { seedFrom } from '../core/rng.js';

/**
 * The Kestrel-3's rating plate.
 *
 * §131: the world should carry information rather than the dialogue carrying all of it.
 * The set has a name, a power rating and a serial because real equipment does, and because
 * a player who leans in and reads it learns that this is a specific machine somebody has
 * owned for a long time - which is the entire emotional premise of Mirela's request.
 *
 * The print is eroded by the same noise field that wears the paint, so the plate ages with
 * the housing instead of sitting on it looking freshly printed.
 */
/**
 * The signal meter on the front of the Kestrel-3.
 *
 * Asked about directly: "why is the radio screen brown?" It was not a screen. It was a
 * BoxGeometry in `MAT.metal` - a cool grey - warmed to brown by the certainty law, because
 * the transmitter is `inked` and everything on it goes warm at KNOWN. So the one part of
 * the set that should read as glass read as a slab of painted metal.
 *
 * A meter is a face, not a colour: a pale card, an arc of graduations, and a needle sitting
 * where the reading is. Mirela's line is that the lamp comes on and nothing else happens,
 * so the needle rests at the bottom of the scale - the set has power and no signal, which
 * is the diagnosis stated on the instrument before anybody says it (§131).
 *
 * Drawn rather than lit: the glass highlight is a painted diagonal, because a real specular
 * would come and go with the camera and this has to read from the two shots the mission
 * actually uses.
 */
export function createMeterFace(): THREE.CanvasTexture | null {
  return createDecal(320, 220, (ctx, w, h) => {
    /*
     * A DARK card with a pale needle, which is the third attempt and the first that reads.
     *
     * The first two drew a correct instrument - cream card, twenty graduations, fine needle
     * - and both resolved to a blank panel, because this meter is about 65 pixels wide from
     * the shot the mission uses and because a lit decal under the work lamp blows out
     * whatever is painted on it. Darkening the card helped and did not fix it.
     *
     * So it stops being a drawing and becomes a SHAPE: a dark rectangle in a cream case,
     * with one bright mark across it. That reads at 65 pixels and at 650, which is the only
     * test that matters here. �4.1 - silhouette first, and a dial's silhouette is its
     * needle against its face, not its graduations.
     */
    ctx.fillStyle = '#22221f';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h * 1.04;
    const radius = h * 0.8;

    // Five graduations, heavy, pale. Any more and they merge into a band.
    ctx.strokeStyle = '#8e8a7c';
    ctx.lineWidth = 6;
    for (let i = 0; i <= 4; i++) {
      const angle = Math.PI * (1.2 + (i / 4) * 0.6);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.lineTo(cx + Math.cos(angle) * (radius - 26), cy + Math.sin(angle) * (radius - 26));
      ctx.stroke();
    }

    /*
     * The needle, resting at the bottom of the scale. Mirela's line is that the lamp comes
     * on and nothing else happens, so the instrument says the same thing before she does
     * (�131): power in, nothing coming through.
     */
    const rest = Math.PI * 1.23;
    ctx.strokeStyle = '#e8e2cf';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rest) * (radius - 10), cy + Math.sin(rest) * (radius - 10));
    ctx.stroke();

    // A bezel, so the face reads as set into the case rather than stuck on it.
    ctx.strokeStyle = '#6e6a5e';
    ctx.lineWidth = 9;
    ctx.strokeRect(4, 4, w - 8, h - 8);
  });
}

/**
 * A puddle, drawn rather than simulated.
 *
 * Four attempts at a lit, shaded pool failed for one reason: this corner has nothing to
 * reflect. Measured, a real specular is not even available - bouncing the flood camera off
 * a horizontal pool at (-1.95, -1.16) puts the required light a metre behind the back wall.
 * So the reflection is PAINTED, which is both the only thing that works and the honest
 * choice for a game whose water elsewhere is a stylised shader rather than a mirror.
 *
 * Bean-shaped, because a circle reads as a decal and a puddle is a shape water found rather
 * than a shape somebody drew. The outline is one closed bezier with uneven control points -
 * a kidney with a bite out of one side.
 *
 * The streaks are the whole effect. Two or three pale, soft, elongated smears lying along
 * the long axis read as something bright reflected in still water, and they carry the read
 * on their own in a corner where nothing is lit. Unlit and un-tone-mapped when applied, so
 * the darkness of the room cannot take them away.
 */
export function createPuddleSurface(): THREE.CanvasTexture | null {
  return createDecal(384, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);

    /*
     * The outline, as one closed bezier with a bite taken out of the top right. A circle
     * reads as a decal; a puddle is a shape water found rather than one somebody drew.
     */
    const bean = new Path2D();
    bean.moveTo(w * 0.13, h * 0.54);
    bean.bezierCurveTo(w * 0.09, h * 0.2, w * 0.4, h * 0.07, w * 0.56, h * 0.19);
    bean.bezierCurveTo(w * 0.63, h * 0.45, w * 0.77, h * 0.11, w * 0.93, h * 0.33);
    bean.bezierCurveTo(w * 1.02, h * 0.5, w * 0.85, h * 0.85, w * 0.6, h * 0.89);
    bean.bezierCurveTo(w * 0.36, h * 0.92, w * 0.18, h * 0.84, w * 0.13, h * 0.54);
    bean.closePath();

    /**
     * 1. The damp, OUTSIDE the water.
     *
     * This is where the dark belongs and where the last version got it exactly backwards -
     * a heavy black stroke sat on the boundary and read as an inked outline. Stone soaks
     * outward from a pool, so the darkening is a soft halo beyond the edge and there is no
     * hard line anywhere in it.
     */
    ctx.save();
    /*
     * Lighter than it was. At 0.34 the damp sat as a heavy dark band immediately outside
     * the bright lip and the two together read as a drawn edge with a shadow under it -
     * the halo has to be felt rather than seen, or it becomes the outline it exists to
     * avoid.
     */
    ctx.filter = 'blur(18px)';
    ctx.strokeStyle = 'rgba(12,18,22,0.17)';
    ctx.lineWidth = 26;
    ctx.stroke(bean);
    ctx.restore();

    ctx.save();
    ctx.clip(bean);

    /**
     * 2. The water itself, and it is mostly transparent.
     *
     * Shallow water does not hide what it is lying on - it darkens it, cools it and makes
     * it slightly more saturated. Painting an opaque body is what made the first pass read
     * as a shape cut out of the floor rather than as something lying on it.
     */
    ctx.fillStyle = 'rgba(20,34,42,0.42)';
    ctx.fillRect(0, 0, w, h);

    /**
     * 3. The reflections, which are the whole effect.
     *
     * Long, soft, off-parallel, and brightest along the shallowest sightline. Blurred hard
     * because a reflection in still water has no edge of its own - the moment one has a
     * crisp boundary it stops being a reflection and becomes a painted stripe.
     */
    ctx.filter = 'blur(7px)';
    ctx.lineCap = 'round';
    for (const [x0, y0, x1, y1, width, alpha] of [
      [w * 0.19, h * 0.63, w * 0.84, h * 0.4, 17, 0.46],
      [w * 0.25, h * 0.77, w * 0.72, h * 0.57, 10, 0.3],
      [w * 0.5, h * 0.3, w * 0.88, h * 0.26, 7, 0.22],
    ] as const) {
      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, 'rgba(198,222,232,0)');
      grad.addColorStop(0.42, `rgba(198,222,232,${alpha})`);
      grad.addColorStop(1, 'rgba(198,222,232,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.filter = 'none';
    ctx.restore();

    /**
     * 4. The meniscus - a THIN bright line at the rim.
     *
     * Surface tension pulls the water up where it meets the floor and that lip catches
     * whatever light there is, so the boundary of a real puddle is pale and fine rather
     * than dark and heavy. It is also the single detail that sells the effect: it says
     * there is a SURFACE here with a height to it, which is the difference between water
     * and a stain.
     */
    ctx.save();
    ctx.filter = 'blur(1.5px)';
    /*
     * Graded round the rim rather than drawn at one strength.
     *
     * A meniscus catches light where the light is, so an outline of uniform brightness the
     * whole way round is the one thing that gives it away as drawn - which is exactly what
     * an even 0.5 stroke looked like: a neon bean on the floor. Bright along the far edge
     * where the sightline grazes the lip, gone at the near edge where you are looking down
     * into it.
     */
    const lip = ctx.createLinearGradient(0, h, 0, 0);
    lip.addColorStop(0, 'rgba(216,238,248,0.5)');
    lip.addColorStop(0.55, 'rgba(208,230,240,0.2)');
    lip.addColorStop(1, 'rgba(208,230,240,0.05)');
    ctx.strokeStyle = lip;
    ctx.lineWidth = 2;
    ctx.stroke(bean);
    ctx.restore();
  });
}

export function createRatingPlate(): THREE.CanvasTexture | null {
  return createDecal(512, 160, (ctx, w, h) => {
    // Plate: brushed alloy, a shade lighter than the housing so it separates without
    // becoming the brightest thing on the object.
    ctx.fillStyle = '#8d8b7e';
    ctx.fillRect(0, 0, w, h);

    // Brushing. Horizontal, faint, and only in value - the plate must not gain hue.
    for (let i = 0; i < 260; i++) {
      const y = (i / 260) * h;
      ctx.fillStyle = `rgba(255,255,255,${0.012 + (i % 3) * 0.01})`;
      ctx.fillRect(0, y, w, 1);
    }

    ctx.strokeStyle = 'rgba(30,28,24,0.55)';
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    // Rivets at the corners.
    for (const [rx, ry] of [
      [20, 20],
      [w - 20, 20],
      [20, h - 20],
      [w - 20, h - 20],
    ]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#5a584e';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rx - 1.5, ry - 1.5, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(220,216,200,0.6)';
      ctx.fill();
    }

    ctx.fillStyle = '#22201c';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 52px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
    ctx.fillText('KESTREL-3', 44, 52);

    ctx.font = '26px "Consolas", "Courier New", monospace';
    ctx.fillText('TRANSMITTER  12W  50R', 44, 100);
    ctx.fillText('SN 4471-C', 44, 132);

    // Erode the print and the plate together.
    const image = ctx.getImageData(0, 0, w, h);
    const seed = seedFrom('kestrel-plate');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const flake = fbm(seed, u, v, { frequency: 14, octaves: 3 });
        const edge = Math.min(u, 1 - u, v, 1 - v);
        // Lifted at the corners, flaked in patches across the middle.
        const lost = clamp01(
          smoothstep(0.6, 0.86, flake) * 0.9 + (1 - smoothstep(0.0, 0.05, edge)) * 0.5
        );
        const p = (y * w + x) * 4;
        image.data[p + 3] *= 1 - lost * 0.85;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
}

/**
 * A bloom of corrosion, for the panel behind connector B.
 *
 * The corroded connector is the answer to Mission 01, and until now it was a small green
 * cylinder - true, but a fact rather than a sight. Corrosion does not stop at the part; it
 * creeps out onto whatever the part is bolted to, and the stain is the thing that tells
 * you it has been happening for years rather than since Tuesday.
 */
export function createCorrosionBloom(seedKey = 'connector-b-bloom'): THREE.CanvasTexture | null {
  return createDecal(256, 256, (ctx, w, h) => {
    const image = ctx.createImageData(w, h);
    const seed = seedFrom(seedKey);

    const crust = { r: 0x9c, g: 0xa4, b: 0x84 };
    const deep = { r: 0x4c, g: 0x60, b: 0x38 };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;

        // A radius warped by low-frequency noise, so the edge is lobed the way a real
        // stain spreads along whatever the moisture followed.
        const dx = u - 0.5;
        const dy = v - 0.5;
        const warp = fbm(seed, u, v, { frequency: 4, octaves: 3 }) - 0.5;
        const radius = Math.hypot(dx, dy) + warp * 0.16;

        const body = 1 - smoothstep(0.14, 0.42, radius);
        // Speckle: corrosion is granular, never a smooth wash.
        const speck = fbm(seed + 5, u, v, { frequency: 26, octaves: 3 });
        const alpha = clamp01(body * (0.35 + speck * 1.1) - 0.08);

        const mixT = clamp01(speck * 1.3 - 0.15);
        const p = (y * w + x) * 4;
        image.data[p] = deep.r + (crust.r - deep.r) * mixT;
        image.data[p + 1] = deep.g + (crust.g - deep.g) * mixT;
        image.data[p + 2] = deep.b + (crust.b - deep.b) * mixT;
        image.data[p + 3] = alpha * 195;
      }
    }

    ctx.putImageData(image, 0, 0);
  });
}

/** The corrosion colour the bloom is keyed to, so callers can tint matching geometry. */
export const BLOOM_TINT = ACCENT.corrosion;

/**
 * Marker pen on the side of a packing box.
 *
 * §240 wants real content, and a house being cleared is the one place in this game where
 * two words carry more than a paragraph of dialogue could. Ileana is emptying a dead
 * relative's house and sorting photographs of people nobody can name any more; the boxes
 * say KITCHEN and BOOKS and KEEP, and one of them says WHO?, which is her entire request
 * written on cardboard in the corner of the room.
 *
 * Drawn rather than typed onto a texture atlas because each box needs its own word and
 * box UVs are shared by all six faces - a label baked into the material would appear on
 * every side of every box, which is not how anybody has ever packed anything.
 *
 * §232: ink and tape only, over transparent. The card's own value comes from MAT.card and
 * is not touched, so a labelled box sits in exactly the same value group as a blank one.
 */
export function createBoxLabel(text: string, seedKey = text): THREE.CanvasTexture | null {
  return createDecal(256, 128, (ctx, w, h) => {
    const seed = seedFrom(`box-label-${seedKey}`);

    // A strip of parcel tape under the writing, slightly off square. Most of what makes a
    // box read as packed rather than as a crate is the tape, and it costs one rectangle.
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.035 + (seed % 1000) / 40000);
    ctx.fillStyle = 'rgba(206,188,150,0.34)';
    ctx.fillRect(-w * 0.46, -h * 0.3, w * 0.92, h * 0.6);
    ctx.strokeStyle = 'rgba(150,132,98,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w * 0.46, -h * 0.3, w * 0.92, h * 0.6);
    ctx.restore();

    // The hand. A wide marker nib and a slight tilt: nobody letters a box neatly.
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.045);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(34,29,24,0.86)';
    ctx.font = `bold ${text.length > 6 ? 46 : 60}px "Arial Narrow", Arial, sans-serif`;
    ctx.fillText(text, 0, 4);
    ctx.restore();

    // Wear the ink, using the same field that ages everything else in this file.
    const image = ctx.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const scuff = fbm(seed + 3, x / w, y / h, { frequency: 18, octaves: 3 });
        const p = (y * w + x) * 4;
        image.data[p + 3] *= 1 - clamp01(smoothstep(0.58, 0.86, scuff)) * 0.55;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
}

/**
 * The one signal on the District 07 map that OMNISCIENT_ cannot name.
 *
 * §52 asks the world to look bigger than the part of it the player is being given, and
 * the wireframe city is the only room where that can be said in the room's own language:
 * everything else in that frame is the network drawn as the network, so a point the
 * network has and cannot identify is a hole in the machine's own picture of the world.
 *
 * Amber rather than cyan or green, which is what makes it legible as an outsider. §9
 * assigns cold cyan to data and acid green to knowledge, and every line in that district
 * is one or the other; amber is used nowhere else out there, so the eye finds it without
 * anything having to point at it.
 *
 * Drawn as one texture with the dot and the word together, on a sprite. Two objects would
 * have to be kept aligned at every camera angle and the label would have to be billboarded
 * anyway - one canvas is the same picture with none of that.
 */
export function createUnknownSignal(): THREE.CanvasTexture | null {
  return createDecal(256, 64, (ctx) => {
    ctx.clearRect(0, 0, 256, 64);

    // The bloom first, so the dot sits inside its own glow rather than on top of it.
    const halo = ctx.createRadialGradient(32, 32, 1, 32, 32, 26);
    halo.addColorStop(0, 'rgba(224, 162, 76, 0.55)');
    halo.addColorStop(1, 'rgba(224, 162, 76, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 72, 64);

    ctx.fillStyle = ACCENT.amber;
    ctx.beginPath();
    ctx.arc(32, 32, 7, 0, Math.PI * 2);
    ctx.fill();

    // A ring, because a marker with a ring reads as a reading and a bare dot reads as a
    // speck of dust on the screen.
    ctx.strokeStyle = 'rgba(224, 162, 76, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(32, 32, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = 'bold 21px "Courier New", monospace';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '3px';
    ctx.fillStyle = ACCENT.amber;
    ctx.fillText('UNKNOWN', 58, 33);
  });
}
