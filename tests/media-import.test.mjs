import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { importAudioUrl, transcribeAudioInput, ERROR_COPY, audioInputError, mediaErrorMessage } from '../app/media-import.mjs';
import { MAX_AUDIO_BYTES, MAX_AUDIO_DURATION_SECONDS, MediaError } from '../shared/audio-media.mjs';
import { transcribeAudioFile } from '../app/audio-transcription.mjs';

const bytes = Uint8Array.from([255, 251, 144, 0, ...new Array(413).fill(0)]);
const apiUrl = 'https://worker.example.com';
const url = 'https://upload.wikimedia.org/song.mp3';
const options = { apiUrl, fetchFn: async () => new Response(bytes, { headers: { 'Content-Type': 'audio/mpeg' } }) };

test('client imports exact audio bytes as a Blob with a safe path-only display name', async () => {
  const result = await importAudioUrl(`${url}?signature=SECRET#token`, { ...options, fetchFn: async (endpoint, init) => {
    assert.equal(endpoint, `${apiUrl}/api/media/resolve`);
    assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
    return options.fetchFn();
  } });
  assert.ok(result.blob instanceof Blob); assert.equal(result.blob.type, 'audio/mpeg');
  assert.equal(result.name, 'song.mp3'); assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), bytes);
});

test('URL and uploaded file enter the identical transcription boundary and stage flow', async () => {
  const file = new File([bytes], 'song.mp3', { type: 'audio/mpeg' });
  for (const source of [file, url]) {
    const stages = []; const progresses = []; let received;
    const expected = { noteCount: 1, notes: 'A4', melody: { notes: [{ midi: 81 }] } };
    const result = await transcribeAudioInput(source, {
      apiUrl, resolve: () => ({ blob: file, name: file.name }),
      transcribe: async (blob, progress) => { received = blob; progress(0.5); return expected; },
      onStage: (phase) => stages.push(phase), onProgress: (p) => progresses.push(p),
    });
    assert.equal(received, file); assert.equal(result.result, expected);
    assert.deepEqual(stages, [...(source === url ? ['audioFetching'] : []), 'audioPreparing', 'audioTranscribing']);
    assert.deepEqual(progresses, [0.5]); assert.equal(result.name, file.name);
  }
});

test('default shared pipeline really calls existing decode -> provider -> engine -> whistle adapter', async (t) => {
  const previous = globalThis.AudioContext;
  let decoded = 0;
  class FakeAudioContext {
    async decodeAudioData(buffer) {
      assert.equal(buffer.byteLength, bytes.length); decoded++;
      return { duration: 1, sampleRate: 22050, numberOfChannels: 1, getChannelData: () => new Float32Array(22050) };
    }
    async close() {}
  }
  globalThis.AudioContext = FakeAudioContext;
  t.after(() => { globalThis.AudioContext = previous; });
  const provider = async () => ({ events: [{ midi: 81, startSeconds: 0, durationSeconds: 1, salience: 0.9 }], provider: 'test', diagnostics: {} });
  const transcribe = (blob, progress, settings) => transcribeAudioFile(blob, progress, { ...settings, provider, modelUrl: 'unused-in-test' });
  for (const source of [new File([bytes], 'local.mp3'), url]) {
    const outcome = await transcribeAudioInput(source, { transcribe, resolve: (input) => importAudioUrl(input, options) });
    assert.equal(outcome.result.notes, 'A4');
    assert.equal(outcome.result.melody.notes[0].midi, 81);
  }
  assert.equal(decoded, 2);
});

test('real existing decoder enforces identical 30 MiB / 600 s limits for both inputs', async (t) => {
  assert.equal(MAX_AUDIO_BYTES, 30 * 1024 * 1024); assert.equal(MAX_AUDIO_DURATION_SECONDS, 600);
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = class { async decodeAudioData() { return { duration: 601 }; } async close() {} };
  t.after(() => { globalThis.AudioContext = previous; });
  for (const source of [new Blob([bytes]), url]) {
    await assert.rejects(() => transcribeAudioInput(source, { resolve: (input) => importAudioUrl(input, options) }), /10 minutes/);
  }
  await assert.rejects(() => transcribeAudioInput(new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)])), { code: 'file_too_large' });
});

test('restricted providers are explained locally without contacting the API', async () => {
  for (const link of ['https://youtu.be/x', 'https://music.youtube.com/watch?v=x', 'https://open.spotify.com/track/x', 'spotify:track:x']) {
    await assert.rejects(() => importAudioUrl(link, { ...options, fetchFn: () => assert.fail() }), { code: 'provider_restricted' });
  }
  await assert.rejects(() => importAudioUrl('bogus', options), { code: 'invalid_url' });
  await assert.rejects(() => importAudioUrl(url), { code: 'unavailable' });
});

test('remote failures never enter transcription or expose arbitrary server messages', async () => {
  const resolve = (input) => importAudioUrl(input, { ...options, fetchFn: async () => new Response(JSON.stringify({ error: 'host_not_allowed', message: 'SECRET' }), { status: 403 }) });
  await assert.rejects(() => transcribeAudioInput(url, { resolve, transcribe: () => assert.fail() }), { code: 'host_not_allowed' });
  await assert.rejects(() => importAudioUrl(url, { ...options, fetchFn: async () => new Response('HTML error', { status: 500 }) }), { code: 'remote_error' });
  await assert.rejects(() => importAudioUrl(url, { ...options, fetchFn: async () => new Response('<html>', { headers: { 'Content-Type': 'audio/mpeg' } }) }), { code: 'not_audio' });
});

test('client rejects/cancels declared oversized body before reading and enforces its own byte limit', async () => {
  let cancelled = false;
  const response = () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(MAX_AUDIO_BYTES + 1) } });
  await assert.rejects(() => importAudioUrl(url, { ...options, fetchFn: async () => response() }), { code: 'file_too_large' });
  assert.equal(cancelled, true);
  await assert.rejects(() => importAudioUrl(url, { ...options, fetchFn: async () => new Response(new Uint8Array(MAX_AUDIO_BYTES + 1), { headers: { 'Content-Type': 'audio/mpeg' } }) }), { code: 'file_too_large' });
});

test('client total timeout and broken late stream discard partial audio', async () => {
  await assert.rejects(() => importAudioUrl(url, { ...options, timeoutMs: 20, fetchFn: () => new Promise(() => {}) }), { code: 'fetch_timeout' });
  let read = 0;
  const failed = new ReadableStream({ pull(c) { if (read++ === 0) c.enqueue(bytes); else c.error(new Error('network internals')); } });
  await assert.rejects(() => importAudioUrl(url, { ...options, fetchFn: async () => new Response(failed, { headers: { 'Content-Type': 'audio/mpeg' } }) }), { code: 'remote_error' });
});

test('cancellation after resolution or during model inference suppresses stale result/progress', async () => {
  const controller = new AbortController(); let progressCalls = 0;
  await assert.rejects(() => transcribeAudioInput(url, {
    signal: controller.signal,
    resolve: async () => { controller.abort(); return { blob: new Blob([bytes]), name: 'song' }; },
    transcribe: () => assert.fail(),
  }), { name: 'AbortError' });
  const next = new AbortController();
  await assert.rejects(() => transcribeAudioInput(new Blob([bytes]), {
    signal: next.signal, onProgress: () => progressCalls++,
    transcribe: async (_, progress) => { next.abort(); progress(1); return {}; },
  }), { name: 'AbortError' });
  assert.equal(progressCalls, 0);
});

test('English/Turkish error sets stay synchronized; decoder errors are useful', () => {
  assert.deepEqual(Object.keys(ERROR_COPY.en).sort(), Object.keys(ERROR_COPY.tr).sort());
  assert.match(mediaErrorMessage(new MediaError('provider_restricted', 'youtube'), 'tr'), /YouTube/);
  assert.match(mediaErrorMessage(new MediaError('provider_restricted', 'spotify'), 'en'), /Spotify/);
  assert.equal(audioInputError(new DOMException('details', 'EncodingError')).code, 'decode_failed');
  assert.equal(audioInputError(new RangeError('Audio must be 10 minutes or shorter')).code, 'audio_too_long');
  assert.equal(audioInputError(new Error('SECRET')).code, 'transcription_failed');
  assert.equal(typeof mediaErrorMessage(new MediaError('constructor')), 'string');
});

test('server error keys cannot select object prototype values as UI messages', async () => {
  await assert.rejects(() => importAudioUrl(url, { ...options, fetchFn: async () => new Response('{"error":"constructor"}', { status: 400 }) }), { code: 'remote_error' });
});

test('page routes both controls to the shared pipeline and tab switches cancel pending work', () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /await runAudioInput\(file\)/);
  assert.match(page, /await runAudioInput\(audioUrl\.trim\(\)\)/);
  assert.match(page, /await transcribeAudioInput\(source,/);
  assert.match(page, /audioImportRef\.current\?\.abort\(\)/);
  assert.match(page, /if \(!current\(\)\) return/);
  assert.match(page, /onSubmit=\{convertAudioUrl\}/);
  assert.match(page, /disabled=\{audioBusy \|\| !audioUrl\.trim\(\)\}/);
  assert.equal((page.match(/setMode\(/g) || []).length, 1);
});
