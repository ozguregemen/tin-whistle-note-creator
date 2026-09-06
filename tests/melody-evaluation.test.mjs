import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateMelody, sequenceEditDistance } from '../app/melody-evaluation.mjs';
const n = (midi, startSeconds, durationSeconds = 0.4) => ({ midi, startSeconds, durationSeconds });
const truth = [n(69, 0), n(71, 0.5), n(72, 1)];
test('evaluation: identity has perfect note, pitch and contour agreement', () => {
  const m = evaluateMelody(truth, truth);
  assert.equal(m.note.f1, 1); assert.equal(m.frame.rawPitchAccuracy, 1); assert.equal(m.contourSimilarity, 1);
});
test('evaluation: octave error is distinct from pitch-class error', () => {
  const m = evaluateMelody(truth.map((n) => ({ ...n, midi: n.midi + 12 })), truth);
  assert.equal(m.note.f1, 0); assert.equal(m.pitchClassNote.f1, 1); assert.equal(m.frame.octaveErrorFraction, 1);
});
test('evaluation: fragments cannot claim multiple matches to one note', () => {
  const m = evaluateMelody([n(69, 0, 0.02), n(69, 0.025, 0.3)], [n(69, 0)]);
  assert.equal(m.note.matches, 1); assert.equal(m.note.precision, 0.5);
});
test('evaluation: missing and extra notes count against recall and precision', () => {
  const m = evaluateMelody([truth[0], n(80, 0.5)], truth);
  assert.equal(m.note.precision, 0.5); assert.equal(m.note.recall, 1 / 3);
  assert.ok(m.frame.voicingRecall < 1);
});
test('evaluation: onset tolerance and mean error are measured in seconds', () => {
  const m = evaluateMelody([n(69, 0.03)], [n(69, 0)]);
  assert.equal(m.note.matches, 1); assert.equal(m.note.meanOnsetErrorSeconds, 0.03);
  assert.equal(evaluateMelody([n(69, 0.06)], [n(69, 0)]).note.matches, 0);
});
test('evaluation: an explicitly annotated region excludes unrelated song sections', () => {
  const m = evaluateMelody([...truth, n(80, 8)], truth, { startSeconds: 0, endSeconds: 2 });
  assert.equal(m.note.f1, 1);
});
test('evaluation: empty references are undefined, not perfect accuracy', () => {
  const m = evaluateMelody([], []);
  assert.equal(m.note.f1, null); assert.equal(m.frame.rawPitchAccuracy, null);
});
test('evaluation: rejects polyphonic/invalid truth and bounds edit-distance work', () => {
  assert.throws(() => evaluateMelody([n(69, 0), n(70, 0.1)], truth), /monophonic/);
  assert.throws(() => evaluateMelody([n(NaN, 0)], truth), /Invalid/);
  assert.equal(sequenceEditDistance([1, 2], [1, 3, 2]), 1);
  assert.equal(sequenceEditDistance(Array(3000), Array(3000)), null);
});
