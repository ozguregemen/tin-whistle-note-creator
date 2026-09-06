// Acquisition contracts only. No instrument or transcription knowledge.
export { MAX_AUDIO_BYTES, MAX_AUDIO_DURATION_SECONDS } from './audio-limits.mjs';
export const MEDIA_FETCH_TIMEOUT_MS = 60_000;
export const AUDIO_SNIFF_BYTES = 64 * 1024;

export class MediaError extends Error {
  constructor(code, provider = 'direct-audio') {
    super(code);
    this.name = 'MediaError';
    this.code = code;
    this.provider = provider;
  }
}

const onDomain = (host, domain) => host === domain || host.endsWith(`.${domain}`);
const restricted = (id, canHandle) => ({
  id, canHandle,
  resolve() { throw new MediaError('provider_restricted', id); },
});

// Provider adapters only obtain audio. Future authorized providers belong here,
// not in the melody engine. Neither platform adapter makes a network request.
export const MEDIA_PROVIDERS = Object.freeze([
  restricted('youtube', (url) => onDomain(url.hostname, 'youtube.com') || onDomain(url.hostname, 'youtu.be')),
  restricted('spotify', (url) => url.protocol === 'spotify:' || onDomain(url.hostname, 'spotify.com')),
  {
    id: 'direct-audio',
    canHandle: (url) => url.protocol === 'https:' || url.protocol === 'http:',
    resolve: (url, acquire) => acquire(url),
  },
]);

export function classifyMediaUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048
    || [...value.trim()].some((char) => char.charCodeAt(0) <= 32 || char === '\\')) throw new MediaError('invalid_url');
  let url;
  try { url = new URL(value.trim()); } catch { throw new MediaError('invalid_url'); }
  if (url.username || url.password) throw new MediaError('invalid_url');
  const provider = MEDIA_PROVIDERS.find((item) => item.canHandle(url));
  if (!provider) throw new MediaError('unsupported_provider');
  return { url, provider };
}

export function resolveMediaUrl(value, acquire) {
  const { url, provider } = classifyMediaUrl(value);
  return provider.resolve(url, acquire);
}

const MIME_TYPES = Object.freeze({
  'audio/mpeg': 'audio/mpeg', 'audio/mp3': 'audio/mpeg',
  'audio/wav': 'audio/wav', 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav',
  'audio/ogg': 'audio/ogg', 'application/ogg': 'audio/ogg',
  'audio/flac': 'audio/flac', 'audio/x-flac': 'audio/flac',
});
export function audioMime(value) {
  const mime = String(value || '').split(';')[0].trim().toLowerCase();
  // Generic binary is allowed only when the bytes positively identify audio.
  if (mime === 'application/octet-stream') return mime;
  if (Object.hasOwn(MIME_TYPES, mime)) return MIME_TYPES[mime];
  throw new MediaError(mime.startsWith('audio/') ? 'unsupported_audio_format' : 'not_audio');
}

const asciiAt = (bytes, offset, text) => [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0));
function mp3FrameAt(bytes, offset) {
  const [a, b, c] = bytes.subarray(offset, offset + 3);
  return bytes.length >= offset + 4 && a === 255 && (b & 224) === 224
    && ((b >> 3) & 3) !== 1 && ((b >> 1) & 3) === 1 // MPEG audio, Layer III
    && (c >> 4) > 0 && (c >> 4) < 15 && ((c >> 2) & 3) !== 3;
}

export function validateAudioPrefix(bytes, declaredMime) {
  let detected = '';
  if (bytes.length >= 12 && asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WAVE')) detected = 'audio/wav';
  if (bytes.length >= 42 && asciiAt(bytes, 0, 'fLaC') && (bytes[4] & 127) === 0
    && bytes[5] === 0 && bytes[6] === 0 && bytes[7] === 34) detected = 'audio/flac';
  if (asciiAt(bytes, 0, 'OggS') && bytes[4] === 0 && bytes.length >= 28) {
    const packet = 27 + bytes[26];
    if (asciiAt(bytes, packet, 'OpusHead') || (bytes[packet] === 1 && asciiAt(bytes, packet + 1, 'vorbis'))) detected = 'audio/ogg';
  }
  let mp3Offset = 0;
  if (bytes.length >= 10 && asciiAt(bytes, 0, 'ID3')) {
    const size = bytes.subarray(6, 10);
    if (bytes[3] < 2 || bytes[3] > 4 || size.some((b) => b > 127)) throw new MediaError('not_audio');
    mp3Offset = 10 + size.reduce((n, b) => n * 128 + b, 0) + (bytes[3] === 4 && (bytes[5] & 16) ? 10 : 0);
    if (mp3Offset + 4 > AUDIO_SNIFF_BYTES) throw new MediaError('unsupported_audio_format');
  }
  if (mp3FrameAt(bytes, mp3Offset)) detected = 'audio/mpeg';
  const mime = audioMime(declaredMime);
  if (!detected || (mime !== 'application/octet-stream' && mime !== detected)) throw new MediaError('not_audio');
  return detected;
}

// Deadlines span headers AND body. wait() also bounds mocks/transports that don't
// promptly settle a pending read when the underlying request is aborted.
export function mediaDeadline(timeoutMs, parentSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort(parentSignal.reason);
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new MediaError('fetch_timeout')), timeoutMs);
  return {
    signal: controller.signal,
    abort: (reason) => controller.abort(reason),
    close() { clearTimeout(timer); parentSignal?.removeEventListener('abort', abort); },
    async wait(promise) {
      let listener;
      try {
        return await Promise.race([new Promise((_, reject) => {
          listener = () => reject(controller.signal.reason);
          if (controller.signal.aborted) listener();
          else controller.signal.addEventListener('abort', listener, { once: true });
        }), promise]);
      } finally { controller.signal.removeEventListener('abort', listener); }
    },
  };
}

// A broken upstream may never settle cancel(). Cleanup must not defeat the
// download deadline. Promise.race observes late rejections too (no floating work).
export async function cancelMediaBody(body) {
  if (!body) return;
  let timer;
  try {
    await Promise.race([body.cancel(), new Promise((resolve) => { timer = setTimeout(resolve, 100); })]);
  } catch { /* Cancellation is best-effort; never surface upstream internals. */ }
  finally { clearTimeout(timer); }
}

export async function readLimitedBody(response, maxBytes, deadline, sizeCode = 'file_too_large') {
  const reader = response.body?.getReader();
  if (!reader) throw new MediaError('not_audio');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await deadline.wait(reader.read());
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new MediaError(sizeCode);
      chunks.push(value);
    }
    return chunks;
  } catch (error) {
    await cancelMediaBody(reader);
    throw error;
  } finally { reader.releaseLock(); }
}
