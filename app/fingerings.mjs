const SIMPLE_CHROMATIC_FINGERINGS = Object.freeze({
  D: "111111",
  "D#": "11111h",
  E: "111110",
  F: "1111h0",
  "F#": "111100",
  G: "111000",
  "G#": "11h000",
  A: "110000",
  "A#": "101111",
  B: "100000",
  C: "011000",
  "C#": "000000",
});

const EXTENDED_UPPER_FINGERINGS = Object.freeze({
  D5: "011111",
  D6: "011111",
  E6: "111111",
  "F#6": "111101",
  G6: "111001",
});

const PITCH_CLASS = Object.freeze({
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5,
  "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
});
const PITCHES = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
const DIFFICULT_PITCHES = new Set(["D#", "F", "G#", "A#"]);

function noteNumber(pitch, octave) {
  const pitchClass = PITCH_CLASS[pitch];
  return pitchClass === undefined ? Number.NaN : (octave + 1) * 12 + pitchClass;
}

const SIMPLE_LOWEST = noteNumber("D", 4);
const SECOND_REGISTER_START = noteNumber("D", 5);
const SIMPLE_HIGHEST = noteNumber("C#", 6);
const SEMITONE_SHIFTS = Object.freeze(Array.from({ length: 73 }, (_, index) => index - 36));
const OCTAVE_SHIFTS = Object.freeze(SEMITONE_SHIFTS.filter((shift) => shift % 12 === 0));

function pitchAndOctave(number) {
  const pitchClass = ((number % 12) + 12) % 12;
  return { pitch: PITCHES[pitchClass], octave: Math.floor(number / 12) - 1 };
}

function shiftedNote(note, semitoneShift) {
  const number = noteNumber(note.pitch, note.octave) + semitoneShift;
  const shifted = pitchAndOctave(number);
  return { ...note, ...shifted, holes: fingeringFor(shifted.pitch, shifted.octave) };
}

export function fingeringFor(pitch, octave) {
  const extended = EXTENDED_UPPER_FINGERINGS[`${pitch}${octave}`];
  if (extended) return extended;

  const number = noteNumber(pitch, octave);
  if (number < SIMPLE_LOWEST || number > SIMPLE_HIGHEST) return undefined;
  return SIMPLE_CHROMATIC_FINGERINGS[pitch];
}

export function isUpperWhistleRegister(pitch, octave) {
  return noteNumber(pitch, octave) >= SECOND_REGISTER_START;
}

function registerCandidates(pitch) {
  const pitchClass = PITCH_CLASS[pitch];
  if (pitchClass === undefined) return [];
  const candidates = [];
  for (let octave = 4; octave <= 6; octave += 1) {
    const midi = noteNumber(pitch, octave);
    if (midi >= SIMPLE_LOWEST && midi <= SIMPLE_HIGHEST) candidates.push({ pitch, octave, midi });
  }
  return candidates;
}

/**
 * Assign unmarked pitch-class-only text notes to the first row of the Clarke D
 * chart. A source that omits octave marks does not contain enough information
 * to infer upper-register notes reliably, so we do not invent them. Exact
 * score pitches and explicit D'/D+ style input bypass this fallback.
 */
export function estimateDWhistleRegisters(phrases) {
  return phrases.map((phrase) => phrase.map((note) => {
    const firstRegister = registerCandidates(note.pitch)[0];
    return firstRegister
      ? { ...note, pitch: firstRegister.pitch, octave: firstRegister.octave }
      : note;
  }));
}

function shiftScore(notes, semitoneShift) {
  const shifted = notes.map((note) => shiftedNote(note, semitoneShift));
  const playable = shifted.filter((note) => note.holes).length;
  const upperLoad = shifted.reduce((total, note) => {
    const number = noteNumber(note.pitch, note.octave);
    return total + Math.max(0, number - (SECOND_REGISTER_START - 1));
  }, 0);
  const difficultFingerings = shifted.reduce((total, note) => total + (DIFFICULT_PITCHES.has(note.pitch) ? 1 : 0), 0);
  return { semitoneShift, playable, upperLoad, difficultFingerings };
}

function betterShift(candidate, best) {
  if (!best || candidate.playable !== best.playable) return !best || candidate.playable > best.playable;
  if (Math.abs(candidate.semitoneShift) !== Math.abs(best.semitoneShift)) {
    return Math.abs(candidate.semitoneShift) < Math.abs(best.semitoneShift);
  }
  if (candidate.upperLoad !== best.upperLoad) return candidate.upperLoad < best.upperLoad;
  if (candidate.difficultFingerings !== best.difficultFingerings) return candidate.difficultFingerings < best.difficultFingerings;
  return candidate.semitoneShift < best.semitoneShift;
}

/** Choose one fixed transposition for the entire melody. Relative intervals are preserved. */
export function bestWhistleSemitoneShift(notes) {
  if (!notes.length) return 0;
  const original = shiftScore(notes, 0);
  // The Clarke chart intentionally includes both registers. Do not change a
  // song's key merely because it uses the upper register; transpose only when
  // the source actually falls outside the supported D-whistle range.
  if (original.playable === notes.length) return 0;

  let best = null;
  for (const shift of SEMITONE_SHIFTS) {
    const candidate = shiftScore(notes, shift);
    if (betterShift(candidate, best)) best = candidate;
  }
  return best?.semitoneShift ?? 0;
}

export function bestWhistleOctaveShift(notes) {
  let best = null;
  for (const shift of OCTAVE_SHIFTS) {
    const candidate = shiftScore(notes, shift);
    if (betterShift(candidate, best)) best = candidate;
  }
  return best?.semitoneShift ?? 0;
}

export function arrangePhrasesForDWhistle(phrases) {
  const semitoneShift = bestWhistleSemitoneShift(phrases.flat());
  return {
    semitoneShift,
    phrases: phrases.map((phrase) => phrase.map((note) => shiftedNote(note, semitoneShift))),
  };
}

export function adaptPhrasesToDWhistle(phrases) {
  return arrangePhrasesForDWhistle(phrases).phrases;
}

export const CHROMATIC_FINGERINGS = SIMPLE_CHROMATIC_FINGERINGS;
