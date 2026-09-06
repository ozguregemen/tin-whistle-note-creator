// Frozen pre-refactor baseline. Evaluation only; never imported by application.
const PITCHES = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
const DEFAULT_BPM = 90;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function audibleMidiToWrittenWhistleToken(audibleMidi) {
  const writtenMidi = Math.round(finiteNumber(audibleMidi)) - 12;
  const pitch = PITCHES[((writtenMidi % 12) + 12) % 12];
  const octave = Math.floor(writtenMidi / 12) - 1;
  return `${pitch}${octave}`;
}

function onsetGroups(events, onsetWindowSeconds) {
  const groups = [];
  for (const event of events) {
    const current = groups.at(-1);
    if (!current || event.startTimeSeconds - current[0].startTimeSeconds > onsetWindowSeconds) groups.push([event]);
    else current.push(event);
  }
  return groups;
}

function chooseMelodyPath(groups) {
  if (!groups.length) return [];
  const states = groups.map((group) => group.map((event) => ({ event, score: Number.NEGATIVE_INFINITY, previous: -1 })));

  states[0].forEach((state) => {
    state.score = (state.event.amplitude * 2) + (state.event.pitchMidi * 0.025) + Math.min(state.event.durationSeconds, 1) * 0.1;
  });

  for (let groupIndex = 1; groupIndex < states.length; groupIndex += 1) {
    states[groupIndex].forEach((state) => {
      states[groupIndex - 1].forEach((previous, previousIndex) => {
        const jump = Math.abs(state.event.pitchMidi - previous.event.pitchMidi);
        const continuityPenalty = jump * 0.055 + (jump > 12 ? 0.45 : 0);
        const candidateScore = previous.score
          + (state.event.amplitude * 2)
          + (state.event.pitchMidi * 0.025)
          + Math.min(state.event.durationSeconds, 1) * 0.1
          - continuityPenalty;
        if (candidateScore > state.score) {
          state.score = candidateScore;
          state.previous = previousIndex;
        }
      });
    });
  }

  let stateIndex = states.at(-1).reduce((best, state, index, all) => state.score > all[best].score ? index : best, 0);
  const path = [];
  for (let groupIndex = states.length - 1; groupIndex >= 0; groupIndex -= 1) {
    const state = states[groupIndex][stateIndex];
    path.push(state.event);
    stateIndex = state.previous;
  }
  return path.reverse();
}

function mergeAdjacentMelodyEvents(events, maximumGapSeconds = 0.12) {
  const merged = [];
  for (const event of events) {
    const previous = merged.at(-1);
    const previousEnd = previous ? previous.startTimeSeconds + previous.durationSeconds : 0;
    if (previous && previous.pitchMidi === event.pitchMidi && event.startTimeSeconds <= previousEnd + maximumGapSeconds) {
      previous.durationSeconds = Math.max(previousEnd, event.startTimeSeconds + event.durationSeconds) - previous.startTimeSeconds;
      previous.amplitude = Math.max(previous.amplitude, event.amplitude);
    } else {
      merged.push({ ...event });
    }
  }
  return merged;
}

function phraseMelody(events, bpm, maxPhraseNotes, phraseGapSeconds) {
  const secondsToBeats = bpm / 60;
  const phrases = [];
  let current = [];
  let previousEnd = 0;

  for (const event of events) {
    const gapSeconds = Math.max(0, event.startTimeSeconds - previousEnd);
    if (current.length && (gapSeconds >= phraseGapSeconds || current.length >= maxPhraseNotes)) {
      phrases.push(current);
      current = [];
    }
    current.push({
      token: audibleMidiToWrittenWhistleToken(event.pitchMidi),
      duration: Math.max(0.125, Math.min(8, event.durationSeconds * secondsToBeats)),
      gap: Math.max(0, Math.min(8, (current.length ? gapSeconds : 0) * secondsToBeats)),
    });
    previousEnd = Math.max(previousEnd, event.startTimeSeconds + event.durationSeconds);
  }
  if (current.length) phrases.push(current);
  return phrases;
}

export function melodyFromTranscriptionEvents(noteEvents, options = {}) {
  const minimumAmplitude = finiteNumber(options.minimumAmplitude, 0.25);
  const minimumDurationSeconds = finiteNumber(options.minimumDurationSeconds, 0.08);
  const onsetWindowSeconds = finiteNumber(options.onsetWindowSeconds, 0.075);
  const bpm = Math.min(240, Math.max(30, finiteNumber(options.bpm, DEFAULT_BPM)));
  const filtered = (Array.isArray(noteEvents) ? noteEvents : [])
    .map((event) => ({
      pitchMidi: Math.round(finiteNumber(event?.pitchMidi, Number.NaN)),
      amplitude: finiteNumber(event?.amplitude),
      startTimeSeconds: Math.max(0, finiteNumber(event?.startTimeSeconds)),
      durationSeconds: Math.max(0, finiteNumber(event?.durationSeconds)),
    }))
    .filter((event) => Number.isFinite(event.pitchMidi)
      && event.pitchMidi >= 36
      && event.pitchMidi <= 108
      && event.amplitude >= minimumAmplitude
      && event.durationSeconds >= minimumDurationSeconds)
    .sort((left, right) => left.startTimeSeconds - right.startTimeSeconds || right.pitchMidi - left.pitchMidi);

  const melody = mergeAdjacentMelodyEvents(chooseMelodyPath(onsetGroups(filtered, onsetWindowSeconds)));
  const phrases = phraseMelody(
    melody,
    bpm,
    Math.max(4, Math.round(finiteNumber(options.maxPhraseNotes, 12))),
    finiteNumber(options.phraseGapSeconds, 1.1),
  );
  return {
    notes: phrases.map((phrase) => phrase.map((note) => note.token).join(" ")).join(" | "),
    rhythm: {
      bpm,
      source: "transcribed",
      tempoSource: "default",
      durations: phrases.map((phrase) => phrase.map((note) => note.duration)),
      gaps: phrases.map((phrase) => phrase.map((note) => note.gap)),
    },
    noteCount: melody.length,
  };
}
