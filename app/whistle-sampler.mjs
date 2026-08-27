const PITCH_CLASS = Object.freeze({
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5,
  "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
});

export const WHISTLE_SAMPLE_ZONES = Object.freeze([
  Object.freeze({ file: "audio/tin-whistle/81_v0-127_rr1.wav", rootMidi: 81, lowMidi: 57, highMidi: 83 }),
  Object.freeze({ file: "audio/tin-whistle/85_v0-127_rr1.wav", rootMidi: 85, lowMidi: 84, highMidi: 109 }),
]);

export const WHISTLE_SOUNDFONT = Object.freeze({
  file: "audio/tin-whistle/0780_GeneralUserGS_sf2_file.js",
  globalName: "_tone_0780_GeneralUserGS_sf2_file",
});

export function midiForNote(pitch, octave) {
  const pitchClass = PITCH_CLASS[pitch];
  if (pitchClass === undefined || !Number.isFinite(octave)) return null;
  return (octave + 1) * 12 + pitchClass;
}

export function sampleZoneForMidi(midi) {
  if (!Number.isFinite(midi)) return null;
  return WHISTLE_SAMPLE_ZONES.find((zone) => midi >= zone.lowMidi && midi <= zone.highMidi)
    ?? WHISTLE_SAMPLE_ZONES.reduce((nearest, zone) => (
      Math.abs(zone.rootMidi - midi) < Math.abs(nearest.rootMidi - midi) ? zone : nearest
    ));
}

export function soundfontZoneForMidi(midi, zones = []) {
  if (!Number.isFinite(midi) || !Array.isArray(zones)) return null;
  return [...zones].reverse().find((zone) => (
    midi >= Number(zone.keyRangeLow) && midi <= Number(zone.keyRangeHigh)
  )) ?? null;
}

export function playbackRateForMidi(midi, rootOrZone) {
  if (!Number.isFinite(midi)) return 1;
  if (Number.isFinite(rootOrZone)) return 2 ** ((midi - rootOrZone) / 12);
  if (!rootOrZone || !Number.isFinite(Number(rootOrZone.originalPitch))) return 1;
  const baseDetune = Number(rootOrZone.originalPitch)
    - 100 * (Number(rootOrZone.coarseTune) || 0)
    - (Number(rootOrZone.fineTune) || 0);
  return 2 ** ((100 * midi - baseDetune) / 1200);
}

export function soundfontLoopForZone(zone) {
  const sampleRate = Number(zone?.sampleRate);
  const loopStart = Number(zone?.loopStart);
  const loopEnd = Number(zone?.loopEnd);
  if (!(sampleRate > 0) || !(loopStart >= 0) || !(loopEnd > loopStart)) return null;
  return { start: loopStart / sampleRate, end: loopEnd / sampleRate };
}

export function base64AudioBuffer(encoded, decode = globalThis.atob) {
  if (typeof encoded !== "string" || typeof decode !== "function") return null;
  const decoded = decode(encoded);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes.buffer;
}
