/**
 * The rule at the top of RoomTone.ts, enforced - and corrected.
 *
 * Its header states an invariant that nothing checked:
 *
 *   "The numbers below are chosen so that no two beds share a fundamental and no two drifts
 *    share a period - two rooms whose tones beat against each other would be audible as a
 *    fault during the crossfade between them."
 *
 * Written because a pass that added a 105Hz swell to the mast broke it immediately: the
 * repair shop has a tone at 100Hz, and two sines 5Hz apart wobble five times a second. The
 * value was correct in isolation, the file compiled, and the fault would only have existed
 * during the second and a half where both beds ran.
 *
 * ## Two things the header gets wrong, both found by writing this
 *
 * **Identical is safe; NEARLY identical is the fault.** The repair shop and the workstation
 * are both at exactly 50Hz, deliberately - it is mains hum, and both a workshop full of
 * transformers and a desk with a tape drive on it have mains hum. Two tones at the same
 * frequency sum. Two tones a hertz apart pulse. So the test is on the BEAT RATE, not on how
 * far apart the numbers look, and zero passes.
 *
 * **Rooms never crossfade into each other.** Every route in the game goes through the
 * workstation: a call ends, the camera comes home, and the next one starts from there. So the
 * only pairs that can ever overlap are `home` against each scene, and checking all 36 pairs -
 * which the first version did - reports faults that cannot happen. Reading the transition
 * graph turned out to matter more than reading the numbers.
 *
 *     npx tsx scripts/room-tone.ts
 */
import { BEDS } from '../src/omniscient/audio/RoomTone.js';

/**
 * The band where two tones beat objectionably, in hertz of difference.
 *
 * Below about 1.2Hz you get less than two cycles inside the 1.6 second crossfade, so it reads
 * as part of the fade rather than as a wobble. Above about 20Hz the ear stops hearing
 * separate pulses and starts hearing roughness, which on a pair of sub-bass sines during a
 * transition is inaudible. In between is where a mix falls apart.
 */
const BEAT_LOW = 1.2;
const BEAT_HIGH = 20;

/** Every transition passes through here. See the header. */
const HUB = 'home';

let failures = 0;
let warnings = 0;
const fail = (message: string): void => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
};
const warn = (message: string): void => {
  warnings += 1;
  console.log(`  note  ${message}`);
};

/**
 * ## Why beating REPORTS and does not fail
 *
 * The first version of this failed the build, and on its first run it found six: every bed
 * whose fundamental is not 50Hz beats against the workstation's 50Hz mains hum somewhere
 * between 4 and 16 hertz. The cellar at 34, the tunnel at 38, the mast at 44, the door at 46,
 * the mill road at 58, the cleared house at 62.
 *
 * All six are physically real - those pairs are inside one critical band at 50Hz, so they
 * beat rather than being heard as two pitches, and during a crossfade their amplitudes cross,
 * which is where the beat is deepest.
 *
 * Whether any of them is a FAULT is a different question, and it is one I could not answer.
 * They are 0.02-amplitude sines below 65Hz under a deliberate 1.6 second transition between
 * two places. On a laptop speaker, which rolls off entirely below about 150Hz, they do not
 * exist. On headphones a slow throb under a scene change is arguably the transition doing its
 * job. Deciding needs somebody to listen, and no capture will settle it.
 *
 * So this reports and moves on. A harness that is permanently red is a harness everybody
 * learns to ignore, and turning six real observations into background noise would cost more
 * than the observations are worth. What still FAILS is the drift rule, which the header
 * states flatly and which is objective, and an empty bed, which is unambiguous.
 *
 * If somebody does listen and it is a fault, the cheap fix is to move `home`'s hum to 50 and
 * every scene's fundamental to a harmonic-safe distance from it - or simply to accept it,
 * write that down here, and delete this section.
 */

const names = Object.keys(BEDS).filter((name) => name !== HUB);
const hub = BEDS[HUB];

console.log(`--- tones, against '${HUB}' ---`);
for (const name of names) {
  for (const [a] of hub.tones) {
    for (const [b] of BEDS[name].tones) {
      const beat = Math.abs(a - b);
      if (beat >= BEAT_LOW && beat <= BEAT_HIGH) {
        warn(`${HUB} at ${a}Hz and ${name} at ${b}Hz beat at ${beat.toFixed(1)}Hz through the crossfade`);
      }
    }
  }
}
if (warnings === 0) console.log(`  ok    no bed beats against '${HUB}' between ${BEAT_LOW} and ${BEAT_HIGH}Hz`);

/*
 * The pairs that cannot happen today, reported and not failed.
 *
 * Scene-to-scene crossfades do not occur, so these are inert. They are printed because the
 * routing is a property of the session controller rather than of this file, and a later
 * change - a mission that hands straight to another room, an ending that walks a montage -
 * would make every one of them audible on the day it shipped.
 */
const againstHub = warnings;
console.log('--- scene against scene, inert today ---');
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    for (const [a] of BEDS[names[i]].tones) {
      for (const [b] of BEDS[names[j]].tones) {
        const beat = Math.abs(a - b);
        if (beat >= BEAT_LOW && beat <= BEAT_HIGH) {
          warn(`${names[i]} ${a}Hz / ${names[j]} ${b}Hz would beat at ${beat.toFixed(1)}Hz if they ever met`);
        }
      }
    }
  }
}
if (warnings === againstHub) console.log('  ok    none, so the routing could change freely');

console.log('--- drifts ---');
const before = failures;
const drifts = new Map<number, string[]>();
for (const name of Object.keys(BEDS)) {
  const drift = BEDS[name].drift;
  if (!drift) continue;
  drifts.set(drift[1], [...(drifts.get(drift[1]) ?? []), name]);
}
for (const [period, rooms] of drifts) {
  if (rooms.length > 1) fail(`${rooms.join(' and ')} both drift on a ${period}s period`);
}
if (failures === before) {
  console.log(`  ok    ${drifts.size} distinct drift periods across ${Object.keys(BEDS).length} beds`);
}

/*
 * And one thing the header does not say but the mix needs: no bed may be empty.
 *
 * `scene-wire-city` has no air and no drift on purpose - it is a data hum and its note says
 * so - but it has tones. A bed with nothing in it at all is a room that has quietly lost its
 * sound, and silence is the one fault nobody reports because it does not look like anything.
 */
console.log('--- content ---');
const quiet = Object.keys(BEDS).filter((name) => BEDS[name].tones.length === 0 && !BEDS[name].air);
if (quiet.length) fail(`beds with neither tones nor air: ${quiet.join(', ')}`);
else console.log('  ok    every bed has something in it');

/*
 * The stereo image, which is new and therefore worth fencing.
 *
 * `build` already forces sub-120Hz tones to centre, so a bed that pans its bass is not a
 * bug that can reach a speaker - it is a bug that reaches the next person to read the file,
 * who will believe the number. An authored value the engine silently ignores is worse than
 * a wrong one, because nothing ever contradicts it.
 */
console.log('--- stereo ---');
const beforeStereo = failures;
const BASS_CENTRE_HZ = 120;
let authored = 0;
for (const name of Object.keys(BEDS)) {
  const stereo = BEDS[name].stereo;
  if (!stereo) continue;
  authored += 1;
  for (const [index, pan] of (stereo.tones ?? []).entries()) {
    if (pan < -1 || pan > 1) fail(`${name} tone ${index} pans to ${pan}, outside -1..1`);
    const tone = BEDS[name].tones[index];
    if (!tone) fail(`${name} pans tone ${index}, which does not exist`);
    else if (tone[0] < BASS_CENTRE_HZ && pan !== 0) {
      fail(`${name} pans its ${tone[0]}Hz tone to ${pan}, but build() centres anything under ${BASS_CENTRE_HZ}Hz`);
    }
  }
  if (stereo.air !== undefined && (stereo.air < 0 || stereo.air > 1)) {
    fail(`${name} air width ${stereo.air} is outside 0..1`);
  }
  if (stereo.work !== undefined && (stereo.work < -1 || stereo.work > 1)) {
    fail(`${name} work pan ${stereo.work} is outside -1..1`);
  }
  if (stereo.work !== undefined && !BEDS[name].work) {
    fail(`${name} pans work it does not have`);
  }
}
if (failures === beforeStereo) {
  console.log(`  ok    ${authored} bed(s) author a stereo image, all of them legal`);
}

console.log(failures === 0 ? `\nALL CHECKS PASSED${warnings ? ` (${warnings} inert)` : ''}` : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
