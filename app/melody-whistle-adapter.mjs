const PITCHES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function audibleMidiToWrittenWhistleToken(audibleMidi) {
  const midi = Math.round(Number(audibleMidi)) - 12;
  return `${PITCHES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
export function melodyToWhistlePractice(melody, options = {}) {
  const bpm = Math.max(40, Math.min(220, Number(options.bpm) || 90));
  const secondsToBeats = bpm / 60;
  let previousEnd = options.trimLeadingSilence !== false ? melody.notes[0]?.startSeconds || 0 : 0;
  const phrases = melody.phrases.map((phrase) => phrase.noteIndices.map((i) => {
    const note = melody.notes[i];
    const gap = Math.max(0, note.startSeconds - previousEnd) * secondsToBeats;
    previousEnd = note.startSeconds + note.durationSeconds;
    return { token: audibleMidiToWrittenWhistleToken(note.midi), duration: note.durationSeconds * secondsToBeats, gap };
  }));
  return { notes: phrases.map((phrase) => phrase.map((n) => n.token).join(' ')).join(' | '), noteCount: melody.notes.length,
    rhythm: { bpm, source: /** @type {'transcribed'} */ ('transcribed'), tempoSource: /** @type {'default'} */ ('default'),
      durations: phrases.map((phrase) => phrase.map((n) => n.duration)), gaps: phrases.map((phrase) => phrase.map((n) => n.gap)),
    }, melody };
}
