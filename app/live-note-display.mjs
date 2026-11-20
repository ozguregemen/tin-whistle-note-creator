import { fingeringFor } from "./fingerings.mjs";

const NOTE_NAMES = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };
/** @param {string} mark @returns {"closed" | "half" | "open"} */
function holeState(mark) {
  return mark === "1" ? "closed" : mark === "h" ? "half" : "open";
}

/** @param {{ pitch: string, octave: number }} note @param {"en" | "tr"} language */
export function describeLiveNote(note, language) {
  const { pitch, octave } = note;
  const symbol = pitch === "A#" ? "B♭" : pitch.replace("#", "♯");
  const accidental = symbol.endsWith("♭") ? (language === "tr" ? " bemol" : " flat")
    : symbol.endsWith("♯") ? (language === "tr" ? " diyez" : " sharp") : "";
  const name = `${NOTE_NAMES[symbol[0]] ?? symbol}${accidental}`;
  const writtenOctave = octave - 1;
  const pattern = fingeringFor(pitch, writtenOctave);
  /** @type {Array<"closed" | "half" | "open"> | null} */
  const holes = pattern?.split("").map(holeState) ?? null;
  const counts = { closed: 0, half: 0, open: 0 };
  holes?.forEach(state => { counts[state] += 1; });

  return {
    name,
    sounding: `${symbol}${octave}`,
    written: pattern ? `${symbol}${writtenOctave}` : null,
    holes,
    counts,
  };
}
