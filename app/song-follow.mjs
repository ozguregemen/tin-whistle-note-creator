import { fingeringFor } from "./fingerings.mjs";
import { midiForWhistleNote } from "./whistle-sampler.mjs";

export const FOLLOW_MIN_FREQUENCY = 420;

/** @typedef {{ pitch: string, octave: number, midi: number, durationMs: number, accent?: "bar" | "beat" }} FollowStep */
/** @typedef {{ matched: number, feedback: { midi: number, correct: boolean } | null }} FollowProgress */

/**
 * @param {{note: {pitch: string, octave: number}, durationMs: number}[]} plan
 * @returns {FollowStep[]}
 */
export function buildFollowSteps(plan) {
  const steps = [];
  for (const event of plan) {
    const { pitch, octave } = event.note;
    const midi = midiForWhistleNote(pitch, octave);
    if (midi === null || !fingeringFor(pitch, octave)) return [];
    steps.push({ pitch, octave: octave + 1, midi, durationMs: event.durationMs });
  }
  return steps;
}

/** @returns {FollowProgress} */
export function emptyFollowProgress() {
  return { matched: 0, feedback: null };
}

/** @param {readonly {midi: number}[]} steps @param {FollowProgress} [progress] */
export function createSongFollower(steps, progress = emptyFollowProgress()) {
  /** @type {number | null} */
  let heldMidi = null;
  return {
    release() {
      heldMidi = null;
    },
    /** @param {number} midi */
    hear(midi) {
      const target = steps[progress.matched];
      if (!target || midi === heldMidi || !Number.isInteger(midi)) return null;
      heldMidi = midi;
      const correct = midi === target.midi;
      progress = { matched: progress.matched + Number(correct), feedback: { midi, correct } };
      return progress;
    },
  };
}

/** @param {number} sampleRate */
export function createWhistleReleaseDetector(sampleRate) {
  const windowSize = Math.max(1, Math.round(sampleRate * 0.012));
  let peak = 0;

  return (/** @type {Float32Array} */ samples) => {
    const length = Math.min(windowSize, samples.length);
    let energy = 0;
    for (let index = samples.length - length; index < samples.length; index += 1) {
      energy += samples[index] * samples[index];
    }
    const level = Math.sqrt(energy / length);
    const released = level < Math.max(0.004, peak * 0.18);
    peak = released ? 0 : Math.max(level, peak * 0.97);
    return released;
  };
}
