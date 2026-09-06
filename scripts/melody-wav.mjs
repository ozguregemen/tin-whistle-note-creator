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
