import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceApi } from '../worker/source-api.mjs';
import { handleMediaResolve, validateMediaDestination } from '../worker/media-ingestion.mjs';
import { AUDIO_SNIFF_BYTES, MAX_AUDIO_BYTES, MediaError, resolveMediaUrl, validateAudioPrefix } from '../shared/audio-media.mjs';

const origin = 'https://ozguregemen.github.io';
const base = 'https://upload.wikimedia.org';
const hosts = new Set(['upload.wikimedia.org', 'audio.example.com']);
const env = { ALLOWED_ORIGINS: origin, AUDIO_ALLOWED_HOSTS: [...hosts].join(','),
  AUDIO_RATE_LIMITER: { limit: async () => ({ success: true }) } };
const cors = { 'Access-Control-Allow-Origin': origin };
const mp3 = () => Uint8Array.from([255, 251, 144, 0, ...new Array(413).fill(0)]);
const wav = () => {
  const bytes = new Uint8Array(48);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('RIFF')); view.setUint32(4, 40, true);
  bytes.set(new TextEncoder().encode('WAVEfmt '), 8); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 22050, true);
  view.setUint32(28, 44100, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  bytes.set(new TextEncoder().encode('data'), 36); view.setUint32(40, 4, true);
  return bytes;
};
const request = (url = `${base}/song.mp3`, extra = {}) => new Request('https://worker.example.com/api/media/resolve', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify({ url }),
});
const audio = (bytes = mp3(), type = 'audio/mpeg', headers = {}) => new Response(bytes, { headers: { 'Content-Type': type, ...headers } });
const responseCode = async (response, code) => {
  assert.ok(response.status >= 400);
  assert.equal((await response.json()).error, code);
};
function streamChunks(chunks, onCancel = () => {}) {
  return new ReadableStream({ pull(c) { const next = chunks.shift(); if (next) c.enqueue(next); else c.close(); }, cancel: onCancel }, { highWaterMark: 0 });
}

test('POST route streams valid direct MP3, no upstream headers/cookies reflected', async () => {
  const handle = createSourceApi(env, async (url, init) => {
    assert.equal(url, `${base}/song.mp3`);
    assert.equal(init.redirect, 'manual'); assert.equal(init.credentials, 'omit');
    assert.equal(new Headers(init.headers).get('Authorization'), null);
    assert.equal(new Headers(init.headers).get('Cookie'), null);
    assert.equal(new Headers(init.headers).get('Range'), null);
    return audio(mp3(), 'audio/mpeg', { 'Set-Cookie': 'secret', 'X-Internal': 'secret' });
  });
  const response = await handle(request(undefined, { Authorization: 'Bearer secret', Cookie: 'session=secret', Range: 'bytes=0-' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('x-internal'), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), mp3());
});

test('valid WAV and extensionless audio are accepted by MIME + signature', async () => {
  for (const path of ['/song.wav', '/download?id=abc']) {
    const response = await createSourceApi(env, async () => audio(wav(), 'audio/x-wav'))(request(base + path));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/wav');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), wav());
  }
});

test('generic binary MIME requires a recognized audio signature', async () => {
  const response = await createSourceApi(env, async () => audio(mp3(), 'application/octet-stream'))(request());
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  await response.arrayBuffer();
});

test('mp3 extension with HTML (even audio MIME) is rejected; mismatched MIME rejected', async () => {
  for (const [body, type] of [['<html>not audio</html>', 'text/html'], ['<html>not audio</html>', 'audio/mpeg'], [wav(), 'audio/mpeg']]) {
    await responseCode(await createSourceApi(env, async () => audio(body, type))(request()), 'not_audio');
  }
});

test('unsupported MIME, empty body and forged ID3 header do not become audio', async () => {
  for (const [body, type, code] of [[mp3(), 'audio/mp4', 'unsupported_audio_format'], [mp3(), 'image/png', 'not_audio'],
    [new Uint8Array(), 'audio/mpeg', 'not_audio'], ['ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000<html>', 'audio/mpeg', 'not_audio']]) {
    await responseCode(await createSourceApi(env, async () => audio(body, type))(request()), code);
  }
});

test('Ogg audio codec and FLAC STREAMINFO signatures are checked; Ogg video rejected', () => {
  const ogg = new Uint8Array(64); ogg.set(new TextEncoder().encode('OggS')); ogg[26] = 1; ogg[27] = 19;
  ogg.set(new TextEncoder().encode('OpusHead'), 28);
  assert.equal(validateAudioPrefix(ogg, 'audio/ogg'), 'audio/ogg');
  ogg.set([1, ...new TextEncoder().encode('vorbis')], 28);
  assert.equal(validateAudioPrefix(ogg, 'audio/ogg'), 'audio/ogg');
  ogg.set([128, ...new TextEncoder().encode('theora')], 28);
  assert.throws(() => validateAudioPrefix(ogg, 'audio/ogg'), { code: 'not_audio' });
  const flac = new Uint8Array(42); flac.set(new TextEncoder().encode('fLaC')); flac[7] = 34;
  assert.equal(validateAudioPrefix(flac, 'audio/flac'), 'audio/flac');
});

test('large ID3 metadata is explicitly unsupported instead of buffering arbitrarily', () => {
  const prefix = new Uint8Array(AUDIO_SNIFF_BYTES); prefix.set([73, 68, 51, 4, 0, 0, 0, 5, 0, 0]);
  assert.throws(() => validateAudioPrefix(prefix, 'audio/mpeg'), { code: 'unsupported_audio_format' });
});

test('bad URLs, private/loopback/link-local IPv4/IPv6 and internal hosts never get fetched', async () => {
  const values = ['', 'not a URL', 'https://localhost/a', 'https://localhost.localdomain/a', 'https://router/a',
    'https://server.local/a', 'https://server.internal/a', 'https://127.0.0.1/a', 'https://10.2.3.4/a',
    'https://172.16.2.1/a', 'https://192.168.1.1/a', 'https://169.254.169.254/a', 'https://0.0.0.0/a',
    'https://2130706433/a', 'https://0x7f000001/a', 'https://127.1/a', 'https://0177.0.0.1/a',
    'https://[::1]/a', 'https://[fc00::1]/a', 'https://[fe80::1]/a', 'https://[::ffff:127.0.0.1]/a',
    'https://user:pass@upload.wikimedia.org/a', 'http://upload.wikimedia.org/a', 'https://upload.wikimedia.org:444/a'];
  for (const url of values) {
    const response = await createSourceApi(env, async () => assert.fail(`must not fetch: ${url}`))(request(url));
    assert.ok(response.status >= 400, url);
  }
});

test('exact allowlist rejects unlisted hosts, lookalikes, wildcards and trailing dots', () => {
  for (const host of ['untrusted.example.com', 'upload.wikimedia.org.evil.com', 'evilupload.wikimedia.org', 'sub.upload.wikimedia.org', 'upload.wikimedia.org.']) {
    assert.throws(() => validateMediaDestination(`https://${host}/song.mp3`, hosts), MediaError);
  }
  assert.throws(() => validateMediaDestination('https://child.example.com/a', new Set(['*.example.com'])), { code: 'host_not_allowed' });
  assert.equal(validateMediaDestination(`${base}:443/song.mp3#fragment`, hosts).href, `${base}/song.mp3`);
});

test('non-HTTP schemes are unsupported and never fetched', async () => {
  for (const url of ['file:///etc/passwd', 'data:audio/wav;base64,AAAA', 'ftp://upload.wikimedia.org/a', 'javascript:alert(1)']) {
    await responseCode(await createSourceApi(env, async () => assert.fail())(request(url)), 'unsupported_provider');
  }
});

test('YouTube variants and Spotify are recognized restricted providers with zero network calls', async () => {
  for (const [url, provider] of [['https://youtube.com/watch?v=1', 'youtube'], ['https://youtu.be/1', 'youtube'],
    ['https://music.youtube.com/watch?v=1', 'youtube'], ['https://www.youtube.com/watch?v=1', 'youtube'],
    ['https://open.spotify.com/track/1', 'spotify'], ['spotify:track:1', 'spotify']]) {
    const response = await createSourceApi(env, async () => assert.fail())(request(url));
    assert.deepEqual(await response.json(), { supported: false, provider, error: 'provider_restricted', reason: 'provider_restricted' });
    assert.throws(() => resolveMediaUrl(url, () => assert.fail()), { code: 'provider_restricted', provider });
  }
});

test('relative and explicitly allowed cross-host redirects work', async () => {
  const seen = [];
  const response = await createSourceApi(env, async (url) => {
    seen.push(url);
    if (seen.length === 1) return new Response(null, { status: 302, headers: { Location: '/next' } });
    if (seen.length === 2) return new Response(null, { status: 307, headers: { Location: 'https://audio.example.com/final' } });
    return audio();
  })(request());
  assert.equal(response.status, 200); await response.arrayBuffer();
  assert.deepEqual(seen, [`${base}/song.mp3`, `${base}/next`, 'https://audio.example.com/final']);
});

test('each redirect target is validated before any second request', async () => {
  for (const target of ['https://127.0.0.1/a', 'https://[::1]/a', 'https://evil.com/a',
    'http://upload.wikimedia.org/a', 'https://user:pass@upload.wikimedia.org/a', 'https://youtu.be/1']) {
    let calls = 0; let cancelled = false;
    const response = await createSourceApi(env, async () => {
      assert.equal(++calls, 1);
      return new Response(streamChunks([new Uint8Array(1)], () => { cancelled = true; }), { status: 302, headers: { Location: target } });
    })(request());
    assert.ok(response.status >= 400); assert.equal(cancelled, true);
  }
});

test('redirect loops/excessive chains and malformed redirects terminate', async () => {
  let calls = 0;
  await responseCode(await createSourceApi(env, async () => {
    calls++;
    return new Response(null, { status: 302, headers: { Location: '/again' } });
  })(request()), 'too_many_redirects');
  assert.equal(calls, 4);
  await responseCode(await createSourceApi(env, async () => new Response(null, { status: 302 }))(request()), 'remote_error');
});

test('declared oversized responses are cancelled before reading audio', async () => {
  let cancelled = false;
  const response = await createSourceApi(env, async () => audio(streamChunks([mp3()], () => { cancelled = true; }), 'audio/mpeg', { 'Content-Length': String(MAX_AUDIO_BYTES + 1) }))(request());
  await responseCode(response, 'file_too_large'); assert.equal(cancelled, true);
});

test('missing/lying length cannot bypass streaming size limit; exactly 30 MiB succeeds', async () => {
  for (const extra of [0, 1]) {
    let cancelled = false;
    const chunk = new Uint8Array(64 * 1024); chunk.set(mp3());
    const chunks = Array.from({ length: MAX_AUDIO_BYTES / chunk.length }, () => chunk);
    if (extra) chunks.push(new Uint8Array(1));
    const response = await createSourceApi(env, async () => audio(streamChunks(chunks, () => { cancelled = true; })))(request());
    if (!extra) assert.equal((await response.arrayBuffer()).byteLength, MAX_AUDIO_BYTES);
    else { await assert.rejects(() => response.arrayBuffer(), { code: 'file_too_large' }); assert.equal(cancelled, true); }
  }
  const response = await createSourceApi(env, async () => audio(mp3(), 'audio/mpeg', { 'Content-Length': '999' }))(request());
  await assert.rejects(() => response.arrayBuffer(), { code: 'remote_error' });
});

test('oversized first chunk fails with structured error without forwarding it', async () => {
  let cancelled = false;
  await responseCode(await createSourceApi(env, async () => audio(streamChunks([new Uint8Array(MAX_AUDIO_BYTES + 1)], () => { cancelled = true; })))(request()), 'file_too_large');
  assert.equal(cancelled, true);
});

test('total deadline covers both stalled response headers and stalled sniff/body', async () => {
  await responseCode(await handleMediaResolve(request(), env, () => new Promise(() => {}), cors, { timeoutMs: 20 }), 'fetch_timeout');
  let cancelled = false;
  const stalled = () => audio(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; } }));
  await responseCode(await handleMediaResolve(request(), env, stalled, cors, { timeoutMs: 20 }), 'fetch_timeout');
  assert.equal(cancelled, true);
});

test('deadline also covers a body that stalls AFTER response headers; partial stream fails', async () => {
  let pulls = 0; let cancelled = false;
  const prefix = new Uint8Array(AUDIO_SNIFF_BYTES); prefix.set(mp3());
  const upstream = new ReadableStream({
    pull(c) { if (++pulls === 1) c.enqueue(prefix); else return new Promise(() => {}); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const response = await handleMediaResolve(request(), env, async () => audio(upstream), cors, { timeoutMs: 30 });
  assert.equal(response.status, 200);
  await assert.rejects(() => response.arrayBuffer(), { code: 'fetch_timeout' });
  assert.equal(cancelled, true);
});

test('downstream cancellation propagates upstream without downloading the rest', async () => {
  let cancelled = false;
  const prefix = new Uint8Array(AUDIO_SNIFF_BYTES); prefix.set(mp3());
  const response = await createSourceApi(env, async () => audio(streamChunks([prefix, new Uint8Array(9999)], () => { cancelled = true; })))(request());
  await response.body.cancel(); assert.equal(cancelled, true);
});

test('stalled cancellation hooks cannot bypass a deadline or prevent a structured error', async () => {
  for (const status of [200, 302]) {
    const response = await handleMediaResolve(request(), env, async () => new Response(new ReadableStream({
      cancel() { return new Promise(() => {}); },
    }), { status, headers: { 'Content-Type': 'text/html', Location: '/next' } }), cors, { timeoutMs: 10 });
    await responseCode(response, status === 200 ? 'not_audio' : 'fetch_timeout');
  }
});

test('missing configuration, rate limit, disallowed/missing origin fail closed before fetch', async () => {
  const noFetch = async () => assert.fail('must not call remote');
  await responseCode(await createSourceApi({}, noFetch)(request()), 'unavailable');
  await responseCode(await createSourceApi({ ...env, AUDIO_RATE_LIMITER: { limit: async () => ({ success: false }) } }, noFetch)(request()), 'rate_limited');
  const missingOrigin = request(); missingOrigin.headers.delete('Origin');
  await responseCode(await createSourceApi(env, noFetch)(missingOrigin), 'forbidden');
  assert.equal((await createSourceApi(env, noFetch)(request(undefined, { Origin: 'https://evil.com' }))).status, 403);
});

test('bounded request JSON, wrong media type, remote status and network details are sanitized', async () => {
  const noFetch = async () => assert.fail();
  await responseCode(await createSourceApi(env, noFetch)(request(undefined, { 'Content-Type': 'text/plain' })), 'invalid_url');
  const large = new Request('https://worker.example.com/api/media/resolve', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: ' '.repeat(4097) });
  await responseCode(await createSourceApi(env, noFetch)(large), 'invalid_url');
  await responseCode(await createSourceApi(env, async () => new Response('secret internal message', { status: 500 }))(request()), 'remote_error');
  const failed = await createSourceApi(env, async () => { throw new Error('10.0.0.1 SECRET_TOKEN'); })(request());
  const text = await failed.text(); assert.match(text, /remote_error/); assert.doesNotMatch(text, /SECRET|10\.0/);
});
