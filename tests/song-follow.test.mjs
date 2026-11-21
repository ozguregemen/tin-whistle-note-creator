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

test("a wrong note keeps the same target, and a correct note fills it", () => {
  const follower = createSongFollower(steps);
  assert.deepEqual(follower.hear(86), { matched: 0, feedback: { midi: 86, correct: false } });
  assert.equal(follower.hear(86), null);
  assert.deepEqual(follower.hear(74), { matched: 1, feedback: { midi: 74, correct: true } });
  assert.deepEqual(follower.hear(76), { matched: 1, feedback: { midi: 76, correct: false } });
  assert.deepEqual(follower.hear(74), { matched: 2, feedback: { midi: 74, correct: true } });
  assert.deepEqual(follower.hear(76), { matched: 3, feedback: { midi: 76, correct: true } });
  assert.equal(follower.hear(74), null);
});

test("holding a note does not fill a repeat and releasing allows a fresh attack", () => {
  const follower = createSongFollower(steps);
  assert.equal(follower.hear(74)?.matched, 1);
  for (let frame = 0; frame < 15; frame += 1) assert.equal(follower.hear(74), null);
  follower.release();
  assert.equal(follower.hear(74)?.matched, 2);
});

test("pause and resume preserve both matched notes and the next target", () => {
  const follower = createSongFollower(steps);
  follower.hear(74);
  follower.release();
  const progress = follower.hear(74);
  const resumed = createSongFollower(steps, progress);
  assert.deepEqual(resumed.hear(74), { matched: 2, feedback: { midi: 74, correct: false } });
  assert.equal(resumed.hear(76)?.matched, 3);
});

test("breathing or tonguing can rearm a repeat while the older part of the sample is still voiced", () => {
  const rate = 48_000;
  const released = createWhistleReleaseDetector(rate);
  const samples = new Float32Array(PITCH_WINDOW_SIZE).fill(0.12);
  assert.equal(released(samples), false);
  samples.fill(0.002, samples.length - 600);
  assert.equal(released(samples), true);
  samples.fill(0.025);
  assert.equal(released(samples), false);
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
