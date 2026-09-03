const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const TYPE_BEATS = Object.freeze({ whole: 4, half: 2, quarter: 1, eighth: 0.5, "16th": 0.25, "32nd": 0.125 });
const MELODY_NAME = /\b(?:vocal|voice|melody|lead|solo|sing|flute|whistle|sax|clarinet)\b/i;
const ACCOMPANIMENT_NAME = /\b(?:drum|percussion|bass|rhythm|chord|pad|accompaniment)\b/i;

function tagValue(xml, tag) {
  return xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]+)</${tag}>`, "i"))?.[1]?.trim();
}

function decodeXml(value = "") {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'");
}

function durationFromXml(note, divisions) {
  const duration = Number(tagValue(note, "duration"));
  if (Number.isFinite(duration) && duration > 0 && divisions > 0) return duration / divisions;
  const type = tagValue(note, "type")?.toLowerCase();
  let beats = TYPE_BEATS[type] || 1;
  let addition = beats / 2;
  const dotCount = [...note.matchAll(/<dot\b[^>]*\/?>/gi)].length;
  for (let index = 0; index < dotCount; index += 1) {
    beats += addition;
    addition /= 2;
  }
  return beats;
}

function flattenedScoreScore(score, name = "") {
  const notes = score.phrases.flat();
  if (!notes.length) return -Infinity;
  const unique = new Set(notes).size;
  const nameBonus = MELODY_NAME.test(name) ? 240 : 0;
  const namePenalty = ACCOMPANIMENT_NAME.test(name) ? 180 : 0;
  return nameBonus - namePenalty + Math.min(notes.length, 240) + unique * 3;
}

function parseMusicXmlPart(partXml) {
  const measures = [...partXml.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/gi)];
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
      const durationBeats = durationFromXml(note, divisions);
      if (/<rest\b/i.test(note)) {
        pendingGap += durationBeats;
        continue;
      }
      const step = tagValue(note, "step")?.toUpperCase();
      const octave = Number(tagValue(note, "octave"));
      const alter = Number(tagValue(note, "alter") || 0);
      if (!step || !Number.isInteger(octave) || Math.abs(alter) > 1) continue;
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
  return { phrases, durations, gaps };
}

export function musicXmlToTimedPhrases(xml) {
  if (typeof xml !== "string" || !/<(?:score-partwise|score-timewise)\b/i.test(xml)) {
    throw new Error("This file is not a supported MusicXML score");
  }
  const partNames = new Map([...xml.matchAll(/<score-part\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/score-part>/gi)]
    .map((match) => [match[1], decodeXml(tagValue(match[2], "part-name") || "")]));
  const parts = [...xml.matchAll(/<part\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/part>/gi)]
    .map((match) => {
      const name = partNames.get(match[1]) || "";
      const parsed = parseMusicXmlPart(match[2]);
      return { ...parsed, name, score: flattenedScoreScore(parsed, name) };
    })
    .filter((part) => part.phrases.flat().length > 0)
    .sort((left, right) => right.score - left.score);
  if (!parts.length) throw new Error("No readable melody part was found in this MusicXML file");
  const selected = parts[0];
  const soundTempo = Number(xml.match(/<sound\b[^>]*\btempo=["']([^"']+)["']/i)?.[1]);
  const metronomeTempo = Number(tagValue(xml, "per-minute"));
  const tempo = [soundTempo, metronomeTempo].find((value) => Number.isFinite(value) && value >= 30 && value <= 240) ?? null;
  return { phrases: selected.phrases, durations: selected.durations, gaps: selected.gaps, tempo, trackName: selected.name };
}

function midiNoteName(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function readVariable(bytes, state, end) {
  let value = 0;
  for (let count = 0; count < 4; count += 1) {
    if (state.offset >= end) throw new Error("Unexpected end of MIDI data");
    const byte = bytes[state.offset++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error("Invalid MIDI variable-length value");
}

function readU16(view, offset) { return view.getUint16(offset, false); }
function readU32(view, offset) { return view.getUint32(offset, false); }
function fourCc(bytes, offset) { return String.fromCharCode(...bytes.slice(offset, offset + 4)); }

function parseMidiTrack(bytes, view, start, end, trackIndex) {
  const state = { offset: start };
  const openNotes = new Map();
  const notes = [];
  const tempos = [];
  let tick = 0;
  let runningStatus = 0;
  let name = "";
  while (state.offset < end) {
    tick += readVariable(bytes, state, end);
    let status = bytes[state.offset++];
    if (status < 0x80) {
      if (!runningStatus) throw new Error("MIDI running status is missing");
      state.offset -= 1;
      status = runningStatus;
    } else if (status < 0xf0) runningStatus = status;

    if (status === 0xff) {
      runningStatus = 0;
      const type = bytes[state.offset++];
      const length = readVariable(bytes, state, end);
      const dataStart = state.offset;
      state.offset += length;
      if (state.offset > end) throw new Error("Invalid MIDI meta event length");
      if (type === 0x03) name = new TextDecoder().decode(bytes.slice(dataStart, dataStart + length)).trim();
      if (type === 0x51 && length === 3) {
        const microseconds = (bytes[dataStart] << 16) | (bytes[dataStart + 1] << 8) | bytes[dataStart + 2];
        if (microseconds > 0) tempos.push({ tick, bpm: 60_000_000 / microseconds });
      }
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      runningStatus = 0;
      const length = readVariable(bytes, state, end);
      state.offset += length;
      continue;
    }
    const command = status & 0xf0;
    const channel = status & 0x0f;
    const data1 = bytes[state.offset++];
    const data2 = command === 0xc0 || command === 0xd0 ? 0 : bytes[state.offset++];
    if (state.offset > end) throw new Error("Unexpected end of MIDI event");
    if (channel === 9) continue;
    const key = `${channel}:${data1}`;
    if (command === 0x90 && data2 > 0) {
      const active = openNotes.get(key) || [];
      active.push({ start: tick, midi: data1, channel });
      openNotes.set(key, active);
    } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
      const active = openNotes.get(key);
      const opened = active?.shift();
      if (opened && tick > opened.start) notes.push({ ...opened, end: tick, trackIndex });
      if (active && !active.length) openNotes.delete(key);
    }
  }
  return { trackIndex, name, notes, tempos };
}

function midiTrackScore(track) {
  if (!track.notes.length) return -Infinity;
  const ordered = [...track.notes].sort((a, b) => a.start - b.start || b.midi - a.midi);
  let overlaps = 0;
  let previousEnd = -1;
  for (const note of ordered) {
    if (note.start < previousEnd) overlaps += 1;
    previousEnd = Math.max(previousEnd, note.end);
  }
  const monophonicRatio = 1 - overlaps / ordered.length;
  const unique = new Set(ordered.map((note) => note.midi)).size;
  const nameBonus = MELODY_NAME.test(track.name) ? 260 : 0;
  const namePenalty = ACCOMPANIMENT_NAME.test(track.name) ? 220 : 0;
  return nameBonus - namePenalty + Math.min(ordered.length, 300) + unique * 4 + monophonicRatio * 180;
}

function collapseMidiNotes(notes) {
  const grouped = new Map();
  for (const note of notes) {
    const current = grouped.get(note.start);
    if (!current || note.midi > current.midi) grouped.set(note.start, note);
  }
  return [...grouped.values()].sort((a, b) => a.start - b.start || b.midi - a.midi);
}

function notesToTimedPhrases(notes, ticksPerQuarter) {
  const phrases = [];
  const durations = [];
  const gaps = [];
  let phrase = [];
  let phraseDurations = [];
  let phraseGaps = [];
  let previousEnd = notes[0]?.start ?? 0;
  let phraseStart = notes[0]?.start ?? 0;
  const flush = () => {
    if (!phrase.length) return;
    phrases.push(phrase); durations.push(phraseDurations); gaps.push(phraseGaps);
    phrase = []; phraseDurations = []; phraseGaps = [];
  };
  for (const note of notes) {
    const gap = Math.max(0, (note.start - previousEnd) / ticksPerQuarter);
    const beatsFromPhraseStart = (note.start - phraseStart) / ticksPerQuarter;
    if (phrase.length && (phrase.length >= 12 || gap >= 2 || beatsFromPhraseStart >= 16)) {
      flush();
      phraseStart = note.start;
    }
    phrase.push(midiNoteName(note.midi));
    phraseDurations.push(Math.max(0.125, (note.end - note.start) / ticksPerQuarter));
    phraseGaps.push(phrase.length === 1 ? Math.max(0, gap) : gap);
    previousEnd = Math.max(previousEnd, note.end);
  }
  flush();
  return { phrases, durations, gaps };
}

export function midiToTimedPhrases(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 14 || fourCc(bytes, 0) !== "MThd") throw new Error("This file is not a valid MIDI file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = readU32(view, 4);
  const trackCount = readU16(view, 10);
  const division = readU16(view, 12);
  if (headerLength < 6 || trackCount < 1 || (division & 0x8000)) throw new Error("This MIDI timing format is not supported");
  let offset = 8 + headerLength;
  const tracks = [];
  for (let index = 0; index < trackCount && offset + 8 <= bytes.length; index += 1) {
    const type = fourCc(bytes, offset);
    const length = readU32(view, offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (type !== "MTrk" || end > bytes.length) throw new Error("Invalid MIDI track chunk");
    tracks.push(parseMidiTrack(bytes, view, start, end, index));
    offset = end;
  }
  const selected = tracks.filter((track) => track.notes.length).sort((a, b) => midiTrackScore(b) - midiTrackScore(a))[0];
  if (!selected) throw new Error("No melodic notes were found in this MIDI file");
  const timed = notesToTimedPhrases(collapseMidiNotes(selected.notes), division);
  const tempoEvent = tracks.flatMap((track) => track.tempos).sort((a, b) => a.tick - b.tick)[0];
  const tempo = tempoEvent ? Math.round(tempoEvent.bpm) : null;
  return { ...timed, tempo: tempo && tempo >= 30 && tempo <= 240 ? tempo : null, trackName: selected.name };
}

export async function importScoreFile(file) {
  if (!file || file.size > 10 * 1024 * 1024) throw new Error("Score files must be 10 MB or smaller");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "mid" || extension === "midi" || /midi/i.test(file.type)) {
    return { ...midiToTimedPhrases(await file.arrayBuffer()), format: "MIDI" };
  }
  if (extension === "musicxml" || extension === "xml" || /xml/i.test(file.type)) {
    return { ...musicXmlToTimedPhrases(await file.text()), format: "MusicXML" };
  }
  throw new Error("Choose a .mid, .midi, .musicxml or .xml score file");
}

export function timedPhrasesToString(parsed) {
  return parsed.phrases.map((phrase) => phrase.join(" ")).filter(Boolean).join(" | ");
}
