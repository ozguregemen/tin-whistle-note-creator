import { fingeringFor } from "./fingerings.mjs";
import { createPitchDetector } from "./live-pitch.mjs";
import { midiForWhistleNote } from "./whistle-sampler.mjs";

export const FOLLOW_MIN_FREQUENCY = 420;
const MAX_OBSERVATION_GAP_MS = 75;
const CORRECT_NOTE_MS = 80;
const WRONG_NOTE_MS = 128;
const RELEASE_MS = 50;

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
  /** @type {number | null} */
  let candidateMidi = null;
  let candidateSince = 0;
  let lastPitchAt = -Infinity;
  let releasedSinceMatch = progress.matched === 0;
  return {
    release() {
      heldMidi = null;
      candidateMidi = null;
      releasedSinceMatch = true;
    },
    /** @param {number | null} midi @param {number} timeMs */
    hear(midi, timeMs) {
      const target = steps[progress.matched];
      if (!target || midi === null || !Number.isInteger(midi)) {
        candidateMidi = null;
        return null;
      }
      if (midi !== candidateMidi || timeMs - lastPitchAt > MAX_OBSERVATION_GAP_MS) {
        candidateMidi = midi;
        candidateSince = timeMs;
      }
      lastPitchAt = timeMs;
      const correct = midi === target.midi;
      if (midi === heldMidi || timeMs - candidateSince < (correct ? CORRECT_NOTE_MS : WRONG_NOTE_MS)) return null;
      heldMidi = midi;
      if (correct && steps[progress.matched - 1]?.midi === midi && !releasedSinceMatch) return null;
      if (correct) releasedSinceMatch = false;
      progress = { matched: progress.matched + Number(correct), feedback: { midi, correct } };
      return progress;
    },
  };
}

/** @param {number} sampleRate */
export function createWhistleReleaseDetector(sampleRate) {
  const windowSize = Math.max(1, Math.round(sampleRate * 0.012));
  const detectTone = createPitchDetector(sampleRate, FOLLOW_MIN_FREQUENCY);
  let peak = 0;
  /** @type {number | null} */
  let quietSince = null;
  let quietFrames = 0;
  let lastReadingAt = -Infinity;
  let releaseReported = false;

  return (/** @type {Float32Array} */ samples, /** @type {number} */ timeMs) => {
    const length = Math.min(windowSize, samples.length);
    const start = samples.length - length;
    let energy = 0;
    for (let index = start; index < samples.length; index += 1) {
      energy += samples[index] * samples[index];
    }
    const level = Math.sqrt(energy / length);
    // A softer sustained tone still has a detectable pitch.
    const quiet = level < Math.max(0.004, peak * 0.18) && detectTone(samples.subarray(start)) === null;
    peak = Math.max(level, peak * 0.97);
    if (!quiet || timeMs - lastReadingAt > MAX_OBSERVATION_GAP_MS) {
      quietSince = null;
      quietFrames = 0;
      releaseReported = false;
    }
    lastReadingAt = timeMs;
    if (!quiet) return { quiet: false, released: false };
    quietSince ??= timeMs;
    quietFrames += 1;
    const released = !releaseReported && quietFrames >= 3 && timeMs - quietSince >= RELEASE_MS;
    releaseReported ||= released;
    return { quiet: true, released };
  };
}
