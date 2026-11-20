import { frequencyForNote } from "./practice.mjs";
import { FOLLOW_MIN_FREQUENCY } from "./song-follow.mjs";

/** @param {string} pitch */
export function referenceFrequency(pitch) {
  // The guide is voiced below the whistle's register to reduce speaker pickup.
  return frequencyForNote(pitch, 3);
}

/** @param {AudioContext} context @param {AudioNode} source @param {AnalyserNode} analyser */
export function connectFollowInput(context, source, analyser) {
  let input = source;
  for (let index = 0; index < 2; index += 1) {
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = FOLLOW_MIN_FREQUENCY;
    filter.Q.value = 0.707;
    input.connect(filter);
    input = filter;
  }
  input.connect(analyser);
}

/** @param {AudioContext} context @param {string} pitch @param {number} durationMs */
export function playReferenceNote(context, pitch, durationMs) {
  const tone = context.createOscillator();
  const volume = context.createGain();
  const start = context.currentTime;
  const duration = Math.min(1.1, Math.max(0.17, durationMs / 1000));
  const end = start + duration;

  tone.type = "sine";
  tone.frequency.value = referenceFrequency(pitch);
  volume.gain.setValueAtTime(0, start);
  volume.gain.linearRampToValueAtTime(0.09, start + 0.025);
  volume.gain.linearRampToValueAtTime(0.065, end - 0.055);
  volume.gain.linearRampToValueAtTime(0, end);
  tone.connect(volume);
  volume.connect(context.destination);
  let ended = false;
  tone.onended = () => {
    ended = true;
    tone.disconnect();
    volume.disconnect();
  };
  tone.start(start);
  tone.stop(end);

  return () => {
    if (ended || context.state === "closed") return;
    const now = context.currentTime;
    volume.gain.cancelScheduledValues(now);
    volume.gain.setTargetAtTime(0, now, 0.004);
    tone.stop(Math.min(end, now + 0.02));
  };
}
