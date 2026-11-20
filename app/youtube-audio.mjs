import { AUDIO_SNIFF_BYTES, MAX_AUDIO_BYTES, MediaError, cancelMediaBody,
  mediaDeadline, readLimitedBody, validateAudioPrefix } from "../shared/audio-media.mjs";
import { audioApiUrl } from "./muscriptor.mjs";
import { resolveYoutubeSong } from "./youtube-song.mjs";

export const YOUTUBE_AUDIO_API_PATH = "api/youtube-audio";
const VIDEO_ID = /^[\w-]{11}$/;

export function youtubeVideoId(value) {
  const input = value.trim();
  if (!input) return null;

  try {
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    if (!["https:", "http:"].includes(url.protocol) || url.port || url.username || url.password) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const host = url.hostname.toLowerCase();
    let id;
    if (host === "youtu.be" && parts.length === 1) {
      id = parts[0];
    } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else if (parts.length === 2 && ["shorts", "live", "embed"].includes(parts[0])) id = parts[1];
    }
    return id && VIDEO_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function isYoutubeVideoId(value) {
  return typeof value === "string" && VIDEO_ID.test(value);
}

/** @param {string} videoId @param {{signal?: AbortSignal}} [options] */
export async function downloadYoutubeAudio(videoId, { signal } = {}) {
  if (!isYoutubeVideoId(videoId)) throw new MediaError("invalid_url");
  const deadline = mediaDeadline(100_000, signal);
  let response;
  try {
    response = await deadline.wait(fetch(audioApiUrl(YOUTUBE_AUDIO_API_PATH), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
      signal: deadline.signal,
    }));
    if (response.status === 413 || Number(response.headers.get("Content-Length")) > MAX_AUDIO_BYTES) {
      throw new MediaError("file_too_large");
    }
    if (response.status === 429) throw new MediaError("rate_limited");
    if (!response.ok || !response.headers.get("Content-Type")?.startsWith("audio/mpeg")) {
      throw new MediaError("youtube_failed");
    }
    const parts = await readLimitedBody(response, MAX_AUDIO_BYTES, deadline);
    const file = new File(parts, `youtube-${videoId}.mp3`, { type: "audio/mpeg" });
    validateAudioPrefix(new Uint8Array(await file.slice(0, AUDIO_SNIFF_BYTES).arrayBuffer()), file.type);
    return { file, song: await resolveYoutubeSong(response.headers, videoId, deadline.signal) };
  } catch (error) {
    const reason = signal?.aborted ? signal.reason : deadline.signal.aborted ? deadline.signal.reason
      : error instanceof MediaError ? error : new MediaError("youtube_failed");
    deadline.abort(reason);
    await cancelMediaBody(response?.body);
    throw reason;
  } finally {
    deadline.close();
  }
}
