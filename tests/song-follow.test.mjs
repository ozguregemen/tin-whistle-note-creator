import assert from "node:assert/strict";
import test from "node:test";
import { createPitchDetector, PITCH_WINDOW_SIZE } from "../app/live-pitch.mjs";
import { buildPlaybackPlan, frequencyForWhistleNote } from "../app/practice.mjs";
import { referenceFrequency } from "../app/practice-reference.mjs";
import { buildFollowSteps, createSongFollower, createWhistleReleaseDetector, FOLLOW_MIN_FREQUENCY } from "../app/song-follow.mjs";

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

test("the reference alone is outside the scoring band but the real whistle pitch remains detectable", () => {
  const sampleRate = 48_000;
  const pitch = "D";
  const detect = createPitchDetector(sampleRate, FOLLOW_MIN_FREQUENCY);
  const guide = referenceFrequency(pitch);
  const whistle = frequencyForWhistleNote(pitch, 4);
  assert.ok(guide < FOLLOW_MIN_FREQUENCY);
  const samples = Float32Array.from({ length: PITCH_WINDOW_SIZE }, (_, index) => {
    const seconds = index / sampleRate;
    return 0.025 * Math.sin(2 * Math.PI * guide * seconds);
  });
  assert.equal(detect(samples), null);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] += 0.14 * Math.sin(2 * Math.PI * whistle * index / sampleRate);
  }
  assert.equal(detect(samples)?.midi, 74);
});
