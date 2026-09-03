import { estimateDWhistleRegisters } from "../app/fingerings.mjs";
import { applyCuratedTempo } from "../app/curated-tempos.mjs";

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

export function stripLeadingArtist(title, artist) {
  const cleanTitle = plainTitle(title);
  const cleanArtist = plainTitle(artist);
  if (!cleanTitle || !cleanArtist) return cleanTitle;
  const titleWords = cleanTitle.split(/\s+/);
  const artistWords = cleanArtist.split(/\s+/);
  if (titleWords.length <= artistWords.length) return cleanTitle;
  const leadingWords = titleWords.slice(0, artistWords.length).join(" ");
  if (leadingWords.localeCompare(cleanArtist, "tr", { sensitivity: "base" }) !== 0) return cleanTitle;
  return titleWords.slice(artistWords.length).join(" ").replace(/^[–—-]+\s*/u, "").trim() || cleanTitle;
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

function textLines(html) {
  return decodeEntities(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean);

}

function isRestToken(raw) {
  const normalized = raw.toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşü]/gi, "");
  return normalized === "es" || normalized === "sus";
}

function textBeatUnit(html) {
  const plain = decodeEntities(html).replace(/<[^>]+>/g, " ").toLocaleLowerCase("tr-TR");
  if (/(?:yarım|half|0[,.]?5)\s*vuruş/.test(plain)) return 0.5;
  if (/(?:bir|one|1)\s*vuruş/.test(plain)) return 1;
  // Plain do-re-mi pages use one note/underscore as a half-beat unit when no
  // explanatory line is present. Pages without markers remain equal-beat data.
  return 0.5;
}

function textTokenDuration(raw, beatUnit) {
  const markerCount = (raw.match(/_/g) || []).length;
  return (1 + markerCount) * beatUnit;
}

export function extractTextTimedPhrases(html) {
  const lines = textLines(html);
  const beatUnit = textBeatUnit(html);
  const phrases = [];
  const durations = [];
  const gaps = [];
  let hasRhythm = false;

  for (const line of lines) {
    const tokens = line.split(/\s+/).filter(Boolean);
    const noteLikeTokens = tokens.filter((token) => pitchFromToken(token) || isRestToken(token));
    if (noteLikeTokens.length < 3 || noteLikeTokens.length / tokens.length < 0.6) continue;

    const notes = [];
    const noteDurations = [];
    const noteGaps = [];
    let pendingGap = 0;
    for (const token of noteLikeTokens) {
      const duration = textTokenDuration(token, beatUnit);
      if (isRestToken(token)) {
        pendingGap += duration;
        hasRhythm = true;
        continue;
      }
      const pitch = pitchFromToken(token);
      if (!pitch) continue;
      if (token.includes("_")) hasRhythm = true;
      notes.push(pitch);
      noteDurations.push(duration);
      noteGaps.push(pendingGap);
      pendingGap = 0;
    }
    if (notes.length > 0) {
      phrases.push(notes);
      durations.push(noteDurations);
      gaps.push(noteGaps);
    }
  }

  return {
    phrases,
    durations: hasRhythm ? durations : [],
    gaps: hasRhythm ? gaps : [],
    hasRhythm,
    beatUnit,
  };
}

export function extractTextPhrases(html) {
  return extractTextTimedPhrases(html).phrases;
}

export function addEstimatedOctaves(phrases) {
  return estimateDWhistleRegisters(
    phrases.map((phrase) => phrase.map((pitch) => ({ pitch }))),
  ).map((phrase) => phrase.map((note) => `${note.pitch}${note.octave}`));
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
  const tempo = [soundTempo, metronomeTempo].find((value) => Number.isFinite(value) && value >= 30 && value <= 240) ?? null;
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
  if (index === -1) songs.push(applyCuratedTempo(song));
  else songs[index] = applyCuratedTempo(song);
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), songs: songs.map(applyCuratedTempo) };
}
