import { fingeringFor, isUpperWhistleRegister } from "./fingerings.mjs";

/** @typedef {{token: string, pitch: string, octave: number, display: string}} NotatedNote */
const SOLFEGE = { DO: "C", RE: "D", RÉ: "D", MI: "E", FA: "F", SOL: "G", LA: "A", SI: "B" };
const FLATS = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
/** @type {Record<string, string>} */
export const NOTE_NAMES = {
  C: "Do", "C#": "Do♯", D: "Re", "D#": "Re♯", E: "Mi", F: "Fa",
  "F#": "Fa♯", G: "Sol", "G#": "Sol♯", A: "La", "A#": "La♯", B: "Si",
};

/** @param {string} raw @returns {NotatedNote | null} */
export function normalizeNote(raw) {
  const cleaned = raw.trim().replaceAll("♯", "#").replaceAll("♭", "b");
  const match = cleaned.match(/^([A-Ga-g]|do|re|ré|mi|fa|sol|la|si)([#b]?)(-[12]|[0-8]|['′+])?$/i);
  if (!match) return null;
  let pitch = SOLFEGE[match[1].toUpperCase()] ?? match[1].toUpperCase();
  if (match[2] === "#") pitch += "#";
  if (match[2] === "b") pitch = FLATS[`${pitch}b`] ?? pitch;
  const marker = match[3];
  const upper = marker === "'" || marker === "′" || marker === "+";
  const isC = pitch === "C" || pitch === "C#";
  const octave = /^-?\d$/.test(marker ?? "") ? Number(marker) : (isC ? 5 : 4) + Number(upper);
  return { token: raw, pitch, octave, display: NOTE_NAMES[pitch] ?? pitch };
}

const PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const WHISTLE_NOTES = [4, 5, 6].flatMap(octave =>
  PITCHES
    .filter(pitch => fingeringFor(pitch, octave))
    .map(pitch => `${pitch}${octave}`),
);

export function registerForNote(note) {
  if (!isUpperWhistleRegister(note.pitch, note.octave)) return 1;
  return note.octave === 6 && !["C", "C#"].includes(note.pitch) ? 3 : 2;
}

/** @type {Map<string, NotatedNote>} */
const patternNotes = new Map(WHISTLE_NOTES.map(token => {
  const note = normalizeNote(token);
  return [`${registerForNote(note)}:${fingeringFor(note.pitch, note.octave)}`, note];
}));

export function noteForPattern(holes, register) {
  return patternNotes.get(`${register}:${holes}`) ?? null;
}
