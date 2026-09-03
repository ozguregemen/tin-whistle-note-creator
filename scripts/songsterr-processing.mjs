const PITCHES = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
const QUARTER_NOTE_TICKS = 960;
const MAX_PHRASE_NOTES = 12;

export function midiToScientificPitch(value) {
  const midi = Math.round(Number(value));
  if (!Number.isFinite(midi) || midi < 0 || midi > 127) return null;
  return `${PITCHES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function isMelodicMetaTrack(track) {
  const instrument = String(track?.instrument || "").toLowerCase();
  return !instrument.includes("drum") && !instrument.includes("percussion") && !instrument.includes("bass");
}

function trackLabel(track) {
  return `${track?.name || ""} ${track?.instrument || ""}`.trim().toLowerCase();
}

function optionalTrackIndex(value) {
  if (value === null || value === undefined || value === "") return null;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

export function songsterrTrackRoleScore(meta, trackIndex, preferredTrackIndex) {
  const track = Array.isArray(meta?.tracks) ? meta.tracks[trackIndex] : null;
  if (!track || !isMelodicMetaTrack(track)) return Number.NEGATIVE_INFINITY;
  const label = trackLabel(track);
  let score = 0;
  if (optionalTrackIndex(meta?.popularTrackVocals) === trackIndex) score += 200;
  if (/\b(vocals?|voice|singer|singing)\b/i.test(label)) score += 140;
  if (/\b(melody|melodic)\b/i.test(label)) score += 110;
  if (/\b(lead|solo)\b/i.test(label)) score += 70;
  if (/\b(rhythm|chords?|backing|accompaniment)\b/i.test(label)) score -= 90;
  if (optionalTrackIndex(meta?.popularTrackGuitar) === trackIndex) score += 15;
  if (optionalTrackIndex(preferredTrackIndex) === trackIndex) score += 10;
  return score;
}

export function rankSongsterrTrackIndices(meta, score, preferredTrackIndex) {
  const metaTracks = Array.isArray(meta?.tracks) ? meta.tracks : [];
  const scoreTracks = Array.isArray(score?.tracks) ? score.tracks : [];
  const trackCount = Math.max(metaTracks.length, scoreTracks.length);
  return Array.from({ length: trackCount }, (_, index) => index)
    .filter((index) => isMelodicMetaTrack(metaTracks[index]) && (!scoreTracks.length || scoreTracks[index]))
    .sort((left, right) => {
      const roleDifference = songsterrTrackRoleScore(meta, right, preferredTrackIndex)
        - songsterrTrackRoleScore(meta, left, preferredTrackIndex);
      return roleDifference || left - right;
    });
}

export function selectSongsterrTrack(meta, score, preferredTrackIndex) {
  return rankSongsterrTrackIndices(meta, score, preferredTrackIndex)[0] ?? -1;
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

function chordRatioFromJsonTrack(track) {
  let soundingBeats = 0;
  let chordBeats = 0;
  for (const measure of Array.isArray(track?.measures) ? track.measures : []) {
    for (const voice of Array.isArray(measure?.voices) ? measure.voices : []) {
      for (const beat of Array.isArray(voice?.beats) ? voice.beats : []) {
        const count = (Array.isArray(beat?.notes) ? beat.notes : [])
          .filter((note) => !note?.rest && Number.isFinite(Number(note?.fret))).length;
        if (count > 0) soundingBeats += 1;
        if (count > 1) chordBeats += 1;
      }
    }
  }
  return soundingBeats ? chordBeats / soundingBeats : 0;
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

function chordRatioFromAlphaTrack(track) {
  let soundingBeats = 0;
  let chordBeats = 0;
  for (const staff of Array.isArray(track?.staves) ? track.staves : []) {
    for (const bar of Array.isArray(staff?.bars) ? staff.bars : []) {
      for (const voice of Array.isArray(bar?.voices) ? bar.voices : []) {
        for (const beat of Array.isArray(voice?.beats) ? voice.beats : []) {
          const count = (Array.isArray(beat?.notes) ? beat.notes : [])
            .filter((note) => note?.isVisible !== false && !note?.isDead && Number.isFinite(Number(note?.realValue))).length;
          if (count > 0) soundingBeats += 1;
          if (count > 1) chordBeats += 1;
        }
      }
    }
  }
  return soundingBeats ? chordBeats / soundingBeats : 0;
}

function melodyMetrics(events, chordRatio = 0) {
  const midi = events.map((event) => Number(event.midi)).filter(Number.isFinite);
  const counts = new Map();
  for (const value of midi) counts.set(value, (counts.get(value) || 0) + 1);
  const dominantCount = Math.max(0, ...counts.values());
  const repeatedCount = midi.slice(1).filter((value, index) => value === midi[index]).length;
  const bars = events.length ? Math.max(...events.map((event) => Number(event.barIndex) || 0)) + 1 : 0;
  return {
    noteCount: midi.length,
    uniquePitches: counts.size,
    pitchSpan: midi.length ? Math.max(...midi) - Math.min(...midi) : 0,
    dominantPitchRatio: midi.length ? dominantCount / midi.length : 1,
    consecutiveRepeatRatio: midi.length > 1 ? repeatedCount / (midi.length - 1) : 1,
    notesPerBar: bars ? midi.length / bars : midi.length,
    chordRatio,
  };
}

export function songsterrMelodyScore(parsed, meta = {}, trackIndex = 0, preferredTrackIndex) {
  const metrics = parsed?.metrics || {};
  const noteCount = Number(metrics.noteCount ?? parsed?.phrases?.flat()?.length ?? 0);
  if (!Number.isFinite(noteCount) || noteCount < 1) return Number.NEGATIVE_INFINITY;
  let score = songsterrTrackRoleScore(meta, trackIndex, preferredTrackIndex);
  const uniquePitches = Number(metrics.uniquePitches || 0);
  const pitchSpan = Number(metrics.pitchSpan || 0);
  const dominantPitchRatio = Number(metrics.dominantPitchRatio || 0);
  const consecutiveRepeatRatio = Number(metrics.consecutiveRepeatRatio || 0);
  const notesPerBar = Number(metrics.notesPerBar || 0);
  const chordRatio = Number(metrics.chordRatio || 0);

  score += uniquePitches >= 7 ? 30 : uniquePitches >= 4 ? 18 : uniquePitches >= 3 ? 5 : -70;
  score += pitchSpan >= 7 && pitchSpan <= 36 ? 20 : pitchSpan > 48 ? -25 : pitchSpan < 3 ? -45 : 0;
  if (dominantPitchRatio > 0.5) score -= 100;
  else if (dominantPitchRatio > 0.35) score -= 55;
  else if (dominantPitchRatio > 0.25) score -= 20;
  score -= Math.round(Math.min(0.8, consecutiveRepeatRatio) * 55);
  score -= Math.round(Math.min(0.8, chordRatio) * 90);
  if (noteCount < 8) score -= 60;
  if (notesPerBar > 12) score -= 35;
  else if (notesPerBar > 8) score -= 15;
  if (noteCount > 2500) score -= 30;
  return score;
}

export function selectBestSongsterrParsedTrack(candidates, meta = {}, preferredTrackIndex) {
  return [...candidates]
    .map((candidate) => ({
      ...candidate,
      selectionScore: songsterrMelodyScore(candidate.parsed, meta, candidate.trackIndex, preferredTrackIndex),
    }))
    .filter((candidate) => Number.isFinite(candidate.selectionScore))
    .sort((left, right) => right.selectionScore - left.selectionScore || left.trackIndex - right.trackIndex)[0] || null;
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
  const events = songsterrJsonTrackEvents(track);
  const grouped = phraseEvents(events, 1)
    .map((phrase) => phrase.filter((event) => event.note));
  return {
    phrases: grouped.map((phrase) => phrase.map((event) => event.note)),
    durations: grouped.map((phrase) => phrase.map((event) => event.duration)),
    gaps: grouped.map((phrase) => phrase.map((event) => event.gap)),
    tempo: null,
    trackIndex,
    metrics: melodyMetrics(events, chordRatioFromJsonTrack(track)),
  };
}

export function guitarProScoreToTimedPhrases(score, meta = {}, preferredTrackIndex) {
  const candidates = rankSongsterrTrackIndices(meta, score, preferredTrackIndex).map((trackIndex) => {
    const events = trackEvents(score.tracks[trackIndex]);
    const grouped = phraseEvents(events).map((phrase) => phrase.filter((event) => event.note));
    return {
      trackIndex,
      parsed: {
        phrases: grouped.map((phrase) => phrase.map((event) => event.note)),
        durations: grouped.map((phrase) => phrase.map((event) => event.duration)),
        gaps: grouped.map((phrase) => phrase.map((event) => event.gap)),
        metrics: melodyMetrics(events, chordRatioFromAlphaTrack(score.tracks[trackIndex])),
      },
    };
  });
  const selected = selectBestSongsterrParsedTrack(candidates, meta, preferredTrackIndex);
  if (!selected) return { phrases: [], durations: [], gaps: [], tempo: null, trackIndex: -1 };
  const tempo = Number(score?.tempo);
  return {
    ...selected.parsed,
    tempo: Number.isFinite(tempo) && tempo >= 30 && tempo <= 240 ? Math.round(tempo) : null,
    trackIndex: selected.trackIndex,
    selectionScore: selected.selectionScore,
  };
}
