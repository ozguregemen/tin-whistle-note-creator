import { frequencyForNote } from "./practice.mjs";
import { PITCH_WINDOW_SIZE } from "./live-pitch.mjs";
import { FOLLOW_MIN_FREQUENCY } from "./song-follow.mjs";

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

/**
 * @param {AudioContext} context
 * @param {import("./song-follow.mjs").FollowStep} step
 * @param {() => void} [onEnded]
 * @param {{ start: number, duration: number, accent?: import("./song-follow.mjs").FollowStep["accent"] }} [timing]
 */
export function playReferenceNote(context, step, onEnded, timing) {
  const tone = context.createOscillator();
  const volume = context.createGain();
  const start = timing?.start ?? context.currentTime;
  const duration = timing?.duration ?? Math.min(0.5, Math.max(0.26, step.durationMs / 1000));
  const end = start + duration;
  // Let speaker pickup decay and clear one full pitch window before scoring.
  const inputTail = 0.18 + PITCH_WINDOW_SIZE / context.sampleRate;
  const emphasis = timing?.accent === "bar" ? 1.3 : timing?.accent === "beat" ? 1.15 : 1;

  tone.type = "triangle";
  tone.frequency.value = frequencyForNote(step.pitch, step.octave);
  volume.gain.setValueAtTime(0, start);
  volume.gain.linearRampToValueAtTime(0.24 * emphasis, start + 0.02);
  volume.gain.linearRampToValueAtTime(0.17 * emphasis, end - 0.05);
  volume.gain.linearRampToValueAtTime(0, end);
  tone.connect(volume);
  volume.connect(context.destination);
  let ended = false;
  tone.onended = () => {
    ended = true;
    tone.disconnect();
    volume.disconnect();
    onEnded?.();
  };
  tone.start(start);
  tone.stop(end);

  const cue = {
    endsAt: end,
    listenAt: end + inputTail,
    stop() {
      if (ended || context.state === "closed") return;
      const now = context.currentTime;
      volume.gain.cancelScheduledValues(now);
      volume.gain.setTargetAtTime(0, now, 0.004);
      cue.endsAt = Math.min(cue.endsAt, now + 0.02);
      cue.listenAt = cue.endsAt + inputTail;
      tone.stop(cue.endsAt);
    },
  };
  return cue;
}

/**
 * @param {AudioContext} context
 * @param {import("./song-follow.mjs").FollowStep[]} steps
 * @param {() => void} onEnded
 */
export function playReferenceSequence(context, steps, onEnded) {
  let start = context.currentTime + 0.04;
  return steps.map((step, index) => {
    const spacing = step.durationMs / 1000;
    const timing = { start, duration: spacing * 0.86, accent: step.accent };
    playReferenceNote(context, step, index === steps.length - 1 ? onEnded : undefined, timing);
    start += spacing;
    return timing.start;
  });
}
