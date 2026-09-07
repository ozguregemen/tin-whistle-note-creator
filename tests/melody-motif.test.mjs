import assert from 'node:assert/strict';
import test from 'node:test';
import { compareMelodyMotif } from '../app/melody-evaluation.mjs';
const melody = pitches => pitches.map((midi, i) => ({ midi, startSeconds: i * 0.5, durationSeconds: 0.4 }));

test('untimed arrangement finds a transposed contiguous motif after an unrelated intro', () => {
  const reference = [60, 63, 65, 65, 63, 60];
  const notes = melody([40, 40, 47, 47, ...reference.map(p => p + 2), 33, 34]);
  const before = JSON.stringify(notes);
  const result = compareMelodyMotif(notes, reference);
  assert.equal(result.transposeSemitones, 2); assert.equal(result.pitchEdits, 0);
  assert.equal(result.exactPitchMatches, 6); assert.equal(result.startSeconds, 2);
  assert.equal(result.comparedNotes, 6); assert.equal(result.kind, 'untimed-motif-agreement');
  assert.match(result.caveat, /not an accuracy score/);
  assert.equal(JSON.stringify(notes), before);
});
test('motif comparison preserves repeated notes and cannot hide isolated octave errors', () => {
  const reference = [60, 63, 65, 65, 63, 60];
  const wrongOctave = compareMelodyMotif(melody([60, 63, 77, 65, 63, 60]), reference);
  assert.equal(wrongOctave.pitchEdits, 1);
  const retriggerMissing = compareMelodyMotif(melody([60, 63, 65, 63, 60]), reference);
  assert.equal(retriggerMissing.pitchEdits, 1);
});
test('equal-edit motif alignments retain the greatest number of actual pitch matches', () => {
  const result = compareMelodyMotif(melody([61, 62, 63, 60, 63, 63, 60, 60]), [61, 63, 63, 63],
    { minimumTranspose: 0, maximumTranspose: 0 });
  assert.equal(result.pitchEdits, 2);
  assert.equal(result.exactPitchMatches, 4);
  assert.equal(result.comparedNotes, 6);
});
test('motif comparison respects excerpt boundaries, missing notes and bounded work', () => {
  const reference = [60, 63, 65, 60];
  assert.equal(compareMelodyMotif([], reference), null);
  assert.equal(compareMelodyMotif(melody(reference), reference, { startSeconds: 10 }), null);
  assert.throws(() => compareMelodyMotif([], [60, 61]), /4–64/);
  assert.throws(() => compareMelodyMotif([], reference, { minimumTranspose: -100 }), /bounds/);
  assert.throws(() => compareMelodyMotif(melody(Array(7000).fill(60)), Array(64).fill(60)), /shorter excerpt/);
  const result = compareMelodyMotif(melody([40, 41]), reference);
  assert.ok(result.pitchEdits > 0);
});
