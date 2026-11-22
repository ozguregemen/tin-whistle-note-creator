import { fingeringFor } from "../app/fingerings.mjs";
import { normalizeNote } from "../app/note-notation.mjs";
import { BPM_MAX, BPM_MIN } from "../app/practice.mjs";
import { containsBlockedWord } from "./community-moderation.mjs";

export const MAX_COMMUNITY_NOTES = 512;
export const MAX_COMMUNITY_NOTATION = 6000;
export const COMMUNITY_PAGE_SIZE = 40;
export const COMMUNITY_PATH = "/api/community";
const unsupportedSpelling = /^(?:(?:C|F|Do|Fa)b|(?:B|E|Si|Mi)#)/i;

/** @typedef {{ error: string, note?: string }} ValidationError */
/** @typedef {NonNullable<ReturnType<typeof normalizeNote>>} CommunityNote */
/** @returns {ValidationError | { phrases: CommunityNote[][], count: number, notes: string }} */
export function parseCommunityNotation(input) {
  if (typeof input !== "string" || input.length > MAX_COMMUNITY_NOTATION) return { error: "too_many_notes" };
  const phrases = input.trim().split(/[|\r\n]+/).map(phrase => phrase.trim()).filter(Boolean);
  const tokens = phrases.map(phrase => phrase
    .replace(/\b(Do|Re|Ré|Mi|Fa|Sol|La|Si)\s+(bemol|diyez)/gi, (_, name, accidental) =>
      name + (accidental.toLowerCase() === "bemol" ? "b" : "#"))
    .split(/[\s,;]+/));
  const count = tokens.reduce((sum, phrase) => sum + phrase.length, 0);
  if (!count) return { error: "notes_required" };
  if (count > MAX_COMMUNITY_NOTES) return { error: "too_many_notes" };

  const parsed = [];
  for (const phrase of tokens) {
    const notes = [];
    for (const token of phrase) {
      const cleaned = token.replaceAll("♭", "b").replaceAll("♯", "#");
      const note = normalizeNote(cleaned);
      if (!note || unsupportedSpelling.test(cleaned) || !fingeringFor(note.pitch, note.octave)) {
        return { error: "invalid_note", note: token.slice(0, 24) };
      }
      notes.push(note);
    }
    parsed.push(notes);
  }
  return { phrases: parsed, count, notes: parsed.map(phrase =>
    phrase.map(({ pitch, octave }) => `${pitch}${octave}`).join(" ")).join(" | ") };
}

/** @returns {ValidationError | { title: string, artist: string, bpm: number, notes: string }} */
export function validateCommunitySong(input) {
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const artist = typeof input?.artist === "string" ? input.artist.trim() : "";
  const bpm = Number(input?.bpm);
  if (title.length < 2 || title.length > 100 || /[\u0000-\u001f\u007f]/.test(title)) return { error: "invalid_title" };
  if (artist.length > 100 || /[\u0000-\u001f\u007f]/.test(artist)) return { error: "invalid_artist" };
  if (containsBlockedWord(title) || containsBlockedWord(artist)) return { error: "content_not_allowed" };
  if (!/^\d{2,3}$/.test(String(input?.bpm ?? "")) || bpm < BPM_MIN || bpm > BPM_MAX) return { error: "invalid_bpm" };
  const parsed = parseCommunityNotation(input?.notes ?? "");
  if ("error" in parsed) return parsed;
  return { title, artist, bpm, notes: parsed.notes };
}
