import assert from "node:assert/strict";
import test from "node:test";
import { createWhistlePlayer } from "../app/whistle-player.mjs";
import { WHISTLE_SOUNDFONT } from "../app/whistle-sampler.mjs";

function param() {
  return {
    value: 0,
    calls: [],
    setValueAtTime(value, time) { this.calls.push(["set", value, time]); this.value = value; },
    exponentialRampToValueAtTime(value, time) { this.calls.push(["ramp", value, time]); this.value = value; },
    cancelScheduledValues(time) { this.calls.push(["cancel", time]); },
  };
}

function fakeContext() {
  const created = [];
  const node = (kind, extra = {}) => {
    const listeners = {};
    const value = {
      kind,
      connected: [],
      started: null,
      stopped: null,
      connect(target) { this.connected.push(target); },
      disconnect() {},
      start(time) { this.started = time; },
      stop(time) { this.stopped = time; },
      addEventListener(name, callback) { listeners[name] = callback; },
      fire(name) { listeners[name]?.(); },
      ...extra,
    };
    created.push(value);
    return value;
  };
  return {
    created,
    currentTime: 2,
    destination: { kind: "destination" },
    decodeAudioData: async bytes => ({ decoded: bytes.byteLength }),
    createGain: () => node("gain", { gain: param() }),
    createBufferSource: () => node("buffer", { playbackRate: param(), buffer: null, loop: false }),
    createOscillator: () => node("oscillator", { frequency: param(), type: "" }),
  };
}

const soundfontPreset = {
  zones: [
    // Trigger 69 is the soundfont's A zone; it sounds an octave higher.
    { file: "AAAA", originalPitch: 6900, keyRangeLow: 60, keyRangeHigh: 75, loopStart: 100, loopEnd: 300, coarseTune: 0, fineTune: 0, sampleRate: 1000 },
  ],
};

test("the soundfont voice plays written E4 at audible E5 through the octave-transposing preset", async () => {
  const context = fakeContext();
  const globals = {};
  const loaded = [];
  const player = createWhistlePlayer({
    context,
    baseUrl: "https://localhost/",
    globals,
    decode: () => "\0\0\0",
    loadScript: async src => { loaded.push(src); globals[WHISTLE_SOUNDFONT.globalName] = soundfontPreset; },
    fetchImpl: async () => { throw new Error("WAV fallback should not be used"); },
  });

  assert.equal(await player.load(), "soundfont");
  assert.deepEqual(loaded, ["https://localhost/audio/tin-whistle/0780_GeneralUserGS_sf2_file.js"]);

  const voice = player.play({ pitch: "E", octave: 4 }, { duration: 0.5 });
  assert.equal(voice.voice, "soundfont");
  assert.equal(voice.audibleMidi, 76);
  const source = context.created.find(node => node.kind === "buffer");
  // Trigger 64 on a zone rooted at 69 is five semitones down.
  assert.ok(Math.abs(source.playbackRate.value - 2 ** (-5 / 12)) < 1e-9);
  assert.equal(source.loop, true);
  assert.equal(source.loopStart, 0.1);
  assert.equal(source.loopEnd, 0.3);
  assert.equal(source.started, 2);
  assert.ok(source.stopped > 2.5);
});

test("missing soundfont falls back to the bundled WAV samples, then to a sine tone", async () => {
  const context = fakeContext();
  const fetched = [];
  const player = createWhistlePlayer({
    context,
    baseUrl: "https://localhost/",
    globals: {},
    loadScript: async () => { throw new Error("offline"); },
    fetchImpl: async url => { fetched.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }; },
  });
  assert.equal(await player.load(), "samples");
  assert.equal(fetched.length, 2);
  assert.ok(fetched.every(url => url.startsWith("https://localhost/audio/tin-whistle/")));
  assert.equal(player.play({ pitch: "D", octave: 4 }).voice, "samples");

  const silent = createWhistlePlayer({
    context: fakeContext(),
    baseUrl: "https://localhost/",
    globals: {},
    loadScript: async () => { throw new Error("offline"); },
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  assert.equal(await silent.load(), "oscillator");
  assert.equal(silent.play({ pitch: "D", octave: 4 }).voice, "oscillator");
});

test("stopping a note fades it out instead of cutting it", async () => {
  const context = fakeContext();
  const player = createWhistlePlayer({
    context, baseUrl: "https://localhost/", globals: {},
    loadScript: async () => { throw new Error("offline"); },
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  await player.load();
  const note = player.play({ pitch: "A", octave: 4 }, { duration: 1 });
  context.currentTime = 2.3;
  note.stop();
  const gain = context.created.find(node => node.kind === "gain");
  assert.deepEqual(gain.gain.calls.at(-1), ["ramp", 0.0001, 2.3 + 0.035]);
});
