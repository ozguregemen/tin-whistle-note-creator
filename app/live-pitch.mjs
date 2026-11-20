import { pitchAndOctave } from "./fingerings.mjs";

export const PITCH_WINDOW_SIZE = 2048;
const MIN_FREQUENCY = 250;
const MAX_FREQUENCY = 4000;
const MIN_RMS = 0.004;
const PERIOD_THRESHOLD = 0.15;

/** @param {number} sampleRate @param {number} [minimumFrequency] */
export function createPitchDetector(sampleRate, minimumFrequency = MIN_FREQUENCY) {
  const firstLag = Math.max(2, Math.floor(sampleRate / MAX_FREQUENCY));
  const lastLag = Math.ceil(sampleRate / minimumFrequency);
  const difference = new Float64Array(lastLag + 2);

  return (/** @type {Float32Array} */ samples) => {
    const windowSize = samples.length - lastLag - 1;
    if (windowSize < lastLag) return null;

    let sum = 0;
    let squaredSum = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      sum += sample;
      squaredSum += sample * sample;
    }
    const variance = squaredSum / samples.length - (sum / samples.length) ** 2;
    if (variance < MIN_RMS ** 2) return null;

    // YIN's cumulative mean normalized difference favors the first strong period.
    let cumulative = 0;
    difference[0] = 1;
    for (let lag = 1; lag <= lastLag + 1; lag += 1) {
      let distance = 0;
      for (let index = 0; index < windowSize; index += 1) {
        const delta = samples[index] - samples[index + lag];
        distance += delta * delta;
      }
      cumulative += distance;
      difference[lag] = cumulative > 0 ? distance * lag / cumulative : 1;
    }

    for (let lag = firstLag; lag <= lastLag; lag += 1) {
      if (difference[lag] >= PERIOD_THRESHOLD) continue;
      while (lag < lastLag && difference[lag + 1] < difference[lag]) lag += 1;
      const before = difference[lag - 1];
      const center = difference[lag];
      const after = difference[lag + 1];
      const curvature = before + after - 2 * center;
      const offset = curvature > 0 ? Math.max(-0.5, Math.min(0.5, (before - after) / (2 * curvature))) : 0;
      const frequency = sampleRate / (lag + offset);
      if (frequency < minimumFrequency || frequency > MAX_FREQUENCY) return null;
      const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
      return { ...pitchAndOctave(midi), midi, frequency };
    }
    return null;
  };
}

/** @typedef {NonNullable<ReturnType<ReturnType<typeof createPitchDetector>>>} DetectedPitch */

export function createPitchTracker() {
  /** @type {DetectedPitch | null} */
  let displayed = null;
  let previousMidi = -1;
  let stableFrames = 0;

  return (/** @type {DetectedPitch | null} */ note) => {
    const midi = note?.midi ?? -1;
    stableFrames = midi === previousMidi ? stableFrames + 1 : 1;
    previousMidi = midi;
    if (stableFrames >= 2) displayed = note;
    return displayed;
  };
}
