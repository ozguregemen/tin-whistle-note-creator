const PITCHES = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
const QUARTER_NOTE_TICKS = 960;
const MAX_PHRASE_NOTES = 12;

export function midiToScientificPitch(value) {
  const midi = Math.round(Number(value));
  if (!Number.isFinite(midi) || midi < 0 || midi > 127) return null;
  return `${PITCHES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function isMelodicMetaTrack(track) {
  const instrument = String(track?.instrument || "").toLowerCase();
  return !instrument.includes("drum") && !instrument.includes("percussion") && !instrument.includes("bass");
}

export function selectSongsterrTrack(meta, score, preferredTrackIndex) {
  const scoreTracks = Array.isArray(score?.tracks) ? score.tracks : [];
  const metaTracks = Array.isArray(meta?.tracks) ? meta.tracks : [];
  const preferred = Number(preferredTrackIndex);
  if (Number.isInteger(preferred) && scoreTracks[preferred] && isMelodicMetaTrack(metaTracks[preferred])) return preferred;

  const namedVocal = metaTracks.findIndex((track, index) => scoreTracks[index]
    && isMelodicMetaTrack(track)
    && /vocal|melody|lead/i.test(`${track?.name || ""} ${track?.instrument || ""}`));
  if (namedVocal >= 0) return namedVocal;

  const popularGuitar = Number(meta?.popularTrackGuitar);
  if (Number.isInteger(popularGuitar) && scoreTracks[popularGuitar] && isMelodicMetaTrack(metaTracks[popularGuitar])) {
    return popularGuitar;
  }
  return scoreTracks.findIndex((_, index) => isMelodicMetaTrack(metaTracks[index]));
}

function selectedBeatNote(beat) {
  const notes = Array.isArray(beat?.notes) ? beat.notes : [];
  return notes
    .filter((note) => note?.isVisible !== false && !note?.isDead && Number.isFinite(Number(note?.realValue)))
    .sort((left, right) => Number(right.realValue) - Number(left.realValue))[0] || null;
}

function songsterrJsonBeatNote(beat, tuning) {
  const notes = Array.isArray(beat?.notes) ? beat.notes : [];
  return notes
    .filter((note) => !note?.rest && Number.isInteger(Number(note?.string)) && Number.isFinite(Number(note?.fret)))
    .map((note) => ({
      midi: Number(tuning?.[Number(note.string)]) + Number(note.fret),
      tied: Boolean(note.tie),
    }))
    .filter((note) => Number.isFinite(note.midi))
    .sort((left, right) => right.midi - left.midi)[0] || null;
}

function songsterrJsonTrackEvents(track) {
  const byStart = new Map();
  let measureStart = 0;
  for (const [barIndex, measure] of (Array.isArray(track?.measures) ? track.measures : []).entries()) {
    let measureDuration = 0;
    for (const voice of Array.isArray(measure?.voices) ? measure.voices : []) {
      let voiceStart = 0;
      for (const beat of Array.isArray(voice?.beats) ? voice.beats : []) {
        const [numerator, denominator] = Array.isArray(beat?.duration) ? beat.duration : [];
        const duration = Number(numerator) / Number(denominator) * 4;
        if (!Number.isFinite(duration) || duration <= 0) continue;
        const note = songsterrJsonBeatNote(beat, track.tuning);
        if (note) {
          const event = {
            barIndex,
            start: measureStart + voiceStart,
            duration,
            midi: Math.round(note.midi),
            tied: note.tied,
          };
          const existing = byStart.get(event.start);
          if (!existing || event.midi > existing.midi) byStart.set(event.start, event);
        }
        voiceStart += duration;
      }
      measureDuration = Math.max(measureDuration, voiceStart);
    }
    const [beats, beatUnit] = Array.isArray(measure?.signature) ? measure.signature : [];
    const signatureDuration = Number(beats) / Number(beatUnit) * 4;
    measureStart += Math.max(measureDuration, Number.isFinite(signatureDuration) ? signatureDuration : 0);
  }
  const events = [...byStart.values()].sort((left, right) => left.start - right.start || right.midi - left.midi);
  const merged = [];
  for (const event of events) {
    const previous = merged.at(-1);
    const previousEnd = previous ? previous.start + previous.duration : 0;
    if (event.tied && previous?.midi === event.midi && event.start <= previousEnd + 1e-6) {
      previous.duration = Math.max(previousEnd, event.start + event.duration) - previous.start;
    } else {
      merged.push({ ...event });
    }
  }
  return merged;
}

function trackEvents(track) {
  const byStart = new Map();
  const staves = Array.isArray(track?.staves) ? track.staves : [];
  for (const staff of staves) {
    const bars = Array.isArray(staff?.bars) ? staff.bars : [];
    bars.forEach((bar, barIndex) => {
      for (const voice of Array.isArray(bar?.voices) ? bar.voices : []) {
        for (const beat of Array.isArray(voice?.beats) ? voice.beats : []) {
          const note = selectedBeatNote(beat);
          const start = Number(beat?.absolutePlaybackStart);
          const duration = Number(beat?.playbackDuration);
          if (!note || !Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) continue;
          const event = {
            barIndex,
            start,
            duration,
            midi: Math.round(Number(note.realValue)),
            tied: Boolean(note.isTieDestination),
          };
          const existing = byStart.get(start);
          if (!existing || event.midi > existing.midi) byStart.set(start, event);
        }
      }
    });
  }

  const events = [...byStart.values()].sort((left, right) => left.start - right.start || right.midi - left.midi);
  const merged = [];
  for (const event of events) {
    const previous = merged.at(-1);
    const previousEnd = previous ? previous.start + previous.duration : 0;
    if (event.tied && previous?.midi === event.midi && event.start <= previousEnd + 1) {
      previous.duration = Math.max(previousEnd, event.start + event.duration) - previous.start;
    } else {
      merged.push({ ...event });
    }
  }
  return merged;
}

function phraseEvents(events, ticksPerQuarter = QUARTER_NOTE_TICKS) {
  const phrases = [];
  let current = [];
  let phraseStartBar = 0;
  let previousEnd = 0;
  for (const event of events) {
    const gapBeats = Math.max(0, event.start - previousEnd) / ticksPerQuarter;
    const shouldSplit = current.length > 0 && (
      current.length >= MAX_PHRASE_NOTES
      || gapBeats >= 2
      || event.barIndex - phraseStartBar >= 4
    );
    if (shouldSplit) {
      phrases.push(current);
      current = [];
    }
    if (current.length === 0) phraseStartBar = event.barIndex;
    current.push({
      note: midiToScientificPitch(event.midi),
      duration: Math.max(0.125, Math.min(16, event.duration / ticksPerQuarter)),
      gap: current.length ? gapBeats : 0,
    });
    previousEnd = Math.max(previousEnd, event.start + event.duration);
  }
  if (current.length) phrases.push(current);
  return phrases;
}

export function songsterrTrackJsonToTimedPhrases(track, meta = {}, trackIndex = 0) {
  const metaTrack = Array.isArray(meta?.tracks) ? meta.tracks[trackIndex] : null;
  if (!track || !metaTrack || !isMelodicMetaTrack(metaTrack)) {
    return { phrases: [], durations: [], gaps: [], tempo: null, trackIndex: -1 };
  }
  const grouped = phraseEvents(songsterrJsonTrackEvents(track), 1)
    .map((phrase) => phrase.filter((event) => event.note));
  return {
    phrases: grouped.map((phrase) => phrase.map((event) => event.note)),
    durations: grouped.map((phrase) => phrase.map((event) => event.duration)),
    gaps: grouped.map((phrase) => phrase.map((event) => event.gap)),
    tempo: null,
    trackIndex,
  };
}

export function guitarProScoreToTimedPhrases(score, meta = {}, preferredTrackIndex) {
  const trackIndex = selectSongsterrTrack(meta, score, preferredTrackIndex);
  if (trackIndex < 0) return { phrases: [], durations: [], gaps: [], tempo: null, trackIndex: -1 };
  const grouped = phraseEvents(trackEvents(score.tracks[trackIndex]))
    .map((phrase) => phrase.filter((event) => event.note));
  const tempo = Number(score?.tempo);
  return {
    phrases: grouped.map((phrase) => phrase.map((event) => event.note)),
    durations: grouped.map((phrase) => phrase.map((event) => event.duration)),
    gaps: grouped.map((phrase) => phrase.map((event) => event.gap)),
    tempo: Number.isFinite(tempo) && tempo >= 30 && tempo <= 240 ? Math.round(tempo) : null,
    trackIndex,
  };
}
