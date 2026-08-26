const PITCH_CLASS = Object.freeze({
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5,
  "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
});

export function frequencyForNote(pitch, octave) {
  const pitchClass = PITCH_CLASS[pitch];
  if (pitchClass === undefined || !Number.isFinite(octave)) return 0;
  const midi = (octave + 1) * 12 + pitchClass;
  return 440 * (2 ** ((midi - 69) / 12));
}

function safeBeat(value, fallback, allowZero) {
  const number = Number(value);
  return Number.isFinite(number) && (allowZero ? number >= 0 : number > 0) ? number : fallback;
}

export function buildPlaybackPlan(phrases, rhythm, bpm = 90) {
  const millisecondsPerBeat = 60000 / Math.min(240, Math.max(30, Number(bpm) || 90));
  const durations = rhythm?.durations ?? [];
  const gaps = rhythm?.gaps ?? [];
  let globalIndex = 0;

  return phrases.flatMap((phrase, phraseIndex) => phrase.map((note, noteIndex) => ({
    note,
    globalIndex: globalIndex++,
    durationMs: safeBeat(durations[phraseIndex]?.[noteIndex], 1, false) * millisecondsPerBeat,
    delayMs: safeBeat(gaps[phraseIndex]?.[noteIndex], 0, true) * millisecondsPerBeat,
  })));
}
