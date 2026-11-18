import { MAX_AUDIO_BYTES } from "../shared/audio-limits.mjs";
import { MUSCRIPTOR_LARGE } from "../app/muscriptor.mjs";
import { isYoutubeVideoId } from "../app/youtube-audio.mjs";

const MAX_MULTIPART_BYTES = MAX_AUDIO_BYTES + 64 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };
const BYTE_TRANSPORT = "sse-bytes";

function reportAudioServiceError(message, error) {
  const details = String(error?.message ?? "")
    .replace(/https?:\/\/[^\s"'<>]+/g, "[endpoint]")
    .replace(/[0-9a-f]{64}/gi, "[secret]")
    .slice(0, 180);
  console.warn(message, error?.name, details);
}

function getAudioService(env) {
  const urlValue = env.AUDIO_SERVICE_URL ?? globalThis.process?.env?.AUDIO_SERVICE_URL;
  const token = env.AUDIO_SERVICE_TOKEN ?? globalThis.process?.env?.AUDIO_SERVICE_TOKEN;
  if (!urlValue || !token) return null;
  try {
    const url = new URL(urlValue);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    return { url, authorization: `Bearer ${token}` };
  } catch {
    // An invalid setting leaves the local transcription provider active.
  }
  return null;
}

function audioError(status) {
  return Response.json({ error: "Audio transcription unavailable" }, { status, headers: NO_STORE });
}

async function audioCapabilities(service) {
  try {
    const response = service && await fetch(new URL("capabilities", service.url).href, {
      headers: { Authorization: service.authorization },
      redirect: "manual",
      signal: AbortSignal.timeout(2600),
    });
    if (response?.ok) {
      const capabilities = await response.json();
      return {
        provider: capabilities.model === MUSCRIPTOR_LARGE ? MUSCRIPTOR_LARGE : "basic-pitch",
        youtubeMp3: capabilities.youtubeMp3 === true,
      };
    }
    if (service) {
      console.warn("Audio service capability check returned HTTP", response?.status);
      await response?.body?.cancel();
    }
  } catch (error) {
    reportAudioServiceError("Audio service capability check failed", error);
  }
  return { provider: "basic-pitch", youtubeMp3: false };
}

export async function handleAudioTranscription(request, env) {
  const service = getAudioService(env);
  if (request.method === "GET") {
    if (!service && (env.AUDIO_SERVICE_URL || env.AUDIO_SERVICE_TOKEN || globalThis.process?.env?.AUDIO_SERVICE_URL)) {
      console.warn("Audio service configuration is incomplete or invalid");
    }
    return Response.json(await audioCapabilities(service), { headers: NO_STORE });
  }
  if (request.method !== "POST") return audioError(405);
  if (!service) return audioError(503);
  if (request.headers.get("X-Transcription-Provider") !== MUSCRIPTOR_LARGE) return audioError(403);

  const contentType = request.headers.get("Content-Type");
  if (!request.body || !contentType?.toLowerCase().startsWith("multipart/form-data;")) return audioError(400);
  const bytes = Number(request.headers.get("Content-Length"));
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return audioError(411);
  if (bytes > MAX_MULTIPART_BYTES) return audioError(413);

  const headers = new Headers({
    "Content-Type": contentType,
    Accept: "text/event-stream",
    Authorization: service.authorization,
  });
  // Cloudflare Quick Tunnels can proxy bytes, but do not support the SSE media type.
  const useByteTransport = service.url.hostname.endsWith(".trycloudflare.com");
  if (useByteTransport) headers.set("X-Audio-Transport", BYTE_TRANSPORT);
  try {
    const response = await fetch(new URL("transcribe", service.url).href, {
      method: "POST",
      headers,
      body: request.body,
      redirect: "manual",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15 * 60 * 1000)]),
    });
    const contentType = response.headers.get("Content-Type")?.split(";")[0];
    const audioStream = useByteTransport
      ? contentType === "application/octet-stream" && response.headers.get("X-Audio-Transport") === BYTE_TRANSPORT
      : contentType === "text/event-stream";
    if (response.ok && response.body && response.headers.get("X-Audio-Model") === MUSCRIPTOR_LARGE && audioStream) {
      return new Response(response.body, { headers: { ...NO_STORE, "Content-Type": "text/event-stream" } });
    }
    await response.body?.cancel();
    if ([400, 413, 429, 503].includes(response.status)) return audioError(response.status);
  } catch (error) {
    reportAudioServiceError("Audio transcription request failed", error);
  }
  return audioError(502);
}

export async function handleYoutubeAudio(request, env) {
  if (request.method !== "POST") return audioError(405);
  const service = getAudioService(env);
  if (!service) return audioError(503);
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") return audioError(400);
  const size = Number(request.headers.get("Content-Length"));
  if (!Number.isSafeInteger(size) || size <= 0 || size > 256) return audioError(400);

  const body = await request.json().catch(() => null);
  if (!isYoutubeVideoId(body?.videoId)) return audioError(400);

  try {
    const response = await fetch(new URL(`youtube/${body.videoId}/mp3`, service.url).href, {
      method: "POST",
      headers: { Accept: "audio/mpeg", Authorization: service.authorization },
      redirect: "manual",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(95_000)]),
    });
    if (response.ok && response.body && response.headers.get("Content-Type")?.startsWith("audio/mpeg")) {
      const length = Number(response.headers.get("Content-Length"));
      if (Number.isSafeInteger(length) && length > 0 && length <= MAX_AUDIO_BYTES) {
        return new Response(response.body, { headers: {
          ...NO_STORE,
          "Content-Type": "audio/mpeg",
          "Content-Length": String(length),
          "Content-Disposition": `attachment; filename="youtube-${body.videoId}.mp3"`,
        } });
      }
    }
    await response.body?.cancel();
    if ([404, 413, 422, 429, 503, 504].includes(response.status)) return audioError(response.status);
  } catch (error) {
    reportAudioServiceError("YouTube audio request failed", error);
  }
  return audioError(502);
}
