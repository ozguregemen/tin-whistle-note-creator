const KNOWN_TEMPO_SOURCES = new Set(["score", "curated", "database"]);
const RHYTHM_SOURCES = new Set(["score", "text"]);

function notePhrases(notes) {
  if (typeof notes !== "string") return [];
  return notes.split("|").map((phrase) => phrase.trim().split(/\s+/).filter(Boolean)).filter((phrase) => phrase.length > 0);
}

function melodyQuality(song) {
  if (song?.sourceStatus === "manual") return "manual";
  if (song?.sourceStatus === "cross-checked") return "cross-checked";
  if (song?.sourceConfidence === "omr-unreviewed") return "omr-unreviewed";
  if (song?.sourceConfidence === "estimated") return "text-estimated";
  return "sourced";
}

export function assessSongQuality(song) {
  const melody = melodyQuality(song);
  const rhythm = RHYTHM_SOURCES.has(song?.rhythm?.source) ? song.rhythm.source : "equal-beats";
  const tempo = KNOWN_TEMPO_SOURCES.has(song?.rhythm?.tempoSource) ? "known" : "default";
  const tone = melody === "cross-checked" ? "verified" : melody === "omr-unreviewed" ? "warning" : "info";
  return { melody, rhythm, tempo, tone };
}

function timedArrayErrors(song, field, phrases) {
  const values = song?.rhythm?.[field];
  if (!Array.isArray(values) || values.length === 0) return [];
  const errors = [];
  if (values.length !== phrases.length) {
    errors.push(`${field} has ${values.length} phrase(s), expected ${phrases.length}`);
    return errors;
  }
  values.forEach((phraseValues, phraseIndex) => {
    if (!Array.isArray(phraseValues) || phraseValues.length !== phrases[phraseIndex].length) {
      errors.push(`${field}[${phraseIndex}] has ${Array.isArray(phraseValues) ? phraseValues.length : 0} value(s), expected ${phrases[phraseIndex].length}`);
      return;
    }
    if (phraseValues.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0 || (field === "durations" && Number(value) === 0))) {
      errors.push(`${field}[${phraseIndex}] contains an invalid beat value`);
    }
  });
  return errors;
}

export function auditCatalogQuality(catalog) {
  const songs = Array.isArray(catalog?.songs) ? catalog.songs : [];
  const errors = [];
  const warnings = [];
  const seenIds = new Set();
  const summary = {
    songs: songs.length,
    crossChecked: 0,
    withRhythm: 0,
    withKnownTempo: 0,
    unreviewedOmr: 0,
    equalBeatFallback: 0,
    defaultTempo: 0,
  };

  songs.forEach((song, index) => {
    const id = typeof song?.id === "string" && song.id.trim() ? song.id : `song-${index + 1}`;
    if (!song?.id || !song?.title || !song?.notes) errors.push({ id, message: "id, title and notes are required" });
    if (seenIds.has(id)) errors.push({ id, message: "duplicate song id" });
    seenIds.add(id);

    const phrases = notePhrases(song?.notes);
    if (phrases.length === 0) errors.push({ id, message: "note sequence is empty" });
    for (const message of [...timedArrayErrors(song, "durations", phrases), ...timedArrayErrors(song, "gaps", phrases)]) {
      errors.push({ id, message });
    }
    if (song?.rhythm?.bpm !== undefined && (!Number.isFinite(Number(song.rhythm.bpm)) || Number(song.rhythm.bpm) < 30 || Number(song.rhythm.bpm) > 240)) {
      errors.push({ id, message: "BPM must be between 30 and 240" });
    }
    if (!Array.isArray(song?.sources) || song.sources.length === 0 || !song.sources.some((source) => source?.role === "note-source")) {
      errors.push({ id, message: "at least one note source is required" });
    }

    const quality = assessSongQuality(song);
    if (quality.melody === "cross-checked") summary.crossChecked += 1;
    if (quality.melody === "omr-unreviewed") {
      summary.unreviewedOmr += 1;
      warnings.push({ id, code: "melody-unreviewed", message: "machine-read melody has not been cross-checked" });
    }
    if (quality.rhythm === "equal-beats") {
      summary.equalBeatFallback += 1;
      warnings.push({ id, code: "rhythm-equal-beats", message: "source has no note durations; equal beats will be used" });
    } else {
      summary.withRhythm += 1;
    }
    if (quality.tempo === "known") {
      summary.withKnownTempo += 1;
    } else {
      summary.defaultTempo += 1;
      warnings.push({ id, code: "tempo-default", message: "original tempo is unknown; practice default will be used" });
    }
  });

  return { summary, errors, warnings };
}
