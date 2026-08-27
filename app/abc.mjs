const KEY_SIGNATURES = Object.freeze({
  d: ["F", "C"], dmajor: ["F", "C"],
  g: ["F"], gmajor: ["F"], eminor: ["F"], edorian: ["F", "C"], edor: ["F", "C"],
  a: ["F", "C", "G"], amajor: ["F", "C", "G"], adorian: ["F"], ador: ["F"],
  bminor: ["F", "C"], bm: ["F", "C"], dmixolydian: ["F"], dmix: ["F"],
});

function durationFromSuffix(suffix) {
  if (!suffix) return 1;
  if (suffix === "/") return 0.5;
  const fraction = suffix.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const divisor = suffix.match(/^\/(\d+)$/);
  if (divisor) return 1 / Number(divisor[1]);
  return Number(suffix) || 1;
}

function tempoFromAbc(abc) {
  const tempoLine = abc.match(/(?:^|\n)\s*Q:\s*([^\r\n]+)/i)?.[1]?.trim() || "";
  const explicitBeat = Number(tempoLine.match(/=\s*(\d{2,3})(?:\s|$)/)?.[1]);
  const bareTempo = Number(tempoLine.match(/^(\d{2,3})(?:\s|$)/)?.[1]);
  const tempo = [explicitBeat, bareTempo].find((value) => Number.isFinite(value) && value >= 30 && value <= 240);
  return tempo ?? null;
}

export function parseAbcScore(abc, key) {
  const tempo = tempoFromAbc(abc);
  const cleaned = abc
    .replace(/"[^"]*"/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^)]*\)/g, "");
  const sharps = new Set(KEY_SIGNATURES[key.toLowerCase().replace(/[^a-z]/g, "")] ?? []);
  const segments = cleaned.includes("!") ? cleaned.split("!") : [cleaned];
  const phrases = [];
  const durations = [];

  for (const segment of segments) {
    const notes = [];
    const noteDurations = [];
    for (const match of segment.matchAll(/([_=^]*)([A-Ga-g])([,']*)(\d+\/\d+|\/\d*|\d*)/g)) {
      const accidental = match[1];
      const letter = match[2];
      let pitch = letter.toUpperCase();
      if (accidental.startsWith("^")) pitch += "#";
      else if (accidental.startsWith("_")) {
        const flatToSharp = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
        pitch = flatToSharp[`${pitch}b`] ?? pitch;
      } else if (!accidental.startsWith("=") && sharps.has(pitch)) pitch += "#";

      let octave = letter === letter.toLowerCase() ? 5 : 4;
      for (const marker of match[3]) octave += marker === "'" ? 1 : -1;
      notes.push(`${pitch}${octave}`);
      noteDurations.push(durationFromSuffix(match[4]));
    }

    for (let index = 0; index < notes.length; index += 16) {
      const phrase = notes.slice(index, index + 16);
      if (!phrase.length) continue;
      phrases.push(phrase);
      durations.push(noteDurations.slice(index, index + 16));
    }
  }

  return {
    notes: phrases.map((phrase) => phrase.join(" ")).join(" | "),
    rhythm: {
      bpm: tempo ?? 90,
      source: "score",
      tempoSource: tempo ? "score" : "default",
      tempoConfidence: tempo ? 100 : 0,
      durations,
    },
  };
}
