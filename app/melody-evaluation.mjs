/** Small, dependency-free evaluation of monophonic concert-MIDI annotations.
 * Scores describe agreement with a reference, not model confidence. */
function validateNotes(input) {
  if (!Array.isArray(input)) throw new TypeError('Expected a notes array');
  const notes = input.map((n) => ({ midi: n.midi, startSeconds: n.startSeconds, durationSeconds: n.durationSeconds }));
  notes.sort((a, b) => a.startSeconds - b.startSeconds);
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (![n.midi, n.startSeconds, n.durationSeconds].every(Number.isFinite)
      || n.midi < 0 || n.midi > 127 || n.startSeconds < 0 || n.durationSeconds <= 0) throw new TypeError('Invalid reference/prediction note');
    if (i && notes[i - 1].startSeconds + notes[i - 1].durationSeconds > n.startSeconds + 1e-6) throw new TypeError('Evaluation requires monophonic notes');
  }
  return notes;
}
const end = (n) => n.startSeconds + n.durationSeconds;
const chromaDistance = (a, b) => Math.abs(((a - b + 6) % 12 + 12) % 12 - 6);
const ratio = (n, d) => d ? n / d : null;
function matchNotes(prediction, reference, onsetTolerance, pitchTolerance, pitchClass = false) {
  let left = 0;
  const edges = prediction.map((p) => {
    while (left < reference.length && reference[left].startSeconds < p.startSeconds - onsetTolerance) left++;
    const matches = [];
    for (let i = left; i < reference.length && reference[i].startSeconds <= p.startSeconds + onsetTolerance; i++) {
      if ((pitchClass ? chromaDistance(p.midi, reference[i].midi) : Math.abs(p.midi - reference[i].midi)) <= pitchTolerance) matches.push(i);
    }
    return matches;
  });
  const owners = new Map();
  function augment(p, visited) {
    for (const r of edges[p]) {
      if (visited.has(r)) continue;
      visited.add(r);
      if (!owners.has(r) || augment(owners.get(r), visited)) { owners.set(r, p); return true; }
    }
    return false;
  }
  for (let p = 0; p < prediction.length; p++) augment(p, new Set());
  const pairs = [...owners].map(([r, p]) => [p, r]);
  const precision = ratio(pairs.length, prediction.length), recall = ratio(pairs.length, reference.length);
  return { matches: pairs.length, precision, recall,
    f1: prediction.length + reference.length ? 2 * pairs.length / (prediction.length + reference.length) : null,
    meanOnsetErrorSeconds: pairs.length ? pairs.reduce((s, [p, r]) => s + Math.abs(prediction[p].startSeconds - reference[r].startSeconds), 0) / pairs.length : null };
}
export function sequenceEditDistance(a, b) {
  // Annotated excerpts are expected. Do not accidentally run huge O(N*M) work.
  if (a.length * b.length > 6_250_000) return null;
  let previous = Uint32Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const current = new Uint32Array(b.length + 1);
    current[0] = i + 1;
    for (let j = 0; j < b.length; j++) current[j + 1] = Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + (a[i] === b[j] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}
export function evaluateMelody(predicted, expected, options = {}) {
  let prediction = validateNotes(predicted.notes ?? predicted), reference = validateNotes(expected.notes ?? expected);
  const start = options.startSeconds ?? 0;
  const stop = options.endSeconds ?? Math.max(end(prediction.at(-1) || { startSeconds: 0, durationSeconds: 0 }), end(reference.at(-1) || { startSeconds: 0, durationSeconds: 0 }));
  if (!Number.isFinite(start) || !Number.isFinite(stop) || start < 0 || stop < start || stop - start > 3600) throw new RangeError('Invalid evaluation interval (maximum one hour)');
  const clip = (notes) => notes.filter((n) => end(n) > start && n.startSeconds < stop).map((n) => ({ ...n,
    startSeconds: Math.max(start, n.startSeconds), durationSeconds: Math.min(stop, end(n)) - Math.max(start, n.startSeconds) }));
  prediction = clip(prediction); reference = clip(reference);
  if (prediction.length > 10000 || reference.length > 10000) throw new RangeError('Use an annotated excerpt of at most 10000 notes');
  const onsetTolerance = options.onsetToleranceSeconds ?? 0.05, pitchTolerance = options.pitchToleranceSemitones ?? 0.5;
  if (!(onsetTolerance >= 0 && onsetTolerance <= 1) || !(pitchTolerance >= 0 && pitchTolerance <= 1)) throw new RangeError('Invalid matching tolerances');
  const exact = matchNotes(prediction, reference, onsetTolerance, pitchTolerance);
  const pitchClass = matchNotes(prediction, reference, onsetTolerance, pitchTolerance, true);
  let pi = 0, ri = 0, referenceVoiced = 0, predictedVoiced = 0, jointlyVoiced = 0, exactFrames = 0, chromaFrames = 0;
  // 10ms sampling, midpoint avoids boundary double-counting. Conditional pitch
  // accuracy is reported alongside voicing recall to expose excessive rests.
  for (let t = start + 0.005; t < stop; t += 0.01) {
    while (pi < prediction.length && end(prediction[pi]) <= t) pi++;
    while (ri < reference.length && end(reference[ri]) <= t) ri++;
    const p = prediction[pi]?.startSeconds <= t ? prediction[pi] : null;
    const r = reference[ri]?.startSeconds <= t ? reference[ri] : null;
    if (p) predictedVoiced++;
    if (r) referenceVoiced++;
    if (p && r) {
      jointlyVoiced++;
      if (Math.abs(p.midi - r.midi) <= pitchTolerance) exactFrames++;
      if (chromaDistance(p.midi, r.midi) <= pitchTolerance) chromaFrames++;
    }
  }
  const pitches = (notes) => notes.map((n) => Math.round(n.midi));
  const contour = (notes) => pitches(notes).slice(1).map((p, i) => Math.sign(p - notes[i].midi));
  const editDistance = sequenceEditDistance(pitches(prediction), pitches(reference));
  const contourDistance = sequenceEditDistance(contour(prediction), contour(reference));
  return { interval: { startSeconds: start, endSeconds: stop }, predictedNotes: prediction.length, referenceNotes: reference.length,
    note: exact, pitchClassNote: pitchClass,
    frame: { stepSeconds: 0.01, rawPitchAccuracy: ratio(exactFrames, referenceVoiced), rawChromaAccuracy: ratio(chromaFrames, referenceVoiced),
      conditionalPitchAccuracy: ratio(exactFrames, jointlyVoiced), octaveErrorFraction: ratio(chromaFrames - exactFrames, jointlyVoiced),
      voicingPrecision: ratio(jointlyVoiced, predictedVoiced), voicingRecall: ratio(jointlyVoiced, referenceVoiced) },
    pitchEditDistance: editDistance, contourEditDistance: contourDistance,
    contourSimilarity: contourDistance == null || Math.max(prediction.length, reference.length) < 2 ? null
      : 1 - contourDistance / (Math.max(prediction.length, reference.length) - 1),
  };
}
