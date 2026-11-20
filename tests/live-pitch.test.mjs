import assert from "node:assert/strict";
import test from "node:test";
import { createPitchDetector, createPitchTracker, PITCH_WINDOW_SIZE } from "../app/live-pitch.mjs";
import { frequencyForWhistleNote } from "../app/practice.mjs";

function samplesFor(sampleRate, waveform) {
  return Float32Array.from({ length: PITCH_WINDOW_SIZE }, (_, index) => waveform(index / sampleRate));
}

function noiseGenerator() {
  let seed = 12345;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
}

test("detects the sounding note in multiple whistle registers and audio sample rates", () => {
  for (const sampleRate of [44_100, 48_000, 96_000]) {
    const detect = createPitchDetector(sampleRate);
    for (const [pitch, writtenOctave] of [["D", 4], ["F#", 4], ["D", 5], ["C#", 6], ["G", 6]]) {
      const frequency = frequencyForWhistleNote(pitch, writtenOctave);
      const audio = samplesFor(sampleRate, time => 0.2 * Math.sin(2 * Math.PI * frequency * time));
      const note = detect(audio);
      assert.ok(note, `${pitch}${writtenOctave} at ${sampleRate} Hz`);
      assert.equal(note.pitch, pitch);
      assert.equal(note.octave, writtenOctave + 1);
      assert.ok(Math.abs(1200 * Math.log2(note.frequency / frequency)) < 12);
    }
  }
});

test("finds a whistle-like fundamental amid stronger harmonics and breath noise", () => {
  const sampleRate = 48_000;
  const frequency = frequencyForWhistleNote("A", 4);
  const noise = noiseGenerator();
  const audio = samplesFor(sampleRate, time => {
    const phase = 2 * Math.PI * frequency * time;
    return 0.08 * Math.sin(phase) + 0.13 * Math.sin(2 * phase) + 0.03 * Math.sin(3 * phase) + 0.02 * noise();
  });
  const note = createPitchDetector(sampleRate)(audio);
  assert.equal(note?.pitch, "A");
  assert.equal(note.octave, 5);
});

test("silence, very weak input, and broadband noise do not appear as notes", () => {
  const sampleRate = 48_000;
  const noise = noiseGenerator();
  const detect = createPitchDetector(sampleRate);
  assert.equal(detect(new Float32Array(PITCH_WINDOW_SIZE)), null);
  assert.equal(detect(samplesFor(sampleRate, time => 0.001 * Math.sin(2 * Math.PI * 587 * time))), null);
  assert.equal(detect(samplesFor(sampleRate, () => 0.13 * noise())), null);
});

test("a short outlier cannot change the displayed note or clear it", () => {
  const track = createPitchTracker();
  const first = { pitch: "D", octave: 5, midi: 74, frequency: 587.3 };
  const next = { pitch: "E", octave: 5, midi: 76, frequency: 659.3 };
  assert.equal(track(first), null);
  assert.equal(track(first), first);
  assert.equal(track(next), first);
  assert.equal(track(first), first);
  assert.equal(track(next), first);
  assert.equal(track(next), next);
  assert.equal(track(null), next);
  assert.equal(track(null), null);
});
