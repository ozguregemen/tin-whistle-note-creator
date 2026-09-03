export function replacePhraseNote(phrases, phraseIndex, noteIndex, replacement) {
  return phrases.map((phrase, currentPhrase) => phrase.map((note, currentNote) =>
    currentPhrase === phraseIndex && currentNote === noteIndex ? replacement : note,
  ));
}

export function serializeNotePhrases(phrases) {
  return phrases.map((phrase) => phrase.map((note) => `${note.pitch}${note.octave}`).join(" ")).join(" | ");
}
