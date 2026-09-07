import test from 'node:test';
import assert from 'node:assert/strict';
import { readPcmWav, renderMelodyWav } from '../scripts/melody-wav.mjs';
function wav(bits = 16, code = 1) {
  const b = Buffer.alloc(44 + 2 * bits / 8);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(code, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(22050, 24); b.writeUInt16LE(2 * bits / 8, 32); b.writeUInt16LE(bits, 34);
  b.write('data', 36); b.writeUInt32LE(b.length - 44, 40);
  return b;
}

test('evaluation render preserves concert pitch, leading silence and duration without whistle transposition', () => {
  const result = readPcmWav(renderMelodyWav([{ midi: 69, startSeconds: 0.2, durationSeconds: 0.5 }]));
  const pcm = result.channels[0];
  assert.equal(pcm.slice(0, 4410).every(x => x === 0), true);
  let crossings = 0;
  for (let i = 6616; i < 11025; i++) if (pcm[i - 1] <= 0 && pcm[i] > 0) crossings++;
  assert.ok(Math.abs(crossings / 0.2 - 440) <= 5);
  assert.throws(() => renderMelodyWav([{ midi: NaN, startSeconds: 0, durationSeconds: 1 }]), /Invalid/);
});
test('offline WAV reader decodes signed interleaved stereo PCM16', () => {
  const b = wav(); b.writeInt16LE(16384, 44); b.writeInt16LE(-16384, 46);
  const result = readPcmWav(b);
  assert.equal(result.sampleRate, 22050); assert.equal(result.channels[0][0], 0.5); assert.equal(result.channels[1][0], -0.5);
});
test('offline WAV reader supports float32 and PCM24', () => {
  const f = wav(32, 3); f.writeFloatLE(0.25, 44);
  assert.equal(readPcmWav(f).channels[0][0], 0.25);
  const p = wav(24); p.writeIntLE(-4194304, 44, 3);
  assert.equal(readPcmWav(p).channels[0][0], -0.5);
});
test('offline WAV reader rejects truncated, unsupported and nonfinite input', () => {
  assert.throws(() => readPcmWav(Buffer.alloc(5)), /RIFF/);
  assert.throws(() => readPcmWav(wav().subarray(0, 45)), /Truncated/);
  assert.throws(() => readPcmWav(wav(32, 1)), /PCM16/);
  const b = wav(32, 3); b.writeFloatLE(NaN, 44);
  assert.throws(() => readPcmWav(b), /Nonfinite/);
});
