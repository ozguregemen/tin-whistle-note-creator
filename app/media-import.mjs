import { MAX_AUDIO_BYTES, MEDIA_FETCH_TIMEOUT_MS, MediaError, audioMime,
  cancelMediaBody, mediaDeadline, readLimitedBody, resolveMediaUrl, validateAudioPrefix, AUDIO_SNIFF_BYTES } from '../shared/audio-media.mjs';
import { transcribeAudioFile } from './audio-transcription.mjs';

/**
 * HTTP acquisition only: the result is an instrument-independent Blob.
 * @param {string} value
 * @param {{apiUrl?: string, signal?: AbortSignal, fetchFn?: typeof fetch, timeoutMs?: number}} [options]
 */
export async function importAudioUrl(value, { apiUrl = '', signal, fetchFn = fetch, timeoutMs = MEDIA_FETCH_TIMEOUT_MS + 5000 } = {}) {
  return resolveMediaUrl(value, async (url) => {
    if (!apiUrl) throw new MediaError('unavailable');
    const deadline = mediaDeadline(timeoutMs, signal);
    let response;
    try {
      response = await deadline.wait(fetchFn(`${apiUrl.replace(/\/$/, '')}/api/media/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'omit', cache: 'no-store', redirect: 'error', signal: deadline.signal,
        body: JSON.stringify({ url: url.href }),
      }));
      if (!response.ok) {
        const parts = await readLimitedBody(response, 4096, deadline, 'remote_error');
        let payload;
        try { payload = JSON.parse(await new Blob(parts).text()); } catch { throw new MediaError('remote_error'); }
        throw new MediaError(Object.hasOwn(ERROR_COPY.en, payload?.error) ? payload.error : 'remote_error',
          ['youtube', 'spotify'].includes(payload?.provider) ? payload.provider : 'direct-audio');
      }
      const mime = audioMime(response.headers.get('Content-Type'));
      if (Number(response.headers.get('Content-Length')) > MAX_AUDIO_BYTES) {
        throw new MediaError('file_too_large');
      }
      const parts = await readLimitedBody(response, MAX_AUDIO_BYTES, deadline);
      const blob = new Blob(parts, { type: mime });
      const prefix = new Uint8Array(await blob.slice(0, AUDIO_SNIFF_BYTES).arrayBuffer());
      const detectedMime = validateAudioPrefix(prefix, mime);
      // Only the path may become a display title, never a signed query or fragment.
      let name = 'Imported audio';
      try { name = decodeURIComponent(url.pathname.split('/').pop() || '') || name; } catch { /* Generic title. */ }
      name = [...name].filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('').slice(0, 160);
      return { blob: blob.slice(0, blob.size, detectedMime), name, provider: 'direct-audio' };
    } catch (error) {
      // After response headers a failed stream cannot carry a JSON error code.
      // Never transcribe its partial contents or expose network internals.
      const reason = signal?.aborted ? signal.reason : deadline.signal.aborted ? deadline.signal.reason
        : error instanceof MediaError ? error : new MediaError('remote_error');
      deadline.abort(reason);
      await cancelMediaBody(response?.body);
      throw reason;
    } finally { deadline.close(); }
  });
}

/**
 * Both input methods converge HERE; the existing decoder/engine/adapter stays intact.
 * @param {Blob | string} source
 * @param {{apiUrl?: string, signal?: AbortSignal,
 * onStage?: (stage: 'audioFetching' | 'audioPreparing' | 'audioTranscribing') => void,
 * onProgress?: (progress: number) => void, resolve?: typeof importAudioUrl,
 * transcribe?: typeof transcribeAudioFile}} [options]
 */
export async function transcribeAudioInput(source, {
  apiUrl = '', signal, onStage = () => {}, onProgress = () => {},
  resolve = importAudioUrl, transcribe = transcribeAudioFile,
} = {}) {
  signal?.throwIfAborted();
  let blob = source;
  let name = source?.name || 'Audio';
  const origin = typeof source === 'string' ? 'url' : 'file';
  if (origin === 'url') {
    onStage('audioFetching');
    ({ blob, name } = await resolve(source, { apiUrl, signal }));
  }
  signal?.throwIfAborted();
  if (!(blob instanceof Blob)) throw new MediaError('not_audio');
  if (blob.size > MAX_AUDIO_BYTES) throw new MediaError('file_too_large');
  onStage('audioPreparing');
  const result = await transcribe(blob, (progress) => {
    if (signal?.aborted) return;
    onStage('audioTranscribing');
    onProgress(progress);
  }, { signal });
  signal?.throwIfAborted();
  return { result, name, origin };
}

export function audioInputError(error) {
  if (error instanceof MediaError) return error;
  if (error?.name === 'EncodingError' || error?.name === 'NotSupportedError') return new MediaError('decode_failed');
  // Existing decoder's public limits remain unchanged; only presentation maps them.
  if (error instanceof RangeError && error.message === 'Audio must be 10 minutes or shorter') return new MediaError('audio_too_long');
  if (error instanceof RangeError && error.message === 'Audio file must be 30 MB or smaller') return new MediaError('file_too_large');
  return new MediaError('transcription_failed');
}

export const ERROR_COPY = {
  en: {
    invalid_url: 'Use a valid public HTTPS audio link without a username or password.',
    unsupported_provider: 'This kind of link is not supported. Use a direct audio link or upload a file.',
    provider_restricted: 'This provider does not offer direct audio import here. Upload an audio file instead.',
    youtube: 'Direct YouTube audio import is not available. Upload an audio file instead.',
    spotify: 'Spotify links do not provide a downloadable full-track audio file. Upload an audio file instead.',
    host_not_allowed: 'This audio host is not enabled for link import. Upload the file instead; trusted hosts can be enabled by the app operator.',
    not_audio: 'The link did not return a recognized audio file. Web pages and playlists cannot be imported.',
    unsupported_audio_format: 'This audio format is not supported for link import. Try an MP3, WAV, OGG or FLAC file.',
    file_too_large: 'The audio must be 30 MB or smaller.',
    audio_too_long: 'The audio must be 10 minutes or shorter.',
    fetch_timeout: 'Fetching the audio timed out. Try a smaller file or upload it directly.',
    too_many_redirects: 'This link redirects too many times. Use the final direct audio link.',
    remote_error: 'The audio transfer failed or was interrupted (possibly a size limit). No partial file was transcribed. Try uploading the file.',
    decode_failed: 'This browser could not decode the audio. Try a valid MP3, WAV, OGG or FLAC file.',
    unavailable: 'Link import is not configured on the server yet. File upload still works.',
    forbidden: 'Link import is not available from this page. Use the official app or upload a file.',
    rate_limited: 'Too many audio imports. Please wait a minute and try again.',
    transcription_failed: 'Audio transcription could not finish. Try a shorter recording or a browser with Web Audio support.',
  },
  tr: {
    invalid_url: 'Kullanıcı adı veya parola içermeyen, herkese açık geçerli bir HTTPS ses bağlantısı kullan.',
    unsupported_provider: 'Bu bağlantı türü desteklenmiyor. Doğrudan ses bağlantısı kullan veya dosya yükle.',
    provider_restricted: 'Bu sağlayıcıdan doğrudan ses aktarma desteklenmiyor. Bunun yerine bir ses dosyası yükle.',
    youtube: 'YouTube’dan doğrudan ses aktarma desteklenmiyor. Bunun yerine bir ses dosyası yükleyebilirsin.',
    spotify: 'Spotify bağlantıları indirilebilir tam şarkı dosyası sağlamaz. Bunun yerine bir ses dosyası yükleyebilirsin.',
    host_not_allowed: 'Bu ses sunucusu bağlantıyla aktarma için etkin değil. Dosyayı yükleyebilirsin; güvenilir sunucuları uygulama yöneticisi ekleyebilir.',
    not_audio: 'Bağlantı tanınan bir ses dosyası döndürmedi. Web sayfaları ve çalma listeleri aktarılamaz.',
    unsupported_audio_format: 'Bu ses biçimi bağlantıyla aktarmada desteklenmiyor. MP3, WAV, OGG veya FLAC dosyası dene.',
    file_too_large: 'Ses dosyası en fazla 30 MB olmalı.',
    audio_too_long: 'Ses kaydı en fazla 10 dakika olmalı.',
    fetch_timeout: 'Ses indirme zaman aşımına uğradı. Daha küçük bir dosya dene veya doğrudan yükle.',
    too_many_redirects: 'Bu bağlantı çok fazla yönlendiriliyor. Son doğrudan ses bağlantısını kullan.',
    remote_error: 'Ses aktarımı başarısız oldu veya kesildi (boyut sınırı nedeniyle de olabilir). Yarım dosya çevrilmedi. Dosyayı yüklemeyi dene.',
    decode_failed: 'Tarayıcı bu ses dosyasını çözemedi. Geçerli bir MP3, WAV, OGG veya FLAC dosyası dene.',
    unavailable: 'Sunucuda bağlantıyla aktarma henüz yapılandırılmamış. Dosya yükleme çalışmaya devam ediyor.',
    forbidden: 'Bu sayfadan bağlantıyla aktarma kullanılamıyor. Resmî uygulamayı kullan veya dosya yükle.',
    rate_limited: 'Çok fazla ses aktarma isteği gönderildi. Bir dakika bekleyip tekrar dene.',
    transcription_failed: 'Ses transkripsiyonu tamamlanamadı. Daha kısa bir kayıt veya Web Audio destekli bir tarayıcı dene.',
  },
};

export function mediaErrorMessage(error, language = 'en') {
  const messages = language === 'tr' ? ERROR_COPY.tr : ERROR_COPY.en;
  const key = error.code === 'provider_restricted' && ['youtube', 'spotify'].includes(error.provider) ? error.provider : error.code;
  return Object.hasOwn(messages, key) && typeof messages[key] === 'string' ? messages[key] : messages.remote_error;
}
