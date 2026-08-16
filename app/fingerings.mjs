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
  D6: "011111",
  E6: "111111",
  "F#6": "111101",
  G6: "111001",
});

const PITCH_CLASS = Object.freeze({
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5,
  "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
});

const SIMPLE_LOWEST = noteNumber("D", 4);
const SIMPLE_HIGHEST = noteNumber("C#", 6);
const OCTAVE_SHIFTS = Object.freeze([-36, -24, -12, 0, 12, 24, 36]);

function noteNumber(pitch, octave) {
  const pitchClass = PITCH_CLASS[pitch];
  return pitchClass === undefined ? Number.NaN : (octave + 1) * 12 + pitchClass;
}

export function fingeringFor(pitch, octave) {
  const extended = EXTENDED_UPPER_FINGERINGS[`${pitch}${octave}`];
  if (extended) return extended;

  const number = noteNumber(pitch, octave);
  if (number < SIMPLE_LOWEST || number > SIMPLE_HIGHEST) return undefined;
  return SIMPLE_CHROMATIC_FINGERINGS[pitch];
}

function playableCount(notes, semitoneShift) {
  return notes.reduce((count, note) => {
    const shiftedOctave = note.octave + semitoneShift / 12;
    return count + (fingeringFor(note.pitch, shiftedOctave) ? 1 : 0);
  }, 0);
}

export function bestWhistleOctaveShift(notes) {
  let bestShift = 0;
  let bestCount = -1;

  for (const shift of OCTAVE_SHIFTS) {
    const count = playableCount(notes, shift);
    if (count > bestCount || (count === bestCount && Math.abs(shift) < Math.abs(bestShift))) {
      bestShift = shift;
      bestCount = count;
    }
  }
  return bestShift;
}

export function adaptPhrasesToDWhistle(phrases) {
  const shift = bestWhistleOctaveShift(phrases.flat());
  const octaveShift = shift / 12;
  return phrases.map((phrase) => phrase.map((note) => {
    const octave = note.octave + octaveShift;
    return { ...note, octave, holes: fingeringFor(note.pitch, octave) };
  }));
}

export const CHROMATIC_FINGERINGS = SIMPLE_CHROMATIC_FINGERINGS;
