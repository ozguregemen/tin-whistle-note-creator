import assert from "node:assert/strict";
import test from "node:test";
import { encodeAudioClip, extractAudioClip, formatClipTime } from "../app/audio-clip.mjs";

const channels = [
  Float32Array.from([0.8, -1, 0.5, 1, -0.8]),
  Float32Array.from([0.4, -1, -0.5, 1, -0.4]),
];
const decoded = { sampleRate: 10, length: 5, numberOfChannels: channels.length,
  getChannelData: index => channels[index] };

test("WAV contains precisely the selected samples and a valid mono PCM header", async () => {
  const blob = encodeAudioClip(decoded, { start: 0.1, end: 0.4 });
  const bytes = await blob.arrayBuffer();
  const header = new DataView(bytes);
  assert.equal(blob.type, "audio/wav");
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(new TextDecoder().decode(bytes.slice(8, 16)), "WAVEfmt ");
  assert.equal(header.getUint16(22, true), 1);
  assert.equal(header.getUint32(24, true), 10);
  assert.equal(header.getUint32(40, true), 6);
  assert.deepEqual([44, 46, 48].map(offset => header.getInt16(offset, true)), [-32768, 0, 32767]);
});

test("selections tolerate a rounded end but reject empty ranges and oversized WAV output", () => {
  assert.equal(encodeAudioClip(decoded, { start: 0.4, end: 0.52 }).size, 46);
  assert.throws(() => encodeAudioClip(decoded, { start: 0.51, end: 0.6 }), /non-empty/);
  assert.throws(() => encodeAudioClip(decoded, { start: 0.1, end: 0.4 }, { maxBytes: 49 }), /30 MB/);
  assert.equal(formatClipTime(119.96), "2:00.0");
});

test("an aborted selection closes its audio context and produces no clip", async (t) => {
  const controller = new AbortController();
  const oldContext = globalThis.AudioContext;
  let closed = false;
  globalThis.AudioContext = class {
    async decodeAudioData() { controller.abort(); return decoded; }
    async close() { closed = true; }
  };
  t.after(() => { globalThis.AudioContext = oldContext; });
  await assert.rejects(() => extractAudioClip(new Blob(["audio"]), { start: 0, end: 0.2 }, {
    signal: controller.signal,
  }), { name: "AbortError" });
  assert.equal(closed, true);
});
