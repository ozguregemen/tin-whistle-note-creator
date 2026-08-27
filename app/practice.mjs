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

  return phrases.flatMap((phrase, phraseIndex) => phrase.map((note, noteIndex) => {
    const durationBeats = safeBeat(durations[phraseIndex]?.[noteIndex], 1, false);
    const delayBeats = safeBeat(gaps[phraseIndex]?.[noteIndex], 0, true);
    return {
      note,
      globalIndex: globalIndex++,
      durationBeats,
      delayBeats,
      durationMs: durationBeats * millisecondsPerBeat,
      delayMs: delayBeats * millisecondsPerBeat,
    };
  }));
}

export function remainingBeatsAfterElapsed(remainingBeats, elapsedMilliseconds, bpm) {
  const safeRemaining = Math.max(0, Number(remainingBeats) || 0);
  const safeElapsed = Math.max(0, Number(elapsedMilliseconds) || 0);
  const safeBpm = Math.min(240, Math.max(30, Number(bpm) || 90));
  return Math.max(0, safeRemaining - safeElapsed / (60000 / safeBpm));
}

export function buildPhraseRanges(phrases) {
  let start = 0;
  return phrases.map((phrase) => {
    const range = { start, end: start + phrase.length };
    start = range.end;
    return range;
  });
}

export function nextPlaybackIndex(currentIndex, planLength, loopRange) {
  const nextIndex = currentIndex + 1;
  if (loopRange && loopRange.end > loopRange.start && nextIndex >= loopRange.end) {
    return loopRange.start;
  }
  return nextIndex < planLength ? nextIndex : -1;
}
