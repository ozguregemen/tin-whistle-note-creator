export const DEFAULT_CLIP_SECONDS = 15;

export function formatClipTime(seconds) {
  const tenths = Math.round(seconds * 10);
  const minutes = Math.floor(tenths / 600);
  const remainder = Math.floor(tenths / 10) % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}.${tenths % 10}`;
}

/** Encode the selected sample interval as mono PCM WAV. */
export function encodeAudioClip(buffer, { start, end }, { maxBytes } = {}) {
  const { sampleRate, length, numberOfChannels } = buffer;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw new RangeError("Choose a non-empty audio section");
  }
  const first = Math.min(length, Math.round(start * sampleRate));
  // The player and the decoder can report slightly different MP3 end times.
  const last = Math.min(length, Math.round(end * sampleRate));
  if (last <= first) throw new RangeError("Choose a non-empty audio section");

  const bytes = (last - first) * 2;
  if (maxBytes && bytes + 44 > maxBytes) throw new RangeError("Audio file must be 30 MB or smaller");
  const output = new ArrayBuffer(44 + bytes);
  const view = new DataView(output);
  const write = (offset, value) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, bytes, true);
  const channels = Array.from({ length: numberOfChannels }, (_, index) => buffer.getChannelData(index));
  for (let source = first, target = 44; source < last; source++, target += 2) {
    let mixed = 0;
    for (const channel of channels) mixed += channel[source];
    const sample = Math.max(-1, Math.min(1, mixed / numberOfChannels));
    view.setInt16(target, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return new Blob([output], { type: "audio/wav" });
}

/** @param {Blob} file @param {{start: number, end: number}} range
 * @param {{signal?: AbortSignal, maxBytes?: number, maxSeconds?: number}} [options] */
export async function extractAudioClip(file, range, { signal, maxBytes, maxSeconds } = {}) {
  signal?.throwIfAborted();
  if (maxSeconds && range.end - range.start > maxSeconds) {
    throw new RangeError("Audio must be 10 minutes or shorter");
  }
  const AudioContextConstructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContextConstructor) throw new Error("Web Audio is not supported by this browser");
  const context = new AudioContextConstructor({ sampleRate: 22050 });
  try {
    const data = await file.arrayBuffer();
    signal?.throwIfAborted();
    const decoded = await context.decodeAudioData(data);
    signal?.throwIfAborted();
    const wav = encodeAudioClip(decoded, range, { maxBytes });
    return new File([wav], "section.wav", { type: wav.type });
  } finally {
    await context.close();
  }
}
