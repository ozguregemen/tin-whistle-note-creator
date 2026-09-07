const PITCHES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function audibleMidiToWrittenWhistleToken(audibleMidi) {
  const midi = Math.round(Number(audibleMidi)) - 12;
  return `${PITCHES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
export function melodyToWhistlePractice(melody, options = {}) {
  const estimated = melody.estimatedTempo;
  const estimatedBpm = estimated?.kind === 'pulse-estimate' && Number.isFinite(estimated.bpm)
    && estimated.bpm >= 40 && estimated.bpm <= 220 ? estimated.bpm : null;
  const requestedBpm = Number(options.bpm);
  const manual = Number.isFinite(requestedBpm) && requestedBpm > 0;
  const bpm = Math.max(40, Math.min(220, manual ? requestedBpm : estimatedBpm || 90));
  const secondsToBeats = bpm / 60;
  let previousEnd = options.trimLeadingSilence !== false ? melody.notes[0]?.startSeconds || 0 : 0;
  const phrases = melody.phrases.map((phrase) => phrase.noteIndices.map((i) => {
    const note = melody.notes[i];
    const gap = Math.max(0, note.startSeconds - previousEnd) * secondsToBeats;
    previousEnd = note.startSeconds + note.durationSeconds;
    return { token: audibleMidiToWrittenWhistleToken(note.midi), duration: note.durationSeconds * secondsToBeats, gap };
  }));
  return { notes: phrases.map((phrase) => phrase.map((n) => n.token).join(' ')).join(' | '), noteCount: melody.notes.length,
    rhythm: { bpm, source: /** @type {'transcribed'} */ ('transcribed'), tempoSource: /** @type {'audio-estimate' | 'default'} */ (!manual && estimatedBpm ? 'audio-estimate' : 'default'),
      durations: phrases.map((phrase) => phrase.map((n) => n.duration)), gaps: phrases.map((phrase) => phrase.map((n) => n.gap)),
    }, melody };
}
