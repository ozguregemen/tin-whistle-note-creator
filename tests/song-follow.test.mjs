import assert from "node:assert/strict";
import test from "node:test";
import { PITCH_WINDOW_SIZE } from "../app/live-pitch.mjs";
import { buildPlaybackPlan, frequencyForWhistleNote } from "../app/practice.mjs";
import { playReferenceNote, playReferenceSequence } from "../app/practice-reference.mjs";
import { buildFollowSteps, createSongFollower, createWhistleReleaseDetector } from "../app/song-follow.mjs";

const steps = [{ midi: 74 }, { midi: 74 }, { midi: 76 }];

test("a score exercise compares the sounding octave of the arranged D whistle part", () => {
  const plan = buildPlaybackPlan([[
    { pitch: "D", octave: 4 }, { pitch: "A#", octave: 4 }, { pitch: "D", octave: 5 },
  ]], { durations: [[1, 0.5, 2]], gaps: [[0, 1, 0]] }, 120);
  assert.deepEqual(buildFollowSteps(plan), [
    { pitch: "D", octave: 5, midi: 74, durationMs: 500 },
    { pitch: "A#", octave: 5, midi: 82, durationMs: 250 },
    { pitch: "D", octave: 6, midi: 86, durationMs: 1000 },
  ]);
  assert.deepEqual(buildFollowSteps(buildPlaybackPlan([[{ pitch: "C", octave: 4 }]], undefined)), []);
});

function sustainPitch(follower, midi, start) {
  let feedback = null;
  for (const offset of [0, 32, 64, 96, 128]) feedback = follower.hear(midi, start + offset) ?? feedback;
  return feedback;
}

test("short transition pitches are ignored and feedback waits for stable notes", () => {
  const follower = createSongFollower([{ midi: 74 }, { midi: 76 }]);
  for (const now of [0, 32, 64, 96]) assert.equal(follower.hear(86, now), null);
  assert.deepEqual(follower.hear(86, 128), { matched: 0, feedback: { midi: 86, correct: false } });
  for (const now of [160, 192, 224]) assert.equal(follower.hear(74, now), null);
  assert.deepEqual(follower.hear(74, 256), { matched: 1, feedback: { midi: 74, correct: true } });
  assert.equal(follower.hear(77, 288), null);
  assert.equal(follower.hear(77, 320), null);
  assert.deepEqual(sustainPitch(follower, 76, 352), { matched: 2, feedback: { midi: 76, correct: true } });
});

test("held or wandering pitches cannot fill repeated notes without a fresh attack", () => {
  const follower = createSongFollower([{ midi: 83 }, { midi: 83 }, { midi: 83 }]);
  assert.equal(sustainPitch(follower, 83, 0)?.matched, 1);
  assert.equal(sustainPitch(follower, 83, 160), null);
  assert.deepEqual(sustainPitch(follower, 82, 320), { matched: 1, feedback: { midi: 82, correct: false } });
  assert.equal(sustainPitch(follower, 83, 480), null);
  follower.release();
  assert.equal(sustainPitch(follower, 83, 640)?.matched, 2);
  assert.equal(sustainPitch(follower, 83, 800), null);
  follower.release();
  assert.equal(sustainPitch(follower, 83, 960)?.matched, 3);
});

test("time without audio observations cannot confirm a pitch", () => {
  const follower = createSongFollower(steps);
  assert.equal(follower.hear(74, 0), null);
  assert.equal(follower.hear(74, 400), null);
  assert.equal(follower.hear(74, 432), null);
  assert.equal(follower.hear(74, 464), null);
  assert.equal(follower.hear(74, 496)?.matched, 1);
});

test("pause and resume preserve both matched notes and the next target", () => {
  const follower = createSongFollower(steps);
  const progress = sustainPitch(follower, 74, 0);
  const resumed = createSongFollower(steps, progress);
  assert.equal(sustainPitch(resumed, 74, 0), null);
  resumed.release();
  assert.equal(sustainPitch(resumed, 74, 160)?.matched, 2);
  assert.equal(sustainPitch(resumed, 76, 320)?.matched, 3);
});

test("a brief dropout or a quiet sustained tone cannot rearm a repeat", () => {
  const rate = 48_000;
  const observe = createWhistleReleaseDetector(rate);
  const samples = new Float32Array(PITCH_WINDOW_SIZE).fill(0.12);
  assert.deepEqual(observe(samples, 0), { quiet: false, released: false });
  samples.fill(0.002, samples.length - 600);
  assert.deepEqual(observe(samples, 16), { quiet: true, released: false });
  assert.deepEqual(observe(samples, 32), { quiet: true, released: false });
  for (let index = samples.length - 600; index < samples.length; index += 1) {
    samples[index] = 0.014 * Math.sin(index * 2 * Math.PI * 987.77 / rate);
  }
  for (const now of [48, 64, 80, 96]) assert.deepEqual(observe(samples, now), { quiet: false, released: false });
});

test("a sustained gap rearms once even with older pitched audio in the window", () => {
  const observe = createWhistleReleaseDetector(48_000);
  const samples = new Float32Array(PITCH_WINDOW_SIZE).fill(0.12);
  observe(samples, 0);
  samples.fill(0.002, samples.length - 600);
  for (const now of [16, 32, 48, 64]) assert.deepEqual(observe(samples, now), { quiet: true, released: false });
  assert.deepEqual(observe(samples, 80), { quiet: true, released: true });
  assert.deepEqual(observe(samples, 96), { quiet: true, released: false });
  assert.deepEqual(observe(samples, 600), { quiet: true, released: false });
});

test("the guide plays in the target octave and protects the mic window after the cue", () => {
  const connections = [];
  const ramps = [];
  const stops = [];
  const volume = {
    connect: output => connections.push(output),
    disconnect() {},
    gain: {
      setValueAtTime() {},
      linearRampToValueAtTime: level => ramps.push(level),
      cancelScheduledValues() {},
      setTargetAtTime() {},
    },
  };
  const tone = {
    frequency: { value: 0 },
    connect: output => connections.push(output),
    disconnect() {},
    start() {},
    stop: time => stops.push(time),
  };
  const context = {
    currentTime: 2, sampleRate: 48_000, state: "running", destination: {},
    createOscillator: () => tone,
    createGain: () => volume,
  };
  const cue = playReferenceNote(context, { pitch: "D", octave: 6, midi: 86, durationMs: 400 });
  const window = PITCH_WINDOW_SIZE / context.sampleRate;
  assert.equal(tone.frequency.value, frequencyForWhistleNote("D", 5));
  assert.deepEqual(connections, [volume, context.destination]);
  assert.ok(Math.max(...ramps) >= 0.2);
  assert.equal(cue.endsAt, 2.4);
  assert.ok(cue.listenAt > cue.endsAt + window);

  context.currentTime += 0.1;
  cue.stop();
  assert.equal(stops.at(-1), cue.endsAt);
  assert.ok(cue.endsAt < 2.4);
  assert.ok(cue.listenAt > cue.endsAt + window);
});

test("a lesson example keeps the rhythm and ends after the last note", () => {
  const tones = [];
  const attacks = [];
  const context = {
    currentTime: 2, sampleRate: 48_000, state: "running", destination: {},
    createOscillator() {
      const tone = {
        frequency: { value: 0 }, connect() {}, disconnect() {},
        start(time) { this.startTime = time; },
        stop(time) { this.stopTime = time; },
      };
      tones.push(tone);
      return tone;
    },
    createGain() {
      const ramps = [];
      attacks.push(ramps);
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime(level) { ramps.push(level); } }, connect() {}, disconnect() {} };
    },
  };
  let finished = 0;
  const startTimes = playReferenceSequence(context, [
    { pitch: "B", octave: 5, midi: 83, durationMs: 1000 },
    { pitch: "A", octave: 5, midi: 81, durationMs: 500, accent: "beat" },
    { pitch: "G", octave: 5, midi: 79, durationMs: 1500, accent: "bar" },
  ], () => { finished += 1; });

  assert.deepEqual(startTimes, tones.map(tone => tone.startTime));
  assert.deepEqual(startTimes.map(time => Math.round(time * 1000)), [2040, 3040, 3540]);
  assert.deepEqual(tones.map(tone => Math.round(tone.stopTime * 1000)), [2900, 3470, 4830]);
  assert.equal(tones[0].frequency.value, frequencyForWhistleNote("B", 4));
  assert.deepEqual(attacks.map(ramps => Math.round(ramps[0] * 10000)), [2400, 2760, 3120]);
  tones[0].onended();
  assert.equal(finished, 0);
  tones.at(-1).onended();
  assert.equal(finished, 1);
});
