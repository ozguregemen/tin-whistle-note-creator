const PITCH_CLASS = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
const SOLFEGE = new Map([
  ["do", "C"], ["do#", "C#"], ["re", "D"], ["re#", "D#"], ["ré", "D"],
  ["mi", "E"], ["fa", "F"], ["fa#", "F#"], ["sol", "G"], ["sol#", "G#"],
  ["la", "A"], ["la#", "A#"], ["si", "B"], ["sib", "A#"],
]);

export function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#039;", "'")
    .replaceAll("&nbsp;", " ");
}

export function plainTitle(value) {
  return decodeEntities(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function pitchFromToken(raw) {
  const token = raw.toLocaleLowerCase("tr-TR")
    .replaceAll("♯", "#").replaceAll("♭", "b")
    .replace(/^[^a-zçğıöşü#]+|[^a-zçğıöşü#b]+$/gi, "");
  if (SOLFEGE.has(token)) return SOLFEGE.get(token);
  const western = token.match(/^([a-g])([#b]?)$/i);
  if (!western) return null;
  let pitch = western[1].toUpperCase();
  if (western[2] === "#") pitch += "#";
  if (western[2] === "b") pitch = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" }[`${pitch}b`] || pitch;
  return pitch;
}

export function extractTextPhrases(html) {
  const lines = decodeEntities(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  return lines.map((line) => {
    const tokens = line.split(/\s+/).filter(Boolean);
    const notes = tokens.map(pitchFromToken).filter(Boolean);
    return notes.length >= 3 && notes.length / tokens.length >= 0.6 ? notes : [];
  }).filter((notes) => notes.length > 0);
}

function midiCandidates(pitch) {
  const pitchClass = PITCH_CLASS[pitch];
  if (pitchClass === undefined) return [];
  const candidates = [];
  for (let octave = 4; octave <= 6; octave += 1) {
    const midi = 12 * (octave + 1) + pitchClass;
    if (midi >= 62 && midi <= 86) candidates.push({ midi, octave });
  }
  return candidates;
}

export function addEstimatedOctaves(phrases) {
  let previousMidi = null;
  return phrases.map((phrase) => phrase.map((pitch) => {
    const candidates = midiCandidates(pitch);
    if (!candidates.length) return `${pitch}4`;
    const selected = candidates.reduce((best, candidate) => {
      const anchor = previousMidi ?? 69;
      const movement = Math.abs(candidate.midi - anchor);
      const downwardPenalty = previousMidi !== null && candidate.midi < previousMidi ? 3 : 0;
      const score = movement + downwardPenalty;
      return !best || score < best.score ? { ...candidate, score } : best;
    }, null);
    previousMidi = selected.midi;
    return `${pitch}${selected.octave}`;
  }));
}

export function phrasesToString(phrases) {
  return phrases.map((phrase) => phrase.join(" ")).filter(Boolean).join(" | ");
}

export function extractScoreAssets(html) {
  const decoded = decodeEntities(html);
  const pdfs = [...decoded.matchAll(/<a\b[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>/gi)].map((match) => match[1]);
  const images = [...decoded.matchAll(/<img\b[^>]*(?:src|data-lazy-src)=["']([^"']+\.(?:jpe?g|png)(?:\?[^"']*)?)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter((url) => /\/wp-content\/uploads\//i.test(url));
  const musescore = [...decoded.matchAll(/<iframe\b[^>]*src=["'](https:\/\/musescore\.com\/[^"']+)["'][^>]*>/gi)].map((match) => match[1]);
  return {
    preferred: [...new Set(pdfs.length ? pdfs : images)],
    pdfs: [...new Set(pdfs)],
    images: [...new Set(images)],
    musescore: [...new Set(musescore)],
  };
}

function tagValue(xml, tag) {
  return xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]+)</${tag}>`, "i"))?.[1]?.trim();
}

const TYPE_BEATS = Object.freeze({
  whole: 4, half: 2, quarter: 1, eighth: 0.5, "16th": 0.25, "32nd": 0.125,
});

function noteDurationBeats(note, divisions) {
  const duration = Number(tagValue(note, "duration"));
  if (Number.isFinite(duration) && duration > 0 && divisions > 0) return duration / divisions;
  const type = tagValue(note, "type")?.toLowerCase();
  let beats = TYPE_BEATS[type] || 1;
  const dots = [...note.matchAll(/<dot\b[^>]*\/?>/gi)].length;
  let addition = beats / 2;
  for (let index = 0; index < dots; index += 1) {
    beats += addition;
    addition /= 2;
  }
  return beats;
}

export function musicXmlToTimedPhrases(xml) {
  const part = xml.match(/<part\b[^>]*>[\s\S]*?<\/part>/i)?.[0] || xml;
  const measures = [...part.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/gi)];
  let divisions = 1;
  let pendingGap = 0;
  const measureEvents = measures.map((measure) => {
    const declaredDivisions = Number(tagValue(measure[1], "divisions"));
    if (Number.isFinite(declaredDivisions) && declaredDivisions > 0) divisions = declaredDivisions;
    const events = [];
    for (const noteMatch of measure[1].matchAll(/<note\b[^>]*>([\s\S]*?)<\/note>/gi)) {
      const note = noteMatch[1];
      if (/<chord\b/i.test(note) || /<grace\b/i.test(note)) continue;
      const staff = tagValue(note, "staff");
      const voice = tagValue(note, "voice");
      if ((staff && staff !== "1") || (voice && voice !== "1")) continue;
      const durationBeats = noteDurationBeats(note, divisions);
      if (/<rest\b/i.test(note)) {
        pendingGap += durationBeats;
        continue;
      }
      const step = tagValue(note, "step")?.toUpperCase();
      const octave = Number(tagValue(note, "octave"));
      const alter = Number(tagValue(note, "alter") || 0);
      if (!step || !Number.isInteger(octave)) continue;
      let pitch = step;
      if (alter === 1) pitch += "#";
      else if (alter === -1) pitch = { D: "C#", E: "D#", G: "F#", A: "G#", B: "A#" }[step] || step;
      events.push({ note: `${pitch}${octave}`, durationBeats, gapBeforeBeats: pendingGap });
      pendingGap = 0;
    }
    return events;
  });

  const phrases = [];
  const durations = [];
  const gaps = [];
  for (let index = 0; index < measureEvents.length; index += 4) {
    const events = measureEvents.slice(index, index + 4).flat();
    if (!events.length) continue;
    phrases.push(events.map((event) => event.note));
    durations.push(events.map((event) => event.durationBeats));
    gaps.push(events.map((event) => event.gapBeforeBeats));
  }

  const soundTempo = Number(xml.match(/<sound\b[^>]*\btempo=["']([^"']+)["']/i)?.[1]);
  const metronomeTempo = Number(tagValue(xml, "per-minute"));
  const tempo = [soundTempo, metronomeTempo].find((value) => Number.isFinite(value) && value > 0) || 90;
  return { phrases, durations, gaps, tempo };
}

export function musicXmlToPhrases(xml) {
  return musicXmlToTimedPhrases(xml).phrases;
}

export function slugify(value) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replaceAll("ı", "i").replaceAll("ş", "s")
    .replaceAll("ğ", "g").replaceAll("ç", "c").replaceAll("ö", "o").replaceAll("ü", "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function mergeSongIntoCatalog(catalog, song) {
  const songs = Array.isArray(catalog?.songs) ? [...catalog.songs] : [];
  const index = songs.findIndex((item) => item.id === song.id);
  if (index === -1) songs.push(song);
  else songs[index] = song;
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), songs };
}
