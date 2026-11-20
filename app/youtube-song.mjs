import { normalizeSearchText } from "./search-relevance.mjs";

export const YOUTUBE_SONG_HEADER = "X-YouTube-Song";

function compact(value, maxLength) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

const VIDEO_LABEL = /\b(?:official (?:music )?(?:video|audio|lyric video)|lyrics? video|visualizer|tutorials?|lesson|play[ -]along|4k|1080p|hd)\b/i;

export function youtubeSongFromVideo({ title, author_name: author } = {}) {
  const videoTitle = compact(title, 200);
  if (!videoTitle) return null;
  const segments = videoTitle.split(/\s+\|\s+/);
  while (segments.length > 1 && VIDEO_LABEL.test(segments.at(-1))) segments.pop();
  const heading = segments.join(" | ").replace(/\s*(?:\(([^()]*)\)|\[([^\[\]]*)\])\s*$/u,
    (suffix, parens, brackets) => VIDEO_LABEL.test(parens ?? brackets) ? "" : suffix).trim();
  const parts = heading.match(/^(.+?)\s+[–—-]\s+(.+)$/);
  if (parts && !VIDEO_LABEL.test(parts[2])) {
    const [, artist, track] = parts;
    return { title: track, artist: compact(artist, 120) };
  }
  const topic = compact(author, 130).match(/^(.+?)\s+-\s+Topic$/i);
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
