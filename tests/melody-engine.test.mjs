import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPredominantMelody, melodyFromEvents, simplifyMelody, quantizeMelody, estimateTonalContext } from '../app/melody-engine.mjs';
import { extractionCases, cleanupCases, note } from './fixtures/melody-cases.mjs';

for (const c of extractionCases) test(`extraction: ${c.name}`, () => {
  const result = extractPredominantMelody(c.events);
  assert.deepEqual(result.notes.map((n) => n.midi), c.expected);
  for (let i = 1; i < result.notes.length; i++) assert.ok(result.notes[i - 1].startSeconds + result.notes[i - 1].durationSeconds <= result.notes[i].startSeconds + 1e-6);
});
for (const c of cleanupCases) test(`cleanup: ${c.name}`, () => {
  const input = structuredClone(c.notes);
  const result = simplifyMelody(c.notes);
  assert.deepEqual(result.notes.map((n) => n.midi), c.expected);
  assert.deepEqual(c.notes, input, 'caller evidence must remain intact');
});
test('neutral melody retains absolute timing, inter-phrase silence and long notes', () => {
  const result = melodyFromEvents([note(72, 0.2, 8, 0.9), note(74, 12, 0.4, 0.9)]);
  assert.equal(result.pitchConvention, 'concert-midi');
  assert.equal(result.notes[0].durationSeconds, 8);
  assert.equal(result.notes[1].startSeconds, 12);
  assert.equal(result.phrases.length, 2);
  assert.equal(result.estimatedTempo, null);
});
test('equally strong competing lines report ambiguity, never verified accuracy', () => {
  const result = melodyFromEvents([note(67, 0, 1), note(72, 0, 1)]);
  assert.equal(result.confidence.level, 'low');
  assert.equal(result.confidence.kind, 'uncalibrated-evidence');
  assert.equal(result.confidence.reviewRecommended, true);
});
test('quantization abstains without confident tempo and beat phase', () => {
  const notes = [{ midi: 69, startSeconds: 0.249, durationSeconds: 0.25 }];
  assert.equal(quantizeMelody(notes, { bpm: 120, confidence: 0.3, offsetSeconds: 0 }), notes);
  assert.equal(quantizeMelody(notes, { bpm: 120, confidence: 1 }), notes);
  assert.equal(quantizeMelody(notes, { bpm: 120, offsetSeconds: 0 }), notes);
  assert.equal(quantizeMelody(notes, { bpm: 120, confidence: 1, offsetSeconds: 0 })[0].startSeconds, 0.25);
});

test('overlapping tails do not swallow strong same-pitch attacks', () => {
  const result = melodyFromEvents([note(69, 0, 1, 0.95, { onsetConfidence: 0.95 }), note(69, 0.5, 1, 0.8, { onsetConfidence: 0.95 })]);
  assert.deepEqual(result.notes.map((n) => [n.midi, n.startSeconds, n.durationSeconds]), [[69, 0, 0.5], [69, 0.5, 1]]);
});

test('strong short semitone and octave excursions remain legitimate ornaments', () => {
  for (const midi of [70, 81]) {
    const result = simplifyMelody([note(69, 0, 0.3), note(midi, 0.3, 0.06, 0.9, { onsetConfidence: 0.95 }), note(69, 0.36, 0.4)]);
    assert.deepEqual(result.notes.map((n) => n.midi), [69, midi, 69]);
  }
});

test('selection retains a strong 60ms return leap with no competing voice', () => {
  for (const midi of [76, 79, 84]) {
    const result = melodyFromEvents([note(72, 0, 0.25, 0.92, { onsetConfidence: 0.95 }),
      note(midi, 0.25, 0.06, 0.92, { onsetConfidence: 0.95 }), note(72, 0.31, 0.25, 0.92, { onsetConfidence: 0.95 })]);
    assert.deepEqual(result.notes.map((n) => n.midi), [72, midi, 72]);
  }
});

test('merged fragments retain weak evidence instead of taking maximum support', () => {
  const result = simplifyMelody([note(69, 0, 1, 0.9), note(69, 1, 1, 0.3)]);
  assert.ok(Math.abs(result.notes[0].salience - 0.6) < 1e-6);
});

test('nonfinite salience cannot become high-confidence evidence', () => {
  assert.equal(melodyFromEvents([note(69, 0, 1, Infinity)]).notes.length, 0);
});

test('tonal prior describes a pitch-class set but never forces a chromatic note into it', () => {
  const scale = [60, 62, 64, 65, 67, 69, 71].map((midi, i) => ({ midi, startSeconds: i, durationSeconds: 1, salience: 0.9 }));
  const context = estimateTonalContext(scale);
  assert.equal(context.ambiguous, false);
  assert.deepEqual([...context.pitchClasses].sort((a, b) => a - b), [0, 2, 4, 5, 7, 9, 11]);
  assert.equal(context.tonic, undefined, 'scale membership alone cannot identify tonic/mode');
  const melody = simplifyMelody([...scale, note(69, 7, 0.3), note(70, 7.3, 0.06, 0.95, { onsetConfidence: 0.95 }), note(69, 7.36, 0.5)]);
  assert.ok(melody.notes.some((n) => n.midi === 70));
});

test('shuffling evidence order cannot change the selected pitch sequence', () => {
  const events = extractionCases[0].events;
  assert.deepEqual(melodyFromEvents([...events].reverse()).notes.map((n) => n.midi), melodyFromEvents(events).notes.map((n) => n.midi));
});
test('malformed events and silence produce an empty low-confidence melody', () => {
  const result = melodyFromEvents([{}, note(NaN, 0), note(60, -1), note(60, 0, 0), note(128, 0)]);
  assert.equal(result.notes.length, 0);
  assert.equal(result.confidence.level, 'low');
});
