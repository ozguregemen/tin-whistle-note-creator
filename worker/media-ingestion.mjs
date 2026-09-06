import {
  AUDIO_SNIFF_BYTES, MAX_AUDIO_BYTES, MEDIA_FETCH_TIMEOUT_MS, MediaError,
  audioMime, cancelMediaBody, classifyMediaUrl, mediaDeadline, readLimitedBody, resolveMediaUrl, validateAudioPrefix,
} from '../shared/audio-media.mjs';

const MAX_REDIRECTS = 3;
const RESPONSE_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const STATUS = { invalid_url: 400, unsupported_provider: 422, provider_restricted: 422,
  host_not_allowed: 403, not_audio: 415, unsupported_audio_format: 415, file_too_large: 413,
  fetch_timeout: 504, too_many_redirects: 422, unavailable: 503, rate_limited: 429, forbidden: 403 };

export function validateMediaDestination(value, allowedHosts) {
  const { url, provider } = classifyMediaUrl(value);
  if (provider.id !== 'direct-audio') throw new MediaError('provider_restricted', provider.id);
  // The trust boundary is an exact operator-owned allowlist, not a DNS precheck.
  // Worker fetch resolves DNS independently; a precheck would not pin that lookup.
  // Reject ALL IP literals (also URL-canonicalized decimal/hex IPv4 and mapped IPv6).
  const host = url.hostname;
  if (url.protocol !== 'https:' || url.port || !host.includes('.') || host.includes(':')
    || /^[\d.]+$/.test(host) || host.endsWith('.')
    || /(^|\.)(localhost|local|internal|intranet|lan|home|test|invalid|onion|arpa)$/.test(host)
    || !/^[a-z0-9.-]+$/.test(host)) throw new MediaError('invalid_url');
  if (!allowedHosts.has(host)) throw new MediaError('host_not_allowed');
  url.hash = '';
  return url;
}

function errorResponse(error, cors) {
  const safe = error instanceof MediaError ? error : new MediaError('remote_error');
  return new Response(JSON.stringify({ supported: false, provider: safe.provider, error: safe.code, reason: safe.code }), {
    status: STATUS[safe.code] || 502,
    headers: { ...cors, ...RESPONSE_HEADERS, 'Content-Type': 'application/json',
      ...(safe.code === 'rate_limited' ? { 'Retry-After': '60' } : {}) },
  });
}

async function audioResponse(value, hosts, fetchFn, deadline, cors) {
  let destination = validateMediaDestination(value, hosts);
  let response;
  for (let redirects = 0; ; redirects++) {
    deadline.signal.throwIfAborted();
    response = await deadline.wait(fetchFn(destination.href, {
      method: 'GET', redirect: 'manual', signal: deadline.signal, credentials: 'omit', cache: 'no-store',
      headers: { Accept: 'audio/mpeg,audio/wav,audio/ogg,audio/flac,application/octet-stream;q=0.5',
        'Accept-Encoding': 'identity' },
    }));
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    await cancelMediaBody(response.body);
    if (redirects >= MAX_REDIRECTS) throw new MediaError('too_many_redirects');
    const location = response.headers.get('Location');
    if (!location) throw new MediaError('remote_error');
    let next;
    try { next = new URL(location, destination).href; } catch { throw new MediaError('invalid_url'); }
    destination = validateMediaDestination(next, hosts);
  }
  let reader;
  try {
    if (response.status !== 200 || !response.body) throw new MediaError('remote_error');
    const declaredMime = audioMime(response.headers.get('Content-Type'));
    const declaredSize = Number(response.headers.get('Content-Length'));
    if (declaredSize > MAX_AUDIO_BYTES) throw new MediaError('file_too_large');
    // Reject compressed HTTP envelopes; supported audio is already compressed (or WAV).
    if (!['', 'identity'].includes(response.headers.get('Content-Encoding') || '')) throw new MediaError('unsupported_audio_format');
    reader = response.body.getReader();
    let size = 0;
    let ended = false;
    const prefix = new Uint8Array(AUDIO_SNIFF_BYTES);
    let prefixLength = 0;
    const initial = [];
    while (prefixLength < prefix.length) {
      const { done, value: chunk } = await deadline.wait(reader.read());
      if (done) { ended = true; break; }
      size += chunk.byteLength;
      if (size > MAX_AUDIO_BYTES) throw new MediaError('file_too_large');
      const take = Math.min(chunk.byteLength, prefix.length - prefixLength);
      prefix.set(chunk.subarray(0, take), prefixLength);
      prefixLength += take;
      initial.push(chunk);
    }
    const mime = validateAudioPrefix(prefix.subarray(0, prefixLength), declaredMime);
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          deadline.signal.throwIfAborted();
          if (initial.length) { controller.enqueue(initial.shift()); return; }
          if (!ended) {
            const { done, value: chunk } = await deadline.wait(reader.read());
            ended = done;
            if (!done) {
              size += chunk.byteLength;
              if (size > MAX_AUDIO_BYTES) throw new MediaError('file_too_large');
              controller.enqueue(chunk);
              return;
            }
          }
          if (Number.isFinite(declaredSize) && declaredSize > 0 && size !== declaredSize) throw new MediaError('remote_error');
          deadline.close();
          reader.releaseLock();
          controller.close();
        } catch (error) {
          deadline.abort(error);
          deadline.close();
          controller.error(new MediaError(error instanceof MediaError ? error.code : 'remote_error'));
          await cancelMediaBody(reader);
        }
      },
      async cancel() {
        deadline.abort(); deadline.close();
        await cancelMediaBody(reader);
      },
    }, { highWaterMark: 0 });
    // Only our own headers leave the Worker. Audio is never persisted or cached.
    return new Response(stream, { headers: { ...cors, ...RESPONSE_HEADERS, 'Content-Type': mime } });
  } catch (error) {
    await cancelMediaBody(reader || response.body);
    throw error;
  }
}

/** Isolated route: no GitHub credentials, catalog, or instrument dependencies. */
export async function handleMediaResolve(request, env, fetchFn = fetch, cors = {}, options = {}) {
  const deadline = mediaDeadline(options.timeoutMs ?? MEDIA_FETCH_TIMEOUT_MS, request.signal);
  try {
    if (!request.headers.get('Origin') || !cors['Access-Control-Allow-Origin']) throw new MediaError('forbidden');
    if (!env.AUDIO_RATE_LIMITER || !env.AUDIO_ALLOWED_HOSTS) throw new MediaError('unavailable');
    // Anonymous app: per-edge client-address guard. CORS is not authentication,
    // and this limiter is not a worldwide budget; trusted destinations still apply.
    const limit = await deadline.wait(env.AUDIO_RATE_LIMITER.limit({ key: `media:${request.headers.get('CF-Connecting-IP') || 'anonymous'}` }));
    if (!limit.success) throw new MediaError('rate_limited');
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw new MediaError('invalid_url');
    if (Number(request.headers.get('Content-Length')) > 4096) throw new MediaError('invalid_url');
    const chunks = await readLimitedBody(request, 4096, deadline, 'invalid_url');
    let body;
    try { body = JSON.parse(await new Blob(chunks).text()); } catch { throw new MediaError('invalid_url'); }
    const hosts = new Set(env.AUDIO_ALLOWED_HOSTS.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
    return await resolveMediaUrl(body?.url, (url) => audioResponse(url.href, hosts, fetchFn, deadline, cors));
  } catch (error) {
    deadline.abort(error); deadline.close();
    return errorResponse(error, cors);
  }
}
