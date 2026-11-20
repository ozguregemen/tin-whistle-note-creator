import { normalizeSearchText } from "./search-relevance.mjs";

export const YOUTUBE_SONG_HEADER = "X-YouTube-Song";

function compact(value, maxLength) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

const VIDEO_LABEL = /\b(?:official (?:music )?(?:video|audio|lyric video)|lyrics? video|visualizer|tutorials?|lesson|play[ -]along|4k|1080p|hd)\b/i;
const VIDEO_SUFFIX = /(?:^|[\s|–—-])(?:official (?:music )?(?:video|audio|lyric video)|(?:original |official )?music video|lyrics? video|visualizer|full hd|ultra hd|4k|8k|\d{3,4}p|hd|uhd|hq)\s*$/i;
export const YOUTUBE_THEME_LABEL = /\b(?:(main title|opening|intro|ending|outro|closing)(?: (?:credits|theme(?: (?:song|tune))?|song|music))?|(?:main |title |tv )?theme(?: (?:song|tune))?|(?:original )?soundtrack|ost)$/i;

export function stripYoutubeTitleLabels(value) {
  const segments = compact(value, 200).split(/\s+\|\s+/);
  while (segments.length > 1 && VIDEO_LABEL.test(segments.at(-1))) segments.pop();
  let title = segments.join(" | ");
  let previous;
  do {
    previous = title;
    title = title.replace(/\s*(?:\(([^()]*)\)|\[([^\[\]]*)\])\s*$/u,
      (suffix, parens, brackets) => VIDEO_LABEL.test(parens ?? brackets) ? "" : suffix)
      .replace(VIDEO_SUFFIX, "").replace(/[\s|–—-]+$/u, "").trim();
  } while (title !== previous);
  return title;
}

export function youtubeSongFromVideo({ title, author_name: author } = {}) {
  const videoTitle = compact(title, 200);
  if (!videoTitle) return null;
  const heading = stripYoutubeTitleLabels(videoTitle);
  const topic = compact(author, 130).match(/^(.+?)\s+-\s+Topic$/i);
  const parts = heading.match(/^(.+?)\s+[–—-]\s+(.+)$/);
  if (parts && parts[2].match(YOUTUBE_THEME_LABEL)?.index === 0) {
    return { title: `${parts[1]} ${parts[2]}`, artist: topic ? compact(topic[1], 120) : "" };
  }
  if (parts && !VIDEO_LABEL.test(parts[2])) {
    const [, artist, track] = parts;
    return { title: track, artist: compact(artist, 120) };
  }
  return { title: heading || videoTitle, artist: topic ? compact(topic[1], 120) : "" };
}

export function readYoutubeSong(headers) {
  const value = headers.get(YOUTUBE_SONG_HEADER);
  if (!value || value.length > 4096) return null;
  try {
    const data = JSON.parse(decodeURIComponent(value));
    const title = compact(data?.title, 200);
    return title ? { title, artist: compact(data?.artist, 120) } : null;
  } catch {
    return null;
  }
}

export async function resolveYoutubeSong(headers, videoId, signal) {
  const song = readYoutubeSong(headers);
  if (song) return song;
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || signal?.aborted) return null;

  const url = new URL("https://www.youtube.com/oembed");
  url.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  url.searchParams.set("format", "json");
  const timeout = AbortSignal.timeout(4500);
  try {
    const response = await fetch(url, {
      credentials: "omit", referrerPolicy: "no-referrer",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok || Number(response.headers.get("Content-Length")) > 16384) return null;
    return youtubeSongFromVideo(await response.json());
  } catch {
    return null;
  }
}

function tempoTitle(value) {
  return normalizeSearchText(compact(value, 200)).replace(/^the /, "").replace(/ theme song$/, " theme");
}

export function youtubeTempoLookupTitle(title) {
  return compact(title, 200).trim().replace(/\btheme song$/i, "Theme");
}

export function youtubeTempoMatches(song, tempo) {
  if (!song?.title || !tempo?.title || tempoTitle(song.title) !== tempoTitle(tempo.title)) return false;
  if (!song.artist) return true;
  return normalizeSearchText(compact(song.artist, 120)) === normalizeSearchText(compact(tempo.artist, 120));
}
