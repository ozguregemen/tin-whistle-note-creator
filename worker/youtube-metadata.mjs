import { cancelMediaBody, mediaDeadline, readLimitedBody } from "../shared/audio-media.mjs";
import { youtubeSongFromVideo } from "../app/youtube-song.mjs";

export async function fetchYoutubeSong(videoId, fetchFn, signal) {
  const url = new URL("https://www.youtube.com/oembed");
  url.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  url.searchParams.set("format", "json");
  const deadline = mediaDeadline(3500, signal);
  let response;
  try {
    response = await deadline.wait(fetchFn(url.href, {
      headers: { Accept: "application/json" }, redirect: "error", signal: deadline.signal,
    }));
    if (!response.ok || Number(response.headers.get("Content-Length")) > 16384) return null;
    const parts = await readLimitedBody(response, 16384, deadline);
    return youtubeSongFromVideo(JSON.parse(await new Blob(parts).text()));
  } catch {
    return null;
  } finally {
    deadline.close();
    await cancelMediaBody(response?.body);
  }
}
