import assert from "node:assert/strict";
import test from "node:test";
import { audibleMidiToWrittenWhistleToken, melodyFromTranscriptionEvents } from "../app/audio-transcription.mjs";
import { buildPlaybackPlan } from "../app/practice.mjs";
import { melodyToWhistlePractice } from '../app/melody-whistle-adapter.mjs';

test('audio pulse tempo changes the beat coordinate without speeding up or quantizing recorded notes', () => {
  const melody = { notes: [{ midi: 81, startSeconds: 0.2, durationSeconds: 0.73 },
    { midi: 83, startSeconds: 1.1, durationSeconds: 0.37 }], phrases: [{ noteIndices: [0, 1] }],
    estimatedTempo: { bpm: 115, kind: 'pulse-estimate' } };
  const result = melodyToWhistlePractice(melody);
  assert.equal(result.rhythm.bpm, 115); assert.equal(result.rhythm.tempoSource, 'audio-estimate');
  const plan = buildPlaybackPlan([[{}, {}]], result.rhythm, result.rhythm.bpm);
  assert.ok(Math.abs(plan[0].durationMs - 730) < 1e-6);
  assert.ok(Math.abs(plan[1].delayMs - 170) < 1e-6);
  assert.ok(Math.abs(plan[1].durationMs - 370) < 1e-6);
  melody.estimatedTempo = null;
  assert.equal(melodyToWhistlePractice(melody).rhythm.bpm, 90);
  assert.equal(melodyToWhistlePractice(melody).rhythm.tempoSource, 'default');
});

test("duyulan MIDI perdesini high-D whistle yazımına bir oktav aşağı çevirir", () => {
  assert.equal(audibleMidiToWrittenWhistleToken(74), "D4");
  assert.equal(audibleMidiToWrittenWhistleToken(81), "A4");
  assert.equal(audibleMidiToWrittenWhistleToken(83), "B4");
});

test("aynı anda çalan akor notalarından sürekliliği olan üst melodiyi seçer", () => {
  const result = melodyFromTranscriptionEvents([
    { pitchMidi: 60, amplitude: 0.72, startTimeSeconds: 0, durationSeconds: 0.45 },
    { pitchMidi: 67, amplitude: 0.76, startTimeSeconds: 0.01, durationSeconds: 0.45 },
    { pitchMidi: 62, amplitude: 0.74, startTimeSeconds: 0.5, durationSeconds: 0.45 },
    { pitchMidi: 69, amplitude: 0.78, startTimeSeconds: 0.51, durationSeconds: 0.45 },
    { pitchMidi: 64, amplitude: 0.73, startTimeSeconds: 1, durationSeconds: 0.45 },
    { pitchMidi: 71, amplitude: 0.77, startTimeSeconds: 1.01, durationSeconds: 0.45 },
  ]);
  assert.equal(result.notes, "G3 A3 B3");
  assert.equal(result.noteCount, 3);
  assert.equal(result.rhythm.source, "transcribed");
  assert.deepEqual(result.rhythm.durations.map((phrase) => phrase.map((duration) => Number(duration.toFixed(3)))), [[0.675, 0.675, 0.675]]);
});

test("uzun sessizlikte cümleyi böler ve zamanlamayı vuruşa çevirir", () => {
  const result = melodyFromTranscriptionEvents([
    { pitchMidi: 74, amplitude: 0.9, startTimeSeconds: 0.2, durationSeconds: 0.4 },
    { pitchMidi: 76, amplitude: 0.9, startTimeSeconds: 0.7, durationSeconds: 0.3 },
    { pitchMidi: 78, amplitude: 0.9, startTimeSeconds: 2.3, durationSeconds: 0.5 },
  ]);
  assert.equal(result.notes, "D4 E4 | F#4");
  // Phrase layout must not erase the 1.3-second musical rest (1.95 beats).
  assert.deepEqual(result.rhythm.gaps.map((phrase) => phrase.map((gap) => Number(gap.toFixed(3)))), [[0, 0.15], [1.95]]);
});

test("gürültü seviyesindeki kısa ve zayıf tahminleri atar", () => {
  const result = melodyFromTranscriptionEvents([
    { pitchMidi: 74, amplitude: 0.1, startTimeSeconds: 0, durationSeconds: 0.4 },
    { pitchMidi: 76, amplitude: 0.9, startTimeSeconds: 0.5, durationSeconds: 0.03 },
  ]);
  assert.equal(result.notes, "");
  assert.equal(result.noteCount, 0);
});

test("modelin aynı perde için ürettiği bitişik parçaları tek notada birleştirir", () => {
  const result = melodyFromTranscriptionEvents([
    { pitchMidi: 69, amplitude: 0.7, startTimeSeconds: 0, durationSeconds: 0.09 },
    { pitchMidi: 69, amplitude: 0.8, startTimeSeconds: 0.08, durationSeconds: 1.9 },
  ]);
  assert.equal(result.notes, "A3");
  assert.equal(result.noteCount, 1);
  assert.equal(Number(result.rhythm.durations[0][0].toFixed(2)), 2.97);
});

test("nötr melodi ve whistle adaptörü uzun sesleri/esleri çalma planına kayıpsız taşır", () => {
  const result = melodyFromTranscriptionEvents([
    { midi: 81, startSeconds: 0.2, durationSeconds: 8, salience: 0.9 },
    { midi: 83, startSeconds: 12, durationSeconds: 0.5, salience: 0.9 },
  ]);
  assert.deepEqual(result.melody.notes.map((n) => n.midi), [81, 83]);
  assert.equal(result.notes, "A4 | B4");
  const plan = buildPlaybackPlan([[{}], [{}]], result.rhythm, result.rhythm.bpm);
  assert.equal(plan[0].durationMs, 8000);
  assert.ok(Math.abs(plan[1].delayMs - 3800) < 0.001);
});
