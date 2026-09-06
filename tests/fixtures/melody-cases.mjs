// These are constructed counterexamples, not recordings or accuracy benchmarks.
export const note = (midi, startSeconds, durationSeconds = 0.4, salience = 0.8, extra = {}) => ({
  pitchMidi: midi, startTimeSeconds: startSeconds, durationSeconds, amplitude: salience, ...extra,
});
const line = (pitches, salience = 0.8, step = 0.5) => pitches.map((midi, i) => note(midi, i * step, step * 0.9, salience));
const chords = (pitches, times, salience = 0.65) => times.flatMap((t) => pitches.map((p) => note(p, t, 0.3, salience)));

export const extractionCases = [
  { name: 'melody above chords', events: [...line([72, 74, 76, 74]), ...chords([48, 55, 60], [0, 0.5, 1, 1.5])], expected: [72, 74, 76, 74] },
  { name: 'melody below high accompaniment', events: [...line([64, 66, 67, 66]), ...line([88, 88, 88, 88], 0.56)], expected: [64, 66, 67, 66] },
  { name: 'louder bass than melody', events: [...line([67, 69, 71, 69]), ...line([36, 36, 38, 38], 0.98)], expected: [67, 69, 71, 69] },
  { name: 'sustained melody over changing chords', events: [note(74, 0, 2, 0.88), ...chords([48, 55, 60], [0, 0.5, 1, 1.5], 0.7)], expected: [74] },
  { name: 'real melodic leaps', events: line([60, 67, 72, 60], 0.9), expected: [60, 67, 72, 60] },
  { name: 'legitimate rapid melody', events: line([72, 74, 76, 77, 79], 0.92, 0.07).map((e) => ({ ...e, onsetConfidence: 0.95 })), expected: [72, 74, 76, 77, 79] },
  { name: 'rest boundary', events: [note(72, 0, 0.4), note(74, 2, 0.4)], expected: [72, 74] },
  { name: 'melody disappears while chords continue', events: [note(72, 0, 0.4, 0.9), note(74, 2, 0.4, 0.9), ...chords([48, 55, 60], [0.6, 1.1, 1.6], 0.5)], expected: [72, 74] },
  { name: 'melody changes register', events: line([60, 64, 67, 72, 76, 79], 0.88), expected: [60, 64, 67, 72, 76, 79] },
  { name: 'weaker counter melody', events: [...line([72, 74, 76, 74], 0.9), ...line([67, 65, 64, 65], 0.55)], expected: [72, 74, 76, 74] },
  { name: 'dense simultaneous events', events: [...line([76, 77, 79, 77], 0.96), ...chords(Array.from({ length: 19 }, (_, i) => 40 + i * 2), [0, 0.5, 1, 1.5], 0.48)], expected: [76, 77, 79, 77] },
  { name: 'chromatic melody', events: line([69, 70, 71, 72, 71, 70], 0.9), expected: [69, 70, 71, 72, 71, 70] },
  { name: 'continuous high accompaniment below established lead support', events: [note(88, 0, 2.5, 0.51), ...line([67, 69, 71, 72, 71], 0.85)], expected: [67, 69, 71, 72, 71] },
];

export const cleanupCases = [
  { name: 'one short octave glitch', notes: [note(69, 0, 0.3), note(81, 0.3, 0.06, 0.4), note(69, 0.36, 0.5)], expected: [69] },
  { name: 'vibrato around stable A', notes: [note(69, 0, 0.3), note(70, 0.3, 0.06, 0.4), note(69, 0.36, 0.25), note(68, 0.61, 0.07, 0.4), note(69, 0.68, 0.3)], expected: [69] },
  { name: 'same pitch fragmentation', notes: [note(69, 0, 0.2), note(69, 0.19, 0.3), note(69, 0.5, 0.4)], expected: [69] },
  { name: 'intentional retrigger', notes: [note(69, 0, 0.3), note(69, 0.31, 0.3, 0.85, { onsetConfidence: 0.95 })], expected: [69, 69] },
  { name: 'brief low confidence noise', notes: [note(69, 0, 0.4), note(94, 0.5, 0.02, 0.16), note(71, 0.7, 0.4)], expected: [69, 71] },
  { name: 'important short chromatic passing tone', notes: [note(69, 0, 0.3), note(70, 0.3, 0.06, 0.9, { onsetConfidence: 0.95 }), note(71, 0.36, 0.5)], expected: [69, 70, 71] },
  { name: 'recognizable contour with optional weak ornament', notes: [note(60, 0, 0.5), note(62, 0.5, 0.4), note(63, 0.9, 0.05, 0.35), note(62, 0.95, 0.35), note(67, 1.3, 0.6)], expected: [60, 62, 67] },
];
