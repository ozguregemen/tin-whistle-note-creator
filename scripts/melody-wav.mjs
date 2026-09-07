/** Minimal offline PCM16/PCM24/float32 RIFF WAV reader. Browser decoding stays
 * with Web Audio; this is only the reproducible evaluation CLI input boundary. */
export function readPcmWav(buffer) {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Expected RIFF WAV');
  let format, data;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', offset, offset + 4), size = buffer.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > buffer.length) throw new Error('Truncated WAV chunk');
    if (id === 'fmt ' && size >= 16) format = { code: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2),
      sampleRate: buffer.readUInt32LE(start + 4), block: buffer.readUInt16LE(start + 12), bits: buffer.readUInt16LE(start + 14) };
    if (id === 'data') data = buffer.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!format || !data) throw new Error('WAV requires fmt and data chunks');
  const { code, channels: count, sampleRate, block, bits } = format;
  if (!(count >= 1 && count <= 8) || !sampleRate || block !== count * bits / 8
    || !((code === 1 && [16, 24].includes(bits)) || (code === 3 && bits === 32))) throw new Error('Use PCM16/24 or float32 WAV');
  if (data.length % block) throw new Error('Incomplete PCM frame');
  const channels = Array.from({ length: count }, () => new Float32Array(data.length / block));
  for (let f = 0; f < channels[0].length; f++) for (let c = 0; c < count; c++) {
    const at = f * block + c * bits / 8;
    const value = code === 3 ? data.readFloatLE(at) : bits === 16 ? data.readInt16LE(at) / 32768 : data.readIntLE(at, 3) / 8388608;
    if (!Number.isFinite(value)) throw new Error('Nonfinite PCM sample');
    channels[c][f] = value;
  }
  return { channels, sampleRate };
}

/** Evaluation-only neutral concert-pitch sine render. Not the whistle sampler. */
export function renderMelodyWav(notes, sampleRate = 22050) {
  let seconds = 0;
  for (const n of notes) {
    if (![n.midi, n.startSeconds, n.durationSeconds].every(Number.isFinite)
      || n.midi < 0 || n.midi > 127 || n.startSeconds < 0 || n.durationSeconds <= 0) throw new Error('Invalid melody');
    seconds = Math.max(seconds, n.startSeconds + n.durationSeconds);
  }
  if (seconds > 600 || sampleRate !== 22050) throw new RangeError('Render requires at most 10 minutes at 22050 Hz');
  const samples = Math.ceil((seconds + 0.1) * sampleRate), dataBytes = samples * 2;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(dataBytes, 40);
  for (const n of notes) {
    const start = Math.round(n.startSeconds * sampleRate), length = Math.round(n.durationSeconds * sampleRate);
    const hz = 440 * 2 ** ((n.midi - 69) / 12);
    for (let i = 0; i < length && start + i < samples; i++) {
      const envelope = Math.min(1, i / (sampleRate * 0.01), (length - i) / (sampleRate * 0.025));
      b.writeInt16LE(Math.round(6500 * envelope * Math.sin(2 * Math.PI * hz * i / sampleRate)), 44 + (start + i) * 2);
    }
  }
  return b;
}
